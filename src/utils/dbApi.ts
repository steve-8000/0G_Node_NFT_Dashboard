// DB API를 통한 NFT 데이터 조회 및 저장

const DB_API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? '/db-api'  // Nginx 프록시를 통해 접근
  : 'http://localhost:3001';

// 특정 페이지의 NFT 데이터 조회 (DB에서)
export async function fetchNFTsFromDB(
  walletAddress: string,
  page: number,
  itemsPerPage: number
): Promise<{ nfts: any[]; total: number; isFresh: boolean } | null> {
  try {
    const response = await fetch(
      `${DB_API_BASE_URL}/api/db/nfts/${walletAddress}?page=${page}&itemsPerPage=${itemsPerPage}`
    );

    if (!response.ok) {
      console.warn(`DB API 요청 실패: ${response.statusText}`);
      return null;
    }

    const data = await response.json();

    if (data.status === '1' && data.result) {
      return {
        nfts: data.result.list || [],
        total: data.result.total || 0,
        isFresh: data.result.isFresh || false,
      };
    }

    return null;
  } catch (error) {
    console.error('DB에서 NFT 조회 실패:', error);
    return null;
  }
}

// NFT 데이터를 DB에 저장 (에러 무시, 백그라운드 작업)
export async function saveNFTsToDB(
  walletAddress: string,
  nfts: any[],
  pageNumber: number
): Promise<boolean> {
  try {
    const response = await fetch(
      `${DB_API_BASE_URL}/api/db/nfts/${walletAddress}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nfts,
          pageNumber,
        }),
      }
    );

    if (!response.ok) {
      // DB 저장 실패는 무시 (선택적 기능)
      console.debug(`DB 저장 실패 (무시됨): ${response.status} ${response.statusText}`);
      return false;
    }

    const data = await response.json();
    return data.status === '1';
  } catch (error) {
    // DB 저장 실패는 무시 (선택적 기능)
    console.debug('DB 저장 실패 (무시됨):', error);
    return false;
  }
}

// 전체 NFT 목록 조회 (DB에서)
export async function fetchAllNFTsFromDB(walletAddress: string): Promise<any[] | null> {
  try {
    const response = await fetch(
      `${DB_API_BASE_URL}/api/db/nfts/${walletAddress}`
    );

    if (!response.ok) {
      console.warn(`DB API 요청 실패: ${response.statusText}`);
      return null;
    }

    const data = await response.json();

    if (data.status === '1' && data.result) {
      return data.result.list || [];
    }

    return null;
  } catch (error) {
    console.error('DB에서 전체 NFT 조회 실패:', error);
    return null;
  }
}

// 지갑 데이터 초기화 (Refresh 시 사용)
export async function clearWalletDataFromDB(walletAddress: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${DB_API_BASE_URL}/api/db/nfts/${walletAddress}`,
      {
        method: 'DELETE',
      }
    );

    if (!response.ok) {
      console.warn(`DB 초기화 실패: ${response.statusText}`);
      return false;
    }

    const data = await response.json();
    return data.status === '1';
  } catch (error) {
    console.error('DB 초기화 실패:', error);
    return false;
  }
}

// 지갑 데이터 상태 조회 (24시간 체크)
export async function getWalletStatus(walletAddress: string): Promise<{
  lastUpdate: number | null;
  isFresh: boolean;
  hasData: boolean;
  nftCount: number;
} | null> {
  try {
    const response = await fetch(
      `${DB_API_BASE_URL}/api/db/wallet/${walletAddress}/status`
    );

    if (!response.ok) {
      console.warn(`지갑 상태 조회 실패: ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    if (data.status === '1' && data.result) {
      return {
        lastUpdate: data.result.lastUpdate,
        isFresh: data.result.isFresh,
        hasData: data.result.hasData,
        nftCount: data.result.nftCount || 0
      };
    }

    return null;
  } catch (error) {
    console.error('지갑 상태 조회 실패:', error);
    return null;
  }
}

// 노드 정보 저장
export async function saveNodeInfoToDB(
  walletAddress: string,
  contractAddress: string,
  tokenId: string,
  nodeInfo: any
): Promise<boolean> {
  try {
    // NodeNFTInfo의 모든 필드를 포함하여 저장
    const nodeInfoToSave = {
      ...nodeInfo,
      totalAllocated: nodeInfo.totalAllocated || nodeInfo.allocationPerToken || '854.70',
      totalRemaining: nodeInfo.totalRemaining || '0',
      totalClaimed: nodeInfo.totalClaimed || '0',
      part1Claimed: nodeInfo.part1Claimed || '0',
      part1Remaining: nodeInfo.part1Remaining || '0',
      part1Total: nodeInfo.part1Total || '0',
      part2Earned: nodeInfo.part2Earned || '0',
      part2Remaining: nodeInfo.part2Remaining || '0',
      part2Total: nodeInfo.part2Total || '0'
    };
    
    const response = await fetch(
      `${DB_API_BASE_URL}/api/db/node-info/${walletAddress}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contractAddress,
          tokenId,
          nodeInfo: nodeInfoToSave
        }),
      }
    );

    if (!response.ok) {
      console.debug(`노드 정보 저장 실패 (무시됨): ${response.status}`);
      return false;
    }

    const data = await response.json();
    return data.status === '1';
  } catch (error) {
    console.debug('노드 정보 저장 실패 (무시됨):', error);
    return false;
  }
}

