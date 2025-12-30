const SUBGRAPH_URL = 'https://alignment-node-subgraph.0g.ai/subgraphs/name/alignment-node';
const CLAIM_CONTRACT_ADDRESS = '0x6a9c6b5507e322aa00eb9c45e80c07ab63acabb6';
const ZERO_G_RPC = 'https://evmrpc.0g.ai';

export interface NodeNFTInfo {
  tokenId: string;
  name: string;
  totalAllocated: string;
  totalRemaining: string;
  totalClaimed: string;
  milestones: Milestone[];
  part1Claimed: string;
  part1Remaining: string;
  part1Total: string;
  part2Earned: string;
  part2Remaining: string;
  part2Total: string;
}

export interface Milestone {
  date: string;
  penalty: number;
  claimableAmount: string;
  status: 'past' | 'current' | 'upcoming';
}

class RequestQueue {
  private queue: Array<() => Promise<any>> = [];
  private running = 0;
  private maxConcurrent = 8;
  private rateLimitDelay = 50;
  private lastRequestTime = 0;
  private rateLimitErrorCount = 0;
  private backoffDelay = 0;

  async add<T>(fn: () => Promise<T>): Promise<T> {
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

  private async process() {
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
    const task = this.queue.shift()!;

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
    this.backoffDelay = Math.min(1000 * Math.pow(2, this.rateLimitErrorCount - 1), 10000);
    this.maxConcurrent = Math.max(3, this.maxConcurrent - 1);
    console.warn(`[RequestQueue] Rate limit 오류 발생. 백오프: ${this.backoffDelay}ms, 동시 요청 수: ${this.maxConcurrent}`);
    
    setTimeout(() => {
      this.rateLimitErrorCount = Math.max(0, this.rateLimitErrorCount - 1);
      this.maxConcurrent = Math.min(8, this.maxConcurrent + 1);
    }, 5000);
  }
}

const requestQueue = new RequestQueue();

async function getClaimDataFromDB(tokenId: string): Promise<{ allocationPerToken: string; consumed: string; claimed: string; partPercentage: string; initUnlock: string } | null> {
  try {
    const DB_API_BASE_URL = process.env.NODE_ENV === 'production' 
      ? '/db-api'  // Nginx 프록시를 통해 접근
      : 'http://localhost:3001';
    
    const response = await fetch(`${DB_API_BASE_URL}/api/claim-data/${tokenId}`);
    
    if (response.ok) {
      const data = await response.json();
      if (data.status === '1' && data.result) {
        return data.result;
      }
    }
    
    return null;
  } catch (error) {
    console.debug(`DB에서 클레임 데이터 조회 실패 (tokenId: ${tokenId}):`, error);
    return null;
  }
}

// DB에서 여러 토큰의 클레임 데이터를 한 번에 조회 (10배 속도 최적화)
export async function getClaimDataBatchFromDB(tokenIds: string[]): Promise<Map<string, { allocationPerToken: string; consumed: string; claimed: string; partPercentage: string; initUnlock: string }>> {
  const resultMap = new Map();
  
  if (!tokenIds || tokenIds.length === 0) {
    return resultMap;
  }
  
  try {
    const DB_API_BASE_URL = process.env.NODE_ENV === 'production' 
      ? '/db-api'
      : 'http://localhost:3001';
    
    // 최적화: 중복 제거 및 유효성 검사
    const uniqueTokenIds = [...new Set(tokenIds.filter(id => id && typeof id === 'string'))];
    
    if (uniqueTokenIds.length === 0) {
      return resultMap;
    }
    
    // 한 번에 모든 토큰 ID 조회 (서버에서 배치 처리)
    const response = await fetch(`${DB_API_BASE_URL}/api/claim-data/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tokenIds: uniqueTokenIds }),
    });
    
      if (response.ok) {
        const data = await response.json();
        if (data.status === '1' && data.result && Array.isArray(data.result)) {
          for (let i = 0; i < data.result.length; i++) {
          const item = data.result[i];
          if (item?.tokenId) {
            resultMap.set(item.tokenId, {
              allocationPerToken: item.allocationPerToken,
              consumed: item.consumed,
              claimed: item.claimed,
              partPercentage: item.partPercentage,
              initUnlock: item.initUnlock,
            });
          }
        }
      }
    }
  } catch (error) {
  }
  
  return resultMap;
}

async function getClaimDataFromRPC(tokenId: string, retryCount = 0): Promise<{ allocationPerToken: string; consumed: string; claimed: string; partPercentage: string; initUnlock: string } | null> {
  const maxRetries = 3;
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
    
    // Rate limit 방지를 위해 순차적으로 호출 (각 호출 사이에 딜레이 추가)
    let allocationPerToken, initUnlock, partPercentage, claimDataResult;
    
    try {
      // 요청 큐를 통해 rate limit 관리
      allocationPerToken = await requestQueue.add(() => contract.allocationPerToken());
      await new Promise(resolve => setTimeout(resolve, 100)); // 100ms 딜레이
      
      initUnlock = await requestQueue.add(() => contract.init_unlock());
      await new Promise(resolve => setTimeout(resolve, 100)); // 100ms 딜레이
      
      partPercentage = await requestQueue.add(() => contract.partPercentage());
      await new Promise(resolve => setTimeout(resolve, 100)); // 100ms 딜레이
      
      // claimData는 별도로 조회 (실패해도 기본값 사용 가능)
      try {
        claimDataResult = await requestQueue.add(() => contract.claimData(parseInt(tokenId, 10)));
      } catch (error: any) {
        console.warn(`getClaimData claimData 조회 실패 (tokenId: ${tokenId}):`, error.message || error);
        // claimData 실패는 기본값으로 처리 (재시도하지 않음)
        claimDataResult = null;
      }
    } catch (error: any) {
      // Rate limit 오류 감지
      const isRateLimitError = error.message?.includes('rate exceeded') || 
                               error.message?.includes('Too many requests') ||
                               error.code === -32005;
      
      if (isRateLimitError) {
        requestQueue.handleRateLimitError();
        // Exponential backoff 적용
        const backoffDelay = baseRetryDelay * Math.pow(2, retryCount);
        console.warn(`getClaimData Rate limit 오류 (재시도: ${retryCount}/${maxRetries}), ${backoffDelay}ms 대기...`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      } else {
        console.warn(`getClaimData 기본 정보 조회 실패 (재시도: ${retryCount}/${maxRetries}):`, error.message || error);
      }
      
      if (retryCount < maxRetries) {
        const retryDelay = isRateLimitError ? baseRetryDelay * Math.pow(2, retryCount) : baseRetryDelay * (retryCount + 1);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return getClaimDataFromRPC(tokenId, retryCount + 1);
      }
      throw error;
    }
    
    const allocation = parseFloat(ethers.formatEther(allocationPerToken));
    const initUnlockValue = parseFloat(ethers.formatEther(initUnlock));
    const partPercentageValue = parseFloat(ethers.formatEther(partPercentage));
    
    // claimData 파싱
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
    
    console.log('getClaimData for tokenId', tokenId, ':', {
      allocation: allocation.toFixed(2),
      consumed: consumed.toFixed(2),
      claimed: claimed.toFixed(2),
      partPercentage: partPercentageValue.toFixed(4),
      initUnlock: initUnlockValue.toFixed(4)
    });
    
    return {
      allocationPerToken: allocation.toFixed(2),
      consumed: consumed.toFixed(2),
      claimed: claimed.toFixed(2),
      partPercentage: partPercentageValue.toFixed(4),
      initUnlock: initUnlockValue.toFixed(4),
    };
  } catch (error: any) {
    console.error(`Failed to fetch claim data (재시도: ${retryCount}/${maxRetries}):`, error.message || error);
    
    // 재시도 가능한 오류인 경우 재시도
    if (retryCount < maxRetries && (
      error.message?.includes('network') || 
      error.message?.includes('RPC') ||
      error.code === 'NETWORK_ERROR' ||
      error.code === 'TIMEOUT' ||
      error.code === 'SERVER_ERROR'
    )) {
      const retryDelay = baseRetryDelay * (retryCount + 1);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
        return getClaimDataFromRPC(tokenId, retryCount + 1);
    }
    
    return null;
  }
}

// GraphQL 쿼리로 NFT 정보 조회 (Arbitrum 네트워크)
// id는 tokenId 문자열
export async function fetchNodeNFTInfo(tokenId: string, retryCount = 0): Promise<NodeNFTInfo | null> {
  const maxRetries = 3;
  const retryDelay = 1000; // 1초

  try {
    // GraphQL에서 totalReward 조회
    const query = `
      query GetNodeNFT($id: ID!) {
        nft(id: $id) {
          id
          totalReward
          delegatedTime
          approvedTime
          undelegatedTime
          lastUpdatedTime
        }
      }
    `;

    let response: Response;
    let data: any;
    
    try {
      response = await fetch(SUBGRAPH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: { id: tokenId },
        }),
      });

      if (!response.ok) {
        throw new Error(`API 요청 실패: ${response.statusText}`);
      }

      data = await response.json();
    } catch (error: any) {
      console.warn(`GraphQL API 요청 실패 (재시도: ${retryCount}/${maxRetries}):`, error.message || error);
      if (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * (retryCount + 1)));
        return fetchNodeNFTInfo(tokenId, retryCount + 1);
      }
      // 최종 실패 시 기본 정보 반환
      let claimData = await getClaimDataFromDB(tokenId);
      if (!claimData) {
        claimData = await getClaimDataFromRPC(tokenId);
      }
      return getDefaultNodeInfoWithClaimData(tokenId, claimData);
    }
    
    // 먼저 DB에서 클레임 데이터 조회 시도 (빠른 조회)
    let claimData = await getClaimDataFromDB(tokenId);
    
    // DB에 없으면 RPC에서 조회 (fallback, 하지만 일반적으로는 DB에 있어야 함)
    if (!claimData) {
      console.warn(`[Token ${tokenId}] DB에 클레임 데이터가 없어서 RPC에서 조회합니다.`);
      claimData = await getClaimDataFromRPC(tokenId);
    }
    
    if (data.errors) {
      console.error('GraphQL 오류:', data.errors);
      // GraphQL 오류가 있어도 claimData가 있으면 사용
      if (claimData) {
        return getDefaultNodeInfoWithClaimData(tokenId, claimData);
      }
      // API 실패 시 기본 정보 반환
      return getDefaultNodeInfo(tokenId);
    }

    if (data.data?.nft) {
      const nft = data.data.nft;
      
      // totalReward를 0G 단위로 변환 (wei에서 변환, 18 decimals)
      const totalRewardWei = nft.totalReward || '0';
      const totalReward = parseFloat((BigInt(totalRewardWei) / BigInt(10 ** 18)).toString()) / (10 ** 18);
      const totalRewardFormatted = totalReward.toFixed(2);
      
      // 할당량 및 클레임 데이터
      const totalAllocated = claimData?.allocationPerToken || '854.70';
      const part1Claimed = claimData?.claimed || '0';
      const consumed = claimData?.consumed || '0';
      const partPercentage = claimData?.partPercentage ? parseFloat(claimData.partPercentage) : 0.33;
      
      // 실제 사이트와 동일한 계산 방식
      // 실제 사이트와 동일한 계산 방식
      // Part 1 Total = allocationPerToken * partPercentage
      // Part 1 Remaining Share = Part 1 Total - consumed
      // Part 2 Total = allocationPerToken * (1 - partPercentage)
      // Part 2 Remaining = Part 2 Total - totalReward
      // Total Remaining = Part 1 Remaining Share + Part 2 Remaining
      // Total Claimed = Total Allocated - Total Remaining
      const part1Total = parseFloat(totalAllocated) * partPercentage;
      const part1RemainingShare = Math.max(0, part1Total - parseFloat(consumed));
      const part2Total = parseFloat(totalAllocated) * (1 - partPercentage);
      const part2Remaining = Math.max(0, part2Total - totalReward);
      const totalRemaining = (part1RemainingShare + part2Remaining).toFixed(2);
      const totalClaimed = (parseFloat(totalAllocated) - parseFloat(totalRemaining)).toFixed(2);
      
      // 디버깅 로그 제거 (성능 최적화: 대량 처리 시 로그가 너무 많아짐)
      // console.log('NFT #' + tokenId + ' Calculation:', { ... });
      
      // 마일스톤 정보 계산
      const milestones = getMilestones(totalRemaining);
      
      return {
        tokenId,
        name: `AI Alignment Node #${tokenId}`,
        totalAllocated,
        totalRemaining,
        totalClaimed,
        milestones,
        part1Claimed,
        part1Remaining: part1RemainingShare.toFixed(2),
        part1Total: part1Total.toFixed(2),
        part2Earned: totalRewardFormatted,
        part2Remaining: part2Remaining.toFixed(2),
        part2Total: part2Total.toFixed(2),
      };
    }

    // API에서 데이터를 찾지 못하면 기본 정보 반환
    return getDefaultNodeInfoWithClaimData(tokenId, claimData);
  } catch (error: any) {
    console.error(`Node NFT 정보 조회 실패 (재시도: ${retryCount}/${maxRetries}):`, error.message || error);
    
    // 재시도 가능한 오류인 경우 재시도
    if (retryCount < maxRetries && (
      error.message?.includes('network') || 
      error.message?.includes('fetch') ||
      error.message?.includes('timeout') ||
      error.code === 'NETWORK_ERROR' ||
      error.code === 'TIMEOUT'
    )) {
      await new Promise(resolve => setTimeout(resolve, retryDelay * (retryCount + 1)));
      return fetchNodeNFTInfo(tokenId, retryCount + 1);
    }
    
    // 최종 실패 시 기본 정보 반환
    let claimData = await getClaimDataFromDB(tokenId);
    if (!claimData) {
      claimData = await getClaimDataFromRPC(tokenId);
    }
    return getDefaultNodeInfoWithClaimData(tokenId, claimData);
  }
}

