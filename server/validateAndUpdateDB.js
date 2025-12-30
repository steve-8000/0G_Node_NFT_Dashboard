// 전체 DB를 검증하고 실패/누락된 데이터를 업데이트하는 스크립트
import { saveGlobalClaimData, getGlobalClaimData, getGlobalClaimDataStats } from './db.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, 'nft_data.db');
const db = new Database(dbPath);

const CLAIM_CONTRACT_ADDRESS = '0x6a9c6b5507e322aa00eb9c45e80c07ab63acabb6';
const ZERO_G_RPC = 'https://evmrpc.0g.ai';
const MAX_TOKEN_ID = 126100;

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

// 데이터 유효성 검증
function isValidClaimData(data) {
  if (!data) return false;
  
  // 필수 필드 확인
  if (!data.allocation_per_token || !data.part_percentage || !data.init_unlock) {
    return false;
  }
  
  // 값이 null이거나 빈 문자열인지 확인
  const fields = ['allocation_per_token', 'consumed', 'claimed', 'part_percentage', 'init_unlock'];
  for (const field of fields) {
    if (data[field] === null || data[field] === undefined || data[field] === '') {
      return false;
    }
  }
  
  // 숫자 값이 유효한지 확인
  try {
    const allocation = parseFloat(data.allocation_per_token);
    const partPercentage = parseFloat(data.part_percentage);
    const initUnlock = parseFloat(data.init_unlock);
    
    if (isNaN(allocation) || isNaN(partPercentage) || isNaN(initUnlock)) {
      return false;
    }
    
    // 기본 범위 검증
    if (allocation <= 0 || partPercentage < 0 || partPercentage > 1 || initUnlock < 0 || initUnlock > 1) {
      return false;
    }
  } catch (error) {
    return false;
  }
  
  return true;
}

// 진행 상태 저장
async function saveProgress(currentTokenId, status, stats) {
  const progress = {
    currentTokenId,
    status,
    stats,
    timestamp: Date.now()
  };
  
  const fs = await import('fs');
  const progressPath = join(__dirname, 'validateAndUpdateDB_progress.json');
  fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
}

// 메인 검증 및 업데이트 함수
async function validateAndUpdate() {
  console.log(`\n=== DB 검증 및 업데이트 시작 ===\n`);
  console.log(`[검증 범위] Token ID 1 ~ ${MAX_TOKEN_ID}\n`);
  
  const startTime = Date.now();
  const stats = {
    total: 0,
    valid: 0,
    invalid: 0,
    missing: 0,
    updated: 0,
    failed: 0
  };
  
  const invalidTokenIds = [];
  const missingTokenIds = [];
  
  try {
    // 1단계: DB에 있는 모든 토큰 데이터 검증
    console.log('[1단계] DB에 저장된 데이터 검증 중...\n');
    
    const existingTokens = db.prepare(`
      SELECT token_id, allocation_per_token, consumed, claimed, part_percentage, init_unlock
      FROM global_claim_data
      ORDER BY CAST(token_id AS INTEGER)
    `).all();
    
    stats.total = existingTokens.length;
    console.log(`[검증 대상] DB에 저장된 토큰: ${stats.total}개\n`);
    
    let checkedCount = 0;
    for (const row of existingTokens) {
      checkedCount++;
      const tokenId = row.token_id;
      
      if (checkedCount % 1000 === 0 || checkedCount === stats.total) {
        console.log(`[검증 진행] ${checkedCount}/${stats.total}개 확인 (유효: ${stats.valid}, 무효: ${stats.invalid})`);
      }
      
      if (isValidClaimData(row)) {
        stats.valid++;
      } else {
        stats.invalid++;
        invalidTokenIds.push(tokenId);
        if (invalidTokenIds.length <= 10) {
          console.log(`  ⚠️  무효 데이터 발견: Token #${tokenId}`);
        }
      }
    }
    
    console.log(`\n[1단계 완료] 유효: ${stats.valid}개, 무효: ${stats.invalid}개\n`);
    
    // 2단계: 누락된 토큰 ID 찾기
    console.log('[2단계] 누락된 토큰 ID 확인 중...\n');
    
    const existingTokenIdSet = new Set(existingTokens.map(row => row.token_id));
    
    for (let tokenId = 1; tokenId <= MAX_TOKEN_ID; tokenId++) {
      const tokenIdStr = tokenId.toString();
      if (!existingTokenIdSet.has(tokenIdStr)) {
        missingTokenIds.push(tokenIdStr);
      }
      
      if (tokenId % 10000 === 0) {
        console.log(`[누락 확인 진행] ${tokenId}/${MAX_TOKEN_ID} 확인 (누락: ${missingTokenIds.length}개)`);
      }
    }
    
    stats.missing = missingTokenIds.length;
    console.log(`\n[2단계 완료] 누락된 토큰: ${stats.missing}개\n`);
    
    // 3단계: 무효/누락된 데이터 업데이트
    const tokensToUpdate = [...invalidTokenIds, ...missingTokenIds];
    
    if (tokensToUpdate.length === 0) {
      console.log('✅ 모든 데이터가 유효하고 완전합니다!\n');
      return;
    }
    
    console.log(`[3단계] ${tokensToUpdate.length}개 토큰 데이터 업데이트 시작...\n`);
    console.log(`  - 무효 데이터: ${invalidTokenIds.length}개`);
    console.log(`  - 누락 데이터: ${missingTokenIds.length}개\n`);
    
    let updateCount = 0;
    for (const tokenId of tokensToUpdate) {
      updateCount++;
      
      try {
        if (updateCount % 10 === 0 || updateCount === tokensToUpdate.length) {
          console.log(`[업데이트 진행] ${updateCount}/${tokensToUpdate.length}개 (성공: ${stats.updated}, 실패: ${stats.failed})`);
        }
        
        const claimData = await getClaimData(tokenId);
        saveGlobalClaimData(tokenId, claimData);
        stats.updated++;
        
        if (updateCount <= 5 || updateCount % 100 === 0) {
          console.log(`  ✅ Token #${tokenId} 업데이트 완료`);
        }
      } catch (error) {
        stats.failed++;
        console.error(`  ❌ Token #${tokenId} 업데이트 실패: ${error.message}`);
      }
      
      // 진행 상태 저장
      if (updateCount % 100 === 0) {
        await saveProgress(tokenId, 'updating', stats);
      }
      
      // 토큰 사이 딜레이
      if (updateCount < tokensToUpdate.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log(`\n=== 검증 및 업데이트 완료 (소요 시간: ${elapsed}초) ===`);
    console.log(`📊 최종 통계:`);
    console.log(`   - 총 검증: ${stats.total}개`);
    console.log(`   - 유효 데이터: ${stats.valid}개`);
    console.log(`   - 무효 데이터: ${stats.invalid}개`);
    console.log(`   - 누락 데이터: ${stats.missing}개`);
    console.log(`   - 업데이트 성공: ${stats.updated}개`);
    console.log(`   - 업데이트 실패: ${stats.failed}개`);
    
    await saveProgress(MAX_TOKEN_ID, 'completed', stats);
    
  } catch (error) {
    console.error('\n❌ 검증 및 업데이트 중 오류 발생:', error);
    await saveProgress(0, 'error', { ...stats, error: error.message });
    throw error;
  } finally {
    db.close();
  }
}

// 메인 실행
validateAndUpdate().catch(console.error);


