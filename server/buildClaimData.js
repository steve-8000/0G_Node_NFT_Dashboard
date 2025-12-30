// 모든 NFT 토큰 ID의 클레임 데이터를 DB에 구축하는 스크립트
import { saveGlobalClaimData, getGlobalClaimDataStats, getGlobalClaimData } from './db.js';

const CLAIM_CONTRACT_ADDRESS = '0x6a9c6b5507e322aa00eb9c45e80c07ab63acabb6';
const ZERO_G_RPC = 'https://evmrpc.0g.ai';

// 진행 상태 저장 (실시간 확인용)
async function saveProgress(tokenId, status, stats) {
  try {
    const fs = await import('fs');
    const progressFile = './buildClaimData_progress.json';
    const progress = {
      currentTokenId: tokenId,
      status: status, // 'running', 'completed', 'error'
      stats: stats,
      timestamp: Date.now()
    };
    fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
  } catch (e) {
    // 파일 쓰기 실패는 무시
  }
}

// Rate limit 관리를 위한 큐 시스템
class RequestQueue {
  constructor() {
    this.queue = [];
    this.running = 0;
    this.maxConcurrent = 15; // 안정성 개선: 25개 -> 15개로 감소 (오류 방지)
    this.rateLimitDelay = 50; // 각 요청 사이 최소 딜레이 (ms) - 20ms -> 50ms로 증가 (안정성 개선)
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
      console.log(`[RequestQueue] 백오프 대기: ${this.backoffDelay}ms`);
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
    this.backoffDelay = Math.min(2000 * Math.pow(2, this.rateLimitErrorCount - 1), 30000); // 백오프 시간 증가 (안정성 개선)
    this.maxConcurrent = Math.max(5, this.maxConcurrent - 3); // 최소값을 5로 설정 (더 보수적으로)
    console.warn(`[RequestQueue] Rate limit 오류 발생. 백오프: ${this.backoffDelay}ms, 동시 요청 수: ${this.maxConcurrent}`);
    
    setTimeout(() => {
      this.rateLimitErrorCount = Math.max(0, this.rateLimitErrorCount - 1);
      this.maxConcurrent = Math.min(15, this.maxConcurrent + 1); // 복구 속도 감소 (안정성 개선)
    }, 10000); // 복구 시간 증가: 5초 -> 10초
  }
}

const requestQueue = new RequestQueue();