// claimData가 있는 경우 기본 정보 생성
function getDefaultNodeInfoWithClaimData(tokenId: string, claimData: { allocationPerToken: string; consumed: string; claimed: string; partPercentage: string; initUnlock: string } | null): NodeNFTInfo {
  const totalAllocated = claimData?.allocationPerToken || '854.70';
  const partPercentage = claimData?.partPercentage ? parseFloat(claimData.partPercentage) : 0.33;
  const consumed = parseFloat(claimData?.consumed || '0');
  const claimed = parseFloat(claimData?.claimed || '0');
  
  const part1Total = parseFloat(totalAllocated) * partPercentage;
  const part1RemainingShare = Math.max(0, part1Total - consumed);
  const part2Total = parseFloat(totalAllocated) * (1 - partPercentage);
  const part2Remaining = part2Total; // totalReward가 없으므로 전체가 remaining
  const totalRemaining = (part1RemainingShare + part2Remaining).toFixed(2);
  const totalClaimed = (parseFloat(totalAllocated) - parseFloat(totalRemaining)).toFixed(2);
  
  return {
    tokenId,
    name: `AI Alignment Node #${tokenId}`,
    totalAllocated,
    totalRemaining,
    totalClaimed,
    milestones: getMilestones(totalRemaining),
    part1Claimed: claimed.toFixed(2),
    part1Remaining: part1RemainingShare.toFixed(2),
    part1Total: part1Total.toFixed(2),
    part2Earned: '0',
    part2Remaining: part2Remaining.toFixed(2),
    part2Total: part2Total.toFixed(2),
  };
}

