// Remaining이 854.70인 NFT들을 찾아서 다시 조회하고 최신화하는 스크립트
import { saveGlobalClaimData, getGlobalClaimData } from './db.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, 'nft_data.db');
const db = new Database(dbPath);

const CLAIM_CONTRACT_ADDRESS = '0x6a9c6b5507e322aa00eb9c45e80c07ab63acabb6';
const ZERO_G_RPC = 'https://evmrpc.0g.ai';

// RequestQueue 클래스
class RequestQueue {
  constructor() {
    this.queue = [];
    this.running = 0;
    this.maxConcurrent = 15;
    this.rateLimitDelay = 50;
    this.lastRequestTime = 0;
    this.rateLimitErrorCount = 0;
    this.backoffDelay = 0;
  }

  async add(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    this.running++;
    const { fn, resolve, reject } = this.queue.shift();

    try {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      const delay = Math.max(this.rateLimitDelay, this.backoffDelay);
      if (timeSinceLastRequest < delay) {
        await new Promise(resolve => setTimeout(resolve, delay - timeSinceLastRequest));
      }
      this.lastRequestTime = Date.now();

      const result = await fn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.running--;
      this.process();
    }
  }

  handleRateLimitError() {
    this.rateLimitErrorCount++;
    this.backoffDelay = Math.min(2000 * Math.pow(2, this.rateLimitErrorCount - 1), 30000);
    this.maxConcurrent = Math.max(5, this.maxConcurrent - 3);
    console.warn(`[RequestQueue] Rate limit 오류 발생. 백오프: ${this.backoffDelay}ms, 동시 요청 수: ${this.maxConcurrent}`);
    
    setTimeout(() => {
      this.rateLimitErrorCount = Math.max(0, this.rateLimitErrorCount - 1);
      this.maxConcurrent = Math.min(15, this.maxConcurrent + 1);
    }, 10000);
  }
}

const requestQueue = new RequestQueue();