// 클레임 데이터 조회 함수 (성공할 때까지 무한 재시도)
async function getClaimData(tokenId, retryCount = 0) {
  const baseRetryDelay = 1000; // 안정성 개선: 0.5초 -> 1초로 증가

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
      await new Promise(resolve => setTimeout(resolve, 50)); // 안정성 개선: 20ms -> 50ms로 증가
      
      initUnlock = await requestQueue.add(() => contract.init_unlock());
      await new Promise(resolve => setTimeout(resolve, 50)); // 안정성 개선: 20ms -> 50ms로 증가
      
      partPercentage = await requestQueue.add(() => contract.partPercentage());
      await new Promise(resolve => setTimeout(resolve, 50)); // 안정성 개선: 20ms -> 50ms로 증가
      
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
        console.warn(`[Token ${tokenId}] Rate limit 오류 (재시도: ${retryCount}), ${backoffDelay}ms 대기...`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
      
      // 무한 재시도 (성공할 때까지) - 속도 개선: 딜레이 감소
      const retryDelay = isRateLimitError 
        ? Math.min(baseRetryDelay * Math.pow(2, Math.min(retryCount, 5)), 20000) // 최대 20초로 증가
        : baseRetryDelay * Math.min(retryCount + 1, 8); // 최대 8배로 증가
      
      if (retryCount % 10 === 0) { // 로그 빈도 증가 (10회마다)
        console.warn(`[Token ${tokenId}] Rate limit 재시도 ${retryCount}회, ${retryDelay}ms 대기...`);
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
    // 무한 재시도 (성공할 때까지) - 안정성 개선: 딜레이 증가
    const retryDelay = baseRetryDelay * Math.min(retryCount + 1, 8); // 최대 8배로 증가
    
    if (retryCount % 10 === 0) { // 로그 빈도 증가 (10회마다)
      console.warn(`[Token ${tokenId}] 네트워크 오류 재시도 ${retryCount}회, ${retryDelay}ms 대기 후 재시도...`);
    } else if (retryCount === 0) {
      // 첫 번째 오류만 상세 로그
      console.error(`[Token ${tokenId}] Failed to fetch claim data:`, error.message || error);
    }
    
    await new Promise(resolve => setTimeout(resolve, retryDelay));
    return getClaimData(tokenId, retryCount + 1);
  }
}

// 최대 토큰 ID 확인 (실제로는 체인에서 확인하거나 설정값 사용)
async function getMaxTokenId() {
  // 명령줄 인자로 최대 토큰 ID를 받을 수 있음
  const maxTokenIdArg = process.argv[2];
  if (maxTokenIdArg && !isNaN(parseInt(maxTokenIdArg))) {
    return parseInt(maxTokenIdArg);
  }
  
  // 기본값: 100000 (실제 최대값으로 변경 가능)
  // 실제로는 체인에서 확인하거나 설정값 사용
  return 100000;
}

// 모든 토큰 ID의 클레임 데이터 구축
async function buildAllClaimData() {
  console.log('[초기 구축 시작] 모든 NFT 토큰 ID의 클레임 데이터를 DB에 저장합니다...');
  
  const stats = getGlobalClaimDataStats();
  console.log('[현재 상태]', stats);
  
  const maxTokenId = await getMaxTokenId();
  console.log(`[최대 토큰 ID] ${maxTokenId}`);
  
  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;
  const startTime = Date.now();
  
  // 배치 단위로 처리 (진행 상황 표시)
  const batchSize = 100;
  
  for (let startId = 1; startId <= maxTokenId; startId += batchSize) {
    const endId = Math.min(startId + batchSize - 1, maxTokenId);
    const batch = [];
    
    for (let tokenId = startId; tokenId <= endId; tokenId++) {
      batch.push(tokenId.toString());
    }
    
    console.log(`\n[배치 처리] Token ID ${startId} ~ ${endId} (${batch.length}개)`);
    
    // 배치 내에서 병렬 처리 (속도 개선)
    const batchPromises = batch.map(async (tokenId) => {
      try {
        // 이미 저장된 데이터는 스킵
        try {
          const existing = getGlobalClaimData(tokenId);
          if (existing) {
            skipCount++;
            return { tokenId, status: 'skipped' };
          }
        } catch (e) {
          // getGlobalClaimData 오류는 무시하고 계속
        }
        
        // 성공할 때까지 재시도
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
    
    // 진행 상황 로그 (배치마다)
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const rate = successCount > 0 ? (successCount / (elapsed / 60)).toFixed(2) : '0';
    const progressPercent = ((endId / maxTokenId) * 100).toFixed(1);
    console.log(`[진행 상황] ${progressPercent}% 완료 (${endId}/${maxTokenId}) | 성공: ${successCount}개, 실패: ${failCount}개, 스킵: ${skipCount}개 | 속도: ${rate}개/분`);
    
    // 진행 상태 저장
    await saveProgress(endId, 'running', { 
      successCount, 
      failCount, 
      skipCount, 
      maxTokenId,
      progressPercent,
      elapsed,
      rate
    });
    
    // 배치 사이에 짧은 휴식
    if (endId < maxTokenId) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n[구축 완료]`);
  console.log(`  - 성공: ${successCount}개`);
  console.log(`  - 실패: ${failCount}개`);
  console.log(`  - 스킵: ${skipCount}개`);
  console.log(`  - 소요 시간: ${elapsed}초 (${(elapsed / 60).toFixed(1)}분)`);
  console.log(`  - 평균 속도: ${(successCount / (elapsed / 60)).toFixed(2)}개/분`);
  
  const finalStats = getGlobalClaimDataStats();
  console.log('[최종 상태]', finalStats);
  
  // 완료 상태 저장
  await saveProgress(maxTokenId, 'completed', { 
    successCount, 
    failCount, 
    skipCount, 
    maxTokenId,
    elapsed,
    finalStats
  });
}

// 스크립트 실행
// 사용법: node buildClaimData.js [maxTokenId]
// 예: node buildClaimData.js 100000
buildAllClaimData()
  .then(() => {
    console.log('\n✅ 초기 구축이 완료되었습니다.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 초기 구축 중 오류 발생:', error);
    process.exit(1);
  });

export { buildAllClaimData, getClaimData };