// 기본 마일스톤 정보 (실제 API가 없을 경우 사용)
export function getMilestones(totalRemaining: string): Milestone[] {
  const total = parseFloat(totalRemaining) || 0;
  const now = new Date();
  
  return [
    {
      date: 'Sep 21, 2025',
      penalty: 60,
      claimableAmount: (total * 0.19).toFixed(2),
      status: new Date('2025-09-21') < now ? 'past' : new Date('2025-09-21').getTime() - now.getTime() < 7 * 24 * 60 * 60 * 1000 ? 'current' : 'upcoming',
    },
    {
      date: 'Dec 20, 2025',
      penalty: 50,
      claimableAmount: (total * 0.215).toFixed(2),
      status: new Date('2025-12-20') < now ? 'past' : new Date('2025-12-20').getTime() - now.getTime() < 7 * 24 * 60 * 60 * 1000 ? 'current' : 'upcoming',
    },
    {
      date: 'Mar 20, 2026',
      penalty: 35,
      claimableAmount: (total * 0.25).toFixed(2),
      status: new Date('2026-03-20') < now ? 'past' : new Date('2026-03-20').getTime() - now.getTime() < 7 * 24 * 60 * 60 * 1000 ? 'current' : 'upcoming',
    },
    {
      date: 'Jun 18, 2026',
      penalty: 20,
      claimableAmount: (total * 0.284).toFixed(2),
      status: new Date('2026-06-18') < now ? 'past' : new Date('2026-06-18').getTime() - now.getTime() < 7 * 24 * 60 * 60 * 1000 ? 'current' : 'upcoming',
    },
    {
      date: 'Sep 21, 2026',
      penalty: 0,
      claimableAmount: (total * 0.33).toFixed(2),
      status: new Date('2026-09-21') < now ? 'past' : new Date('2026-09-21').getTime() - now.getTime() < 7 * 24 * 60 * 60 * 1000 ? 'current' : 'upcoming',
    },
  ];
}