// 클레임 데이터 조회 함수 (성공할 때까지 무한 재시도)
async function getClaimData(tokenId, retryCount = 0) {
  const baseRetryDelay = 1000;

  try {
    const { ethers } = await import('ethers');
    
    const network = new ethers.Network('0G Mainnet', 16661);
    const provider = new ethers.JsonRpcProvider(ZERO_G_RPC, network, {
      polling: false,
      batchMaxCount: 1,
    });
    
    const CONTRACT_ABI = [
      'function allocationPerToken() view returns (uint256)',
      'function init_unlock() view returns (uint256)',
      'function partPercentage() view returns (uint256)',
      {
        name: 'claimData',
        type: 'function',
        inputs: [{ name: 'credential', type: 'uint256' }],
        outputs: [
          { name: 'consumed', type: 'uint256' },
          { name: 'claimed', type: 'uint256' }
        ],
        stateMutability: 'view'
      }
    ];
    
    const contract = new ethers.Contract(CLAIM_CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    
    let allocationPerToken, initUnlock, partPercentage, claimDataResult;
    
    try {
      allocationPerToken = await requestQueue.add(() => contract.allocationPerToken());
      await new Promise(resolve => setTimeout(resolve, 50));
      
      initUnlock = await requestQueue.add(() => contract.init_unlock());
      await new Promise(resolve => setTimeout(resolve, 50));
      
      partPercentage = await requestQueue.add(() => contract.partPercentage());
      await new Promise(resolve => setTimeout(resolve, 50));
      
      try {
        claimDataResult = await requestQueue.add(() => contract.claimData(parseInt(tokenId, 10)));
      } catch (error) {
        claimDataResult = null;
      }
    } catch (error) {
      const isRateLimitError = error.message?.includes('rate exceeded') || 
                               error.message?.includes('Too many requests') ||
                               error.code === -32005;
      
      if (isRateLimitError) {
        requestQueue.handleRateLimitError();
        const backoffDelay = baseRetryDelay * Math.pow(2, retryCount);
        if (retryCount % 10 === 0) {
          console.warn(`[Token ${tokenId}] Rate limit 오류 (재시도: ${retryCount}), ${backoffDelay}ms 대기...`);
        }
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
      
      const retryDelay = isRateLimitError 
        ? Math.min(baseRetryDelay * Math.pow(2, Math.min(retryCount, 5)), 20000)
        : baseRetryDelay * Math.min(retryCount + 1, 8);
      
      if (retryCount % 10 === 0) {
        console.warn(`[Token ${tokenId}] 재시도 ${retryCount}회, ${retryDelay}ms 대기...`);
      }
      
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      return getClaimData(tokenId, retryCount + 1);
    }
    
    const allocation = parseFloat(ethers.formatEther(allocationPerToken));
    const initUnlockValue = parseFloat(ethers.formatEther(initUnlock));
    const partPercentageValue = parseFloat(ethers.formatEther(partPercentage));
    
    let consumed = 0, claimed = 0;
    if (claimDataResult) {
      if (Array.isArray(claimDataResult)) {
        consumed = parseFloat(ethers.formatEther(claimDataResult[0]));
        claimed = parseFloat(ethers.formatEther(claimDataResult[1]));
      } else if (typeof claimDataResult === 'object') {
        consumed = parseFloat(ethers.formatEther(claimDataResult.consumed || claimDataResult[0] || '0'));
        claimed = parseFloat(ethers.formatEther(claimDataResult.claimed || claimDataResult[1] || '0'));
      }
    }
    
    return {
      allocationPerToken: allocation.toFixed(2),
      consumed: consumed.toFixed(2),
      claimed: claimed.toFixed(2),
      partPercentage: partPercentageValue.toFixed(4),
      initUnlock: initUnlockValue.toFixed(4),
    };
  } catch (error) {
    const retryDelay = baseRetryDelay * Math.min(retryCount + 1, 8);
    
    if (retryCount % 10 === 0) {
      console.warn(`[Token ${tokenId}] 네트워크 오류 재시도 ${retryCount}회, ${retryDelay}ms 대기...`);
    }
    
    await new Promise(resolve => setTimeout(resolve, retryDelay));
    return getClaimData(tokenId, retryCount + 1);
  }
}

// totalRemaining 계산 함수 (nodeCheckerApi.ts와 동일한 로직)
function calculateTotalRemaining(claimData) {
  if (!claimData) return null;
  
  const allocation = parseFloat(claimData.allocationPerToken || claimData.allocation_per_token || '0');
  const consumed = parseFloat(claimData.consumed || '0');
  const claimed = parseFloat(claimData.claimed || '0');
  const partPercentage = parseFloat(claimData.partPercentage || claimData.part_percentage || '0.33');
  
  // Part1 계산
  const part1Total = allocation * partPercentage;
  const part1RemainingShare = Math.max(0, part1Total - consumed);
  
  // Part2는 GraphQL의 totalReward가 필요하므로 여기서는 part1Remaining만 반환
  // 실제 totalRemaining은 part1Remaining + part2Remaining이지만,
  // part2Remaining은 totalReward가 필요하므로 여기서는 part1Remaining만 계산
  // 사용자가 요청한 854.70은 전체 allocation이므로, consumed가 0이면 remaining은 allocation과 같음
  // 하지만 실제로는 part1과 part2로 나뉘므로, 단순히 allocation - consumed로 계산할 수 없음
  
  // 일단 allocation이 854.70이고 consumed가 0이면 remaining이 854.70이 될 수 있음
  // 하지만 정확한 계산을 위해서는 part2의 totalReward가 필요함
  
  // 사용자 요청에 따라: Remaining이 854.70인 경우를 찾으므로
  // allocation이 854.70이고 consumed가 0인 경우를 찾거나
  // 또는 계산된 totalRemaining이 854.70인 경우를 찾아야 함
  
  // 간단하게: allocation이 854.70이고 consumed가 0 또는 매우 작은 경우
  return {
    allocation,
    consumed,
    claimed,
    partPercentage,
    part1Total,
    part1RemainingShare,
    // totalRemaining은 part2 정보가 없어서 정확히 계산할 수 없지만,
    // allocation이 854.70이고 consumed가 0이면 remaining이 854.70에 가까울 것
  };
}

// 메인 함수
async function updateRemaining85470() {
  console.log(`\n=== Remaining이 854.70인 NFT 찾기 및 업데이트 시작 ===\n`);
  
  const startTime = Date.now();
  const stats = {
    found: 0,
    updated: 0,
    failed: 0,
    unchanged: 0
  };
  
  try {
    // DB에서 모든 데이터 조회
    console.log('[1단계] DB에서 Remaining이 854.70인 NFT 찾는 중...\n');
    
    const allTokens = db.prepare(`
      SELECT token_id, allocation_per_token, consumed, claimed, part_percentage, init_unlock
      FROM global_claim_data
      ORDER BY CAST(token_id AS INTEGER)
    `).all();
    
    console.log(`[검색 대상] 총 ${allTokens.length}개 토큰\n`);
    
    const tokensToUpdate = [];
    
    for (const row of allTokens) {
      const claimData = {
        allocationPerToken: row.allocation_per_token,
        consumed: row.consumed,
        claimed: row.claimed,
        partPercentage: row.part_percentage,
        initUnlock: row.init_unlock
      };
      
      const calc = calculateTotalRemaining(claimData);
      
      // Remaining이 854.70인 경우 찾기
      // allocation이 854.70이고 consumed가 0이거나 매우 작은 경우
      // 또는 allocation이 854.70이고 remaining이 854.70에 가까운 경우
      const allocation = parseFloat(row.allocation_per_token || '0');
      const consumed = parseFloat(row.consumed || '0');
      
      // allocation이 854.70이고 consumed가 0이면 remaining이 854.70
      // 또는 allocation이 854.70이고 consumed가 매우 작으면 remaining이 약 854.70
      if (Math.abs(allocation - 854.70) < 0.01 && consumed < 0.01) {
        tokensToUpdate.push({
          tokenId: row.token_id,
          current: claimData,
          reason: `allocation: ${allocation}, consumed: ${consumed}`
        });
        stats.found++;
      }
    }
    
    console.log(`[1단계 완료] Remaining이 854.70인 NFT: ${stats.found}개 발견\n`);
    
    if (tokensToUpdate.length === 0) {
      console.log('✅ Remaining이 854.70인 NFT가 없습니다.\n');
      db.close();
      return;
    }
    
    // 처음 10개만 샘플 출력
    console.log(`[발견된 NFT 샘플 (처음 10개)]:`);
    tokensToUpdate.slice(0, 10).forEach(({ tokenId, reason }) => {
      console.log(`  - Token #${tokenId}: ${reason}`);
    });
    if (tokensToUpdate.length > 10) {
      console.log(`  ... 외 ${tokensToUpdate.length - 10}개`);
    }
    console.log('');
    
    // 2단계: 발견된 NFT들을 다시 조회하고 업데이트
    console.log(`[2단계] ${tokensToUpdate.length}개 NFT 데이터 최신화 시작...\n`);
    
    let updateCount = 0;
    for (const { tokenId, current } of tokensToUpdate) {
      updateCount++;
      
      try {
        if (updateCount % 10 === 0 || updateCount === tokensToUpdate.length) {
          console.log(`[업데이트 진행] ${updateCount}/${tokensToUpdate.length}개 (성공: ${stats.updated}, 실패: ${stats.failed}, 변경없음: ${stats.unchanged})`);
        }
        
        const newClaimData = await getClaimData(tokenId);
        
        // 데이터가 변경되었는지 확인
        const isChanged = 
          newClaimData.allocationPerToken !== current.allocationPerToken ||
          newClaimData.consumed !== current.consumed ||
          newClaimData.claimed !== current.claimed ||
          newClaimData.partPercentage !== current.partPercentage ||
          newClaimData.initUnlock !== current.initUnlock;
        
        if (isChanged) {
          saveGlobalClaimData(tokenId, newClaimData);
          stats.updated++;
          
          if (updateCount <= 5 || updateCount % 100 === 0) {
            console.log(`  ✅ Token #${tokenId} 업데이트 완료`);
            console.log(`     이전: allocation=${current.allocationPerToken}, consumed=${current.consumed}, claimed=${current.claimed}`);
            console.log(`     최신: allocation=${newClaimData.allocationPerToken}, consumed=${newClaimData.consumed}, claimed=${newClaimData.claimed}`);
          }
        } else {
          stats.unchanged++;
          if (updateCount <= 5) {
            console.log(`  ⏭️  Token #${tokenId} 변경사항 없음`);
          }
        }
      } catch (error) {
        stats.failed++;
        console.error(`  ❌ Token #${tokenId} 업데이트 실패: ${error.message}`);
      }
      
      // 토큰 사이 딜레이
      if (updateCount < tokensToUpdate.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log(`\n=== 업데이트 완료 (소요 시간: ${elapsed}초) ===`);
    console.log(`📊 최종 통계:`);
    console.log(`   - 발견된 NFT: ${stats.found}개`);
    console.log(`   - 업데이트 성공: ${stats.updated}개`);
    console.log(`   - 변경사항 없음: ${stats.unchanged}개`);
    console.log(`   - 업데이트 실패: ${stats.failed}개`);
    
  } catch (error) {
    console.error('\n❌ 업데이트 중 오류 발생:', error);
    throw error;
  } finally {
    db.close();
  }
}

// 메인 실행
updateRemaining85470().catch(console.error);


