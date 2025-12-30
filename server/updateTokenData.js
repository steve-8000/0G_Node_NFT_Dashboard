// 특정 토큰 ID의 클레임 데이터를 다시 수집하여 DB 업데이트
import { saveGlobalClaimData, getGlobalClaimData } from './db.js';

const CLAIM_CONTRACT_ADDRESS = '0x6a9c6b5507e322aa00eb9c45e80c07ab63acabb6';
// 0G Network RPC
const ZERO_G_RPC = 'https://evmrpc.0g.ai';

// RequestQueue 클래스 (buildClaimData.js와 동일)
class RequestQueue {
  constructor(maxConcurrent = 15, rateLimitDelay = 50) {
    this.queue = [];
    this.running = 0;
    this.maxConcurrent = maxConcurrent;
    this.rateLimitDelay = rateLimitDelay;
    this.lastRequestTime = 0;
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
      // Rate limit 방지
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      if (timeSinceLastRequest < this.rateLimitDelay) {
        await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay - timeSinceLastRequest));
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
}

const requestQueue = new RequestQueue(15, 50);

// 클레임 데이터 조회 (무한 재시도)
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

// 특정 토큰 ID 업데이트
async function updateTokenData(tokenId) {
  try {
    console.log(`[Token ${tokenId}] 데이터 수집 시작...`);
    
    const claimData = await getClaimData(tokenId);
    
    // DB에 저장
    saveGlobalClaimData(tokenId, claimData);
    
    console.log(`[Token ${tokenId}] ✅ 업데이트 완료:`, {
      allocationPerToken: claimData.allocationPerToken,
      consumed: claimData.consumed,
      claimed: claimData.claimed,
      partPercentage: claimData.partPercentage,
      initUnlock: claimData.initUnlock
    });
    
    return true;
  } catch (error) {
    console.error(`[Token ${tokenId}] ❌ 업데이트 실패:`, error.message);
    return false;
  }
}

// 여러 토큰 ID 업데이트
async function updateMultipleTokens(tokenIds) {
  const results = {
    success: [],
    failed: []
  };

  for (const tokenId of tokenIds) {
    const success = await updateTokenData(tokenId);
    if (success) {
      results.success.push(tokenId);
    } else {
      results.failed.push(tokenId);
    }
    
    // 토큰 사이에 짧은 딜레이
    if (tokenIds.indexOf(tokenId) < tokenIds.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  return results;
}

// 메인 실행
async function main() {
  const tokenIds = process.argv.slice(2);
  
  if (tokenIds.length === 0) {
    console.log('사용법: node updateTokenData.js <tokenId1> [tokenId2] [tokenId3] ...');
    console.log('예시: node updateTokenData.js 93683');
    console.log('예시: node updateTokenData.js 93683 93684 93685');
    process.exit(1);
  }

  console.log(`\n=== ${tokenIds.length}개 토큰 데이터 업데이트 시작 ===\n`);
  
  const startTime = Date.now();
  const results = await updateMultipleTokens(tokenIds);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log(`\n=== 업데이트 완료 (소요 시간: ${elapsed}초) ===`);
  console.log(`✅ 성공: ${results.success.length}개`);
  console.log(`❌ 실패: ${results.failed.length}개`);
  
  if (results.success.length > 0) {
    console.log(`성공한 토큰: ${results.success.join(', ')}`);
  }
  
  if (results.failed.length > 0) {
    console.log(`실패한 토큰: ${results.failed.join(', ')}`);
  }
}

// 메인 실행
main().catch(console.error);

export { updateTokenData, updateMultipleTokens };