// 기본 정보 반환 (API 실패 시)
function getDefaultNodeInfo(tokenId: string): NodeNFTInfo {
  const totalAllocated = '854.70';
  const totalRemaining = totalAllocated;
  const totalClaimed = '0';
  const part1Total = (parseFloat(totalAllocated) * 0.33).toFixed(2);
  const part2Total = (parseFloat(totalAllocated) * 0.67).toFixed(2);
  return {
    tokenId,
    name: `AI Alignment Node #${tokenId}`,
    totalAllocated,
    totalRemaining,
    totalClaimed,
    milestones: getMilestones(totalRemaining),
    part1Claimed: '0',
    part1Remaining: '0',
    part1Total,
    part2Earned: '0',
    part2Remaining: '0',
    part2Total,
  };
}

// GraphQL에서 여러 토큰의 totalReward를 배치로 조회 (10배 속도 최적화)
export async function fetchNodeNFTInfoBatch(tokenIds: string[]): Promise<Map<string, { totalReward: string; delegatedTime: string; approvedTime: string; undelegatedTime: string; lastUpdatedTime: string }>> {
  const resultMap = new Map();
  if (!tokenIds || tokenIds.length === 0) {
    return resultMap;
  }

  // 최적화: 중복 제거
  const uniqueTokenIds = [...new Set(tokenIds.filter(id => id && typeof id === 'string'))];
  
  if (uniqueTokenIds.length === 0) {
    return resultMap;
  }

  // 최적화: 배치 크기 증가 (1000 -> 2000, GraphQL이 허용하는 최대값 사용)
  const batchSize = 2000;
  const batches: string[][] = [];
  for (let i = 0; i < uniqueTokenIds.length; i += batchSize) {
    batches.push(uniqueTokenIds.slice(i, i + batchSize));
  }

  const query = `
    query GetNodeNFTs($ids: [ID!]!) {
      nfts(where: { id_in: $ids }) {
        id
        totalReward
        delegatedTime
        approvedTime
        undelegatedTime
        lastUpdatedTime
      }
    }
  `;

  // 최적화: 병렬 처리 및 에러 처리 간소화
  const batchPromises = batches.map(async (batch) => {
    try {
      const response = await fetch(SUBGRAPH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { ids: batch } }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.data?.nfts || [];
      }
      return [];
    } catch (error) {
      return [];
    }
  });

  // 최적화: Promise.all로 모든 배치 병렬 처리
  const results = await Promise.all(batchPromises);
  
  // 최적화: for 루프 사용 (forEach보다 빠름)
  for (let i = 0; i < results.length; i++) {
    const nfts = results[i];
    for (let j = 0; j < nfts.length; j++) {
      const nft = nfts[j];
      if (nft?.id) {
        resultMap.set(nft.id, {
          totalReward: nft.totalReward || '0',
          delegatedTime: nft.delegatedTime || '0',
          approvedTime: nft.approvedTime || '0',
          undelegatedTime: nft.undelegatedTime || '0',
          lastUpdatedTime: nft.lastUpdatedTime || '0',
        });
      }
    }
  }
  
  return resultMap;
}