// 노드 정보 조회
export async function getNodeInfoFromDB(
  walletAddress: string,
  contractAddress?: string,
  tokenId?: string
): Promise<any | null> {
  try {
    let url = `${DB_API_BASE_URL}/api/db/node-info/${walletAddress}`;
    if (contractAddress && tokenId) {
      url += `?contractAddress=${contractAddress}&tokenId=${tokenId}`;
    }

    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data.status === '1' && data.result) {
      return data.result;
    }

    return null;
  } catch (error) {
    console.error('노드 정보 조회 실패:', error);
    return null;
  }
}

// 클레임 데이터 저장
export async function saveClaimDataToDB(
  walletAddress: string,
  tokenId: string,
  claimData: any
): Promise<boolean> {
  try {
    const response = await fetch(
      `${DB_API_BASE_URL}/api/db/claim-data/${walletAddress}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tokenId,
          claimData
        }),
      }
    );

    if (!response.ok) {
      console.debug(`클레임 데이터 저장 실패 (무시됨): ${response.status}`);
      return false;
    }

    const data = await response.json();
    return data.status === '1';
  } catch (error) {
    console.debug('클레임 데이터 저장 실패 (무시됨):', error);
    return false;
  }
}

// 클레임 데이터 조회
export async function getClaimDataFromDB(
  walletAddress: string,
  tokenId?: string
): Promise<any | null> {
  try {
    let url = `${DB_API_BASE_URL}/api/db/claim-data/${walletAddress}`;
    if (tokenId) {
      url += `?tokenId=${tokenId}`;
    }

    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data.status === '1' && data.result) {
      return data.result;
    }

    return null;
  } catch (error) {
    console.error('클레임 데이터 조회 실패:', error);
    return null;
  }
}

// Portfolio Summary 조회
export async function getPortfolioSummaryFromDB(walletAddress: string): Promise<{
  totalAllocated: string;
  totalRemaining: string;
  totalClaimed: string;
  totalEarned: string;
  tokenBalance: string;
  balanceValue: string;
  updatedAt: number;
} | null> {
  try {
    const response = await fetch(
      `${DB_API_BASE_URL}/api/db/portfolio/${walletAddress}`
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data.status === '1' && data.result) {
      return data.result;
    }

    return null;
  } catch (error) {
    console.error('Portfolio Summary 조회 실패:', error);
    return null;
  }
}

// Portfolio Summary 저장
export async function savePortfolioSummaryToDB(
  walletAddress: string,
  summary: {
    totalAllocated?: string;
    totalRemaining?: string;
    totalClaimed?: string;
    totalEarned?: string;
    tokenBalance?: string;
    balanceValue?: string;
  }
): Promise<boolean> {
  try {
    const response = await fetch(
      `${DB_API_BASE_URL}/api/db/portfolio/${walletAddress}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(summary),
      }
    );

    if (!response.ok) {
      console.debug(`Portfolio Summary 저장 실패 (무시됨): ${response.status}`);
      return false;
    }

    const data = await response.json();
    return data.status === '1';
  } catch (error) {
    console.debug('Portfolio Summary 저장 실패 (무시됨):', error);
    return false;
  }
}

