// 누락된 토큰 ID를 찾아서 추가 수집하는 스크립트
import { saveGlobalClaimData, getGlobalClaimData, getGlobalClaimDataStats } from './db.js';

const CLAIM_CONTRACT_ADDRESS = '0x6a9c6b5507e322aa00eb9c45e80c07ab63acabb6';
const ZERO_G_RPC = 'https://evmrpc.0g.ai';

// Rate limit 관리를 위한 큐 시스템
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

  add(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.process();
    });
  }

  async process() {
    if (this.backoffDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.backoffDelay));
      this.backoffDelay = 0;
    }

    if (this.running >= this.maxConcurrent) {
      return;
    }

    if (this.queue.length === 0) {
      return;
    }

    this.running++;
    const task = this.queue.shift();

    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    if (timeSinceLastRequest < this.rateLimitDelay) {
      await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay - timeSinceLastRequest));
    }

    this.lastRequestTime = Date.now();

    task()
      .finally(() => {
        this.running--;
        this.process();
      });
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

// 진행 상태 저장
async function saveProgress(tokenId, status, stats) {
  try {
    const fs = await import('fs');
    const progressFile = './fillMissingTokens_progress.json';
    const progress = {
      currentTokenId: tokenId,
      status: status,
      stats: stats,
      timestamp: Date.now()
    };
    fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
  } catch (e) {
    // 파일 쓰기 실패는 무시
  }
}