// 배치 조회된 데이터를 기반으로 NodeNFTInfo 객체 생성
export function createNodeNFTInfoFromBatchData(
  tokenId: string,
  claimData: { allocationPerToken: string; consumed: string; claimed: string; partPercentage: string; initUnlock: string } | undefined,
  graphQLData: { totalReward: string; delegatedTime: string; approvedTime: string; undelegatedTime: string; lastUpdatedTime: string } | undefined
): NodeNFTInfo | null {
  const totalAllocated = claimData?.allocationPerToken || '854.70';
  const partPercentage = claimData?.partPercentage ? parseFloat(claimData.partPercentage) : 0.33;
  const consumed = parseFloat(claimData?.consumed || '0');
  const claimed = parseFloat(claimData?.claimed || '0');

  const totalRewardWei = graphQLData?.totalReward || '0';
  const totalReward = parseFloat((BigInt(totalRewardWei) / BigInt(10 ** 18)).toString()) / (10 ** 18);

  const part1Total = parseFloat(totalAllocated) * partPercentage;
  const part1RemainingShare = Math.max(0, part1Total - consumed);
  const part2Total = parseFloat(totalAllocated) * (1 - partPercentage);
  const part2Remaining = Math.max(0, part2Total - totalReward);
  const totalRemaining = (part1RemainingShare + part2Remaining).toFixed(2);
  const totalClaimed = (parseFloat(totalAllocated) - parseFloat(totalRemaining)).toFixed(2);

  return {
    tokenId,
    name: `AI Alignment Node #${tokenId}`,
    totalAllocated,
    totalRemaining,
    totalClaimed,
    milestones: getMilestones(totalRemaining),
    part1Claimed: claimed.toFixed(2),
    part1Remaining: part1RemainingShare.toFixed(2),
    part1Total: part1Total.toFixed(2),
    part2Earned: totalReward.toFixed(2),
    part2Remaining: part2Remaining.toFixed(2),
    part2Total: part2Total.toFixed(2),
  };
}