// 누락된 토큰 찾아서 채우기
async function fillMissingTokens() {
  console.log('[누락된 토큰 찾기 시작] 1 ~ 126100 범위에서 DB에 없는 토큰을 찾아서 수집합니다...');
  
  const stats = getGlobalClaimDataStats();
  const maxTokenId = parseInt(process.argv[2]) || 126100;
  
  console.log(`[최대 토큰 ID] ${maxTokenId}`);
  console.log(`[현재 DB 상태] 총 ${stats.total_count}개 저장됨`);
  
  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;
  const startTime = Date.now();
  const missingTokenIds = [];
  
  // 1부터 maxTokenId까지 확인하여 DB에 없는 토큰 찾기
  console.log(`\n[누락된 토큰 찾기] 1 ~ ${maxTokenId} 범위에서 DB에 없는 토큰 확인 중...`);
  
  const batchSize = 1000;
  for (let startId = 1; startId <= maxTokenId; startId += batchSize) {
    const endId = Math.min(startId + batchSize - 1, maxTokenId);
    
    for (let tokenId = startId; tokenId <= endId; tokenId++) {
      const existing = getGlobalClaimData(tokenId.toString());
      if (!existing) {
        missingTokenIds.push(tokenId.toString());
      } else {
        skipCount++;
      }
    }
    
    if (startId % 10000 === 1 || endId === maxTokenId) {
      const progress = ((endId / maxTokenId) * 100).toFixed(1);
      console.log(`[확인 진행] ${progress}% 완료 (${endId}/${maxTokenId}) | 누락된 토큰: ${missingTokenIds.length}개`);
    }
  }
  
  console.log(`\n[누락된 토큰] 총 ${missingTokenIds.length}개 발견`);
  
  if (missingTokenIds.length === 0) {
    console.log('✅ 모든 토큰이 이미 저장되어 있습니다. 누락된 토큰이 없습니다.');
    return;
  }
  
  // 누락된 토큰들을 배치별로 처리
  console.log(`\n[누락된 토큰 수집 시작] ${missingTokenIds.length}개 토큰 수집...`);
  
  const processBatchSize = 100;
  for (let i = 0; i < missingTokenIds.length; i += processBatchSize) {
    const batch = missingTokenIds.slice(i, i + processBatchSize);
    const batchStartId = parseInt(batch[0]);
    const batchEndId = parseInt(batch[batch.length - 1]);
    
    console.log(`\n[배치 처리] Token ID ${batchStartId} ~ ${batchEndId} (${batch.length}개)`);
    
    // 배치 내에서 병렬 처리
    const batchPromises = batch.map(async (tokenId) => {
      try {
        // 이미 저장되었는지 다시 확인
        const existing = getGlobalClaimData(tokenId);
        if (existing) {
          skipCount++;
          return { tokenId, status: 'skipped' };
        }
        
        // 클레임 데이터 조회
        const claimData = await getClaimData(tokenId);
        
        if (claimData) {
          saveGlobalClaimData(tokenId, claimData);
          successCount++;
          return { tokenId, status: 'success' };
        } else {
          failCount++;
          return { tokenId, status: 'failed' };
        }
      } catch (error) {
        failCount++;
        console.error(`[Token ${tokenId}] 오류:`, error.message || error);
        return { tokenId, status: 'error' };
      }
    });
    
    // 배치 결과 대기
    const batchResults = await Promise.allSettled(batchPromises);
    
    // 실패한 토큰 ID 수집
    const failedTokenIds = [];
    batchResults.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) {
        const { tokenId, status } = result.value;
        if (status === 'failed' || status === 'error') {
          failedTokenIds.push(tokenId);
        }
      }
    });
    
    // 배치 내 실패한 토큰 재시도 (성공할 때까지)
    if (failedTokenIds.length > 0) {
      console.log(`[배치 재시도] ${failedTokenIds.length}개 실패한 토큰 재시도 시작...`);
      
      for (const tokenId of failedTokenIds) {
        let retryCount = 0;
        let success = false;
        
        // 이미 저장되었는지 다시 확인
        try {
          const existing = getGlobalClaimData(tokenId);
          if (existing) {
            success = true;
            failCount--;
            skipCount++;
            continue;
          }
        } catch (e) {
          // 확인 실패는 무시하고 계속
        }
        
        while (!success) {
          try {
            const claimData = await getClaimData(tokenId, retryCount);
            if (claimData) {
              saveGlobalClaimData(tokenId, claimData);
              successCount++;
              failCount--;
              success = true;
              if (retryCount > 0) {
                console.log(`[재시도 성공] Token ${tokenId} (재시도 ${retryCount}회)`);
              }
            } else {
              retryCount++;
              const retryDelay = Math.min(1000 * Math.min(retryCount, 5), 10000);
              if (retryCount % 10 === 0) {
                console.warn(`[Token ${tokenId}] 재시도 ${retryCount}회, ${retryDelay}ms 대기...`);
              }
              await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
          } catch (error) {
            retryCount++;
            const retryDelay = Math.min(1000 * Math.min(retryCount, 5), 10000);
            if (retryCount % 10 === 0) {
              console.warn(`[Token ${tokenId}] 재시도 ${retryCount}회, ${retryDelay}ms 대기...`);
            }
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }
        }
      }
      
      console.log(`[배치 재시도 완료] ${failedTokenIds.length}개 토큰 재시도 완료`);
    }
    
    // 진행 상황 로그
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const rate = successCount > 0 ? (successCount / (elapsed / 60)).toFixed(2) : '0';
    const progressPercent = (((i + batch.length) / missingTokenIds.length) * 100).toFixed(1);
    console.log(`[진행 상황] ${progressPercent}% 완료 (${i + batch.length}/${missingTokenIds.length}) | 성공: ${successCount}개, 실패: ${failCount}개, 스킵: ${skipCount}개 | 속도: ${rate}개/분`);
    
    // 진행 상태 저장
    await saveProgress(batchEndId, 'running', { 
      successCount, 
      failCount, 
      skipCount, 
      totalMissing: missingTokenIds.length,
      processed: i + batch.length,
      progressPercent,
      elapsed,
      rate
    });
    
    // 배치 사이에 짧은 휴식
    if (i + processBatchSize < missingTokenIds.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n[수집 완료]`);
  console.log(`  - 성공: ${successCount}개`);
  console.log(`  - 실패: ${failCount}개`);
  console.log(`  - 스킵: ${skipCount}개`);
  console.log(`  - 소요 시간: ${elapsed}초 (${(elapsed / 60).toFixed(1)}분)`);
  
  const finalStats = getGlobalClaimDataStats();
  console.log('[최종 DB 상태]', finalStats);
  
  // 완료 상태 저장
  await saveProgress(maxTokenId, 'completed', { 
    successCount, 
    failCount, 
    skipCount, 
    totalMissing: missingTokenIds.length,
    elapsed,
    finalStats
  });
}

// 스크립트 실행
fillMissingTokens()
  .then(() => {
    console.log('\n✅ 누락된 토큰 수집이 완료되었습니다.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 수집 중 오류 발생:', error);
    process.exit(1);
  });


