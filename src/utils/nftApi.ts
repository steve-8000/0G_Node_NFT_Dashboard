import { NFTBalance, NFTBalanceResponse, NFTTokenResponse } from '../types';

const API_BASE_URL = '/api';
const DELEGATE_ADDRESS = '0x7BDc2aECC3CDaF0ce5a975adeA1C8d84Fd9Be3D9';

async function fetchTransfersForContract(
  contract: string,
  address: string,
  seenNFTs: Set<string>,
  maxPages: number = 5
): Promise<NFTBalance[]> {
  const delegatedNFTs: NFTBalance[] = [];
  let cursor = 0;
  const limit = 100;
  let pageCount = 0;
  let hasMore = true;
  
  while (hasMore && pageCount < maxPages) {
    try {
      const response = await fetch(
        `${API_BASE_URL}/nft/transfers?contract=${contract}&from=${address}&cursor=${cursor}&limit=${limit}`
      );
      
      if (!response.ok) {
        hasMore = false;
        break;
      }
      
      const data = await response.json();
      
      if (data.status === '1' && data.result) {
        const transfers = Array.isArray(data.result.list) ? data.result.list : [];
        
        if (transfers.length === 0) {
          hasMore = false;
          break;
        }
        
        pageCount++;
        
        for (const transfer of transfers) {
          try {
            const transferTo = (transfer.to || '').toLowerCase();
            const transferFrom = (transfer.from || '').toLowerCase();
            const delegateAddressLower = DELEGATE_ADDRESS.toLowerCase();
            const targetAddress = address.toLowerCase();
            
            if (transferTo !== delegateAddressLower || transferFrom !== targetAddress) {
              continue;
            }
            
            const contractAddress = transfer.contract || contract;
            const tokenId = transfer.tokenId || transfer.token_id;
            
            if (contractAddress && tokenId) {
              const nftKey = `${contractAddress.toLowerCase()}-${tokenId}`;
              
              if (seenNFTs.has(nftKey)) {
                continue;
              }
              
              seenNFTs.add(nftKey);
              
              delegatedNFTs.push({
                contractAddress: contractAddress,
                tokenId: tokenId.toString(),
                tokenUri: transfer.tokenUri || transfer.token_uri || '',
                name: transfer.name || '',
                symbol: transfer.symbol || '',
                image: transfer.image || `https://node-sale-nft-images.0g.ai/${tokenId}.png`,
                balance: '1',
                type: 'ERC721',
              });
            }
          } catch (e) {
            continue;
          }
        }
        
        if (data.result.next !== undefined && data.result.next !== null) {
          cursor = data.result.next;
        } else if (data.result.cursor !== undefined && data.result.cursor !== null) {
          cursor = data.result.cursor;
        } else if (transfers.length < limit) {
          hasMore = false;
        } else {
          cursor += limit;
        }
      } else {
        hasMore = false;
        break;
      }
    } catch (error) {
      hasMore = false;
      break;
    }
  }
  
  return delegatedNFTs;
}

export async function fetchDelegatedNFTsFromChainscan(address: string): Promise<NFTBalance[]> {
  try {
    const delegatedNFTs: NFTBalance[] = [];
    const seenNFTs = new Set<string>();
    
    const [delegateBalancesResponse, balancesResponse] = await Promise.all([
      fetch(`${API_BASE_URL}/nft/balances?owner=${DELEGATE_ADDRESS}&limit=100`),
      fetch(`${API_BASE_URL}/nft/balances?owner=${address}&limit=100`)
    ]);
    
    let contracts: string[] = [];
    const contractsSet = new Set<string>();
    
    if (delegateBalancesResponse.ok) {
      const delegateBalancesData = await delegateBalancesResponse.json();
      if (delegateBalancesData.status === '1' && delegateBalancesData.result && delegateBalancesData.result.list) {
        delegateBalancesData.result.list.forEach((item: any) => {
          if (item.contract) {
            const contractLower = item.contract.toLowerCase();
            if (!contractsSet.has(contractLower)) {
              contracts.push(item.contract);
              contractsSet.add(contractLower);
            }
          }
        });
      }
    }
    
    if (balancesResponse.ok) {
      const balancesData = await balancesResponse.json();
      if (balancesData.status === '1' && balancesData.result && balancesData.result.list) {
        balancesData.result.list.forEach((item: any) => {
          if (item.contract) {
            const contractLower = item.contract.toLowerCase();
            if (!contractsSet.has(contractLower)) {
              contracts.push(item.contract);
              contractsSet.add(contractLower);
            }
          }
        });
      }
    }
    
    if (contracts.length === 0) {
      return [];
    }
    
    const batchSize = 5;
    for (let i = 0; i < contracts.length; i += batchSize) {
      const batch = contracts.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(contract => fetchTransfersForContract(contract, address, seenNFTs))
      );
      
      results.forEach(nfts => {
        delegatedNFTs.push(...nfts);
      });
    }
    
    return delegatedNFTs;
  } catch (error) {
    return [];
  }
}

export async function fetchNFTBalances(address: string, retryCount = 0): Promise<NFTBalance[]> {
  const maxRetries = 3;
  const retryDelay = 1000;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    const balancesResponse = await fetch(
      `${API_BASE_URL}/nft/balances?owner=${address}&limit=100`,
      {
        signal: controller.signal,
      }
    );
    clearTimeout(timeoutId);
    
    if (!balancesResponse.ok) {
      throw new Error(`API 요청 실패: ${balancesResponse.statusText}`);
    }

    const balancesData: NFTBalanceResponse = await balancesResponse.json();
    
    const collectionMap = new Map<string, { name?: string; symbol?: string }>();
    if (balancesData.status === '1' && balancesData.result && balancesData.result.list) {
      balancesData.result.list.forEach((item: any) => {
        if (item.contract) {
          collectionMap.set(item.contract.toLowerCase(), {
            name: item.name,
            symbol: item.symbol,
          });
        }
      });
    }

    const controller2 = new AbortController();
    const timeoutId2 = setTimeout(() => controller2.abort(), 30000);
    
    const firstResponse = await fetch(
      `${API_BASE_URL}/nft/tokens?owner=${address}&limit=100`,
      {
        signal: controller2.signal,
      }
    );
    clearTimeout(timeoutId2);
    
    if (!firstResponse.ok) {
      throw new Error(`토큰 조회 실패: ${firstResponse.statusText}`);
    }

    const firstData: NFTTokenResponse = await firstResponse.json();
    
    if (firstData.status !== '1' || !firstData.result) {
      console.warn('NFT 조회 실패:', firstData);
      return [];
    }

    const totalCount = firstData.result.total || 0;
    const pageSize = 100;
    const maxPages = 100;
    const totalPages = Math.min(Math.ceil(totalCount / pageSize), maxPages);
    
    console.log(`전체 NFT 수량: ${totalCount}개, 페이지 수: ${totalPages}개`);

    let allTokens: any[] = [];
    if (firstData.result.list) {
      allTokens.push(...firstData.result.list);
      console.log(`첫 번째 페이지 로드 완료: ${firstData.result.list.length}개`);
    }

    if (totalPages > 1) {
      const pagePromises: Promise<any[]>[] = [];
      
      for (let page = 2; page <= totalPages; page++) {
        const pageController = new AbortController();
        const pageTimeoutId = setTimeout(() => pageController.abort(), 30000);
        
        pagePromises.push(
          fetch(`${API_BASE_URL}/nft/tokens?owner=${address}&limit=${pageSize}&page=${page}`, {
            signal: pageController.signal,
          })
            .then(async (response) => {
              clearTimeout(pageTimeoutId);
              if (!response.ok) {
                console.warn(`페이지 ${page} 조회 실패: ${response.statusText}`);
                return [];
              }
              const data: NFTTokenResponse = await response.json();
              if (data.status === '1' && data.result && data.result.list) {
                console.log(`페이지 ${page} 로드 완료: ${data.result.list.length}개`);
                return data.result.list;
              }
              console.warn(`페이지 ${page} 데이터 형식 오류:`, data);
              return [];
            })
            .catch((error) => {
              console.error(`페이지 ${page} 조회 중 오류:`, error);
              return [];
            })
        );
      }

      const pageResults = await Promise.all(pagePromises);
      let loadedCount = 0;
      pageResults.forEach((tokens, index) => {
        allTokens.push(...tokens);
        loadedCount += tokens.length;
        console.log(`페이지 ${index + 2} 추가 완료: ${tokens.length}개 (누적: ${allTokens.length}개)`);
      });
      console.log(`나머지 페이지 로드 완료: 총 ${loadedCount}개 추가됨`);
    }

    console.log(`전체 토큰 수집 완료: ${allTokens.length}개 (API total: ${totalCount}개)`);

    const erc721TokensUnfiltered = allTokens
      .filter((token: any) => token.type === 'ERC721')
      .map((token: any) => {
        const collectionInfo = collectionMap.get(token.contract?.toLowerCase() || '') || {};
        
        let imageUrl = token.image;
        if (!imageUrl && token.tokenId) {
          imageUrl = `https://node-sale-nft-images.0g.ai/${token.tokenId}.png`;
        }
        
        return {
          contractAddress: token.contract,
          tokenId: token.tokenId,
          tokenUri: token.tokenUri,
          name: collectionInfo.name || token.name,
          symbol: collectionInfo.symbol || token.symbol,
          image: imageUrl,
          balance: token.amount || '1',
          type: 'ERC721',
        };
      });
    
    let erc721Tokens: NFTBalance[] = erc721TokensUnfiltered;
    
    if (erc721Tokens.length > totalCount && totalCount > 0) {
      console.log(`NFT 수(${erc721Tokens.length}개)가 API total(${totalCount}개)보다 많음. 첫 ${totalCount}개만 사용합니다.`);
      erc721Tokens = erc721Tokens.slice(0, totalCount);
    } else if (erc721Tokens.length < totalCount) {
      console.warn(`NFT 수(${erc721Tokens.length}개)가 API total(${totalCount}개)보다 적습니다.`);
    }
    
    console.log(`전체 토큰: ${allTokens.length}개, ERC-721 NFT: ${erc721Tokens.length}개 (API total: ${totalCount}개)`);
    
    try {
      const delegatedNFTs = await fetchDelegatedNFTsFromChainscan(address);
      if (delegatedNFTs.length > 0) {
        console.log(`[위임된 NFT] ${delegatedNFTs.length}개 위임된 NFT 조회됨`);
        
        const existingNFTKeys = new Set(
          erc721Tokens.map(nft => `${nft.contractAddress.toLowerCase()}-${nft.tokenId}`)
        );
        
        const newDelegatedNFTs = delegatedNFTs.filter(nft => {
          const key = `${nft.contractAddress.toLowerCase()}-${nft.tokenId}`;
          if (existingNFTKeys.has(key)) {
            return false;
          }
          return true;
        });
        
        if (newDelegatedNFTs.length > 0) {
          console.log(`[위임된 NFT] ${newDelegatedNFTs.length}개 새로운 위임된 NFT 추가 (중복 제거 및 Unnamed 제외 후)`);
          erc721Tokens.push(...newDelegatedNFTs);
        } else {
          console.log(`[위임된 NFT] 모든 위임된 NFT가 이미 목록에 포함되어 있거나 Unnamed로 제외됨`);
        }
      }
    } catch (error) {
      console.warn('[위임된 NFT 조회] 오류 발생 (무시하고 계속):', error);
    }
    
    const finalNFTMap = new Map<string, NFTBalance>();
    
    erc721Tokens.forEach(nft => {
      const key = `${nft.contractAddress.toLowerCase()}-${nft.tokenId}`;
      
      if (!finalNFTMap.has(key)) {
        finalNFTMap.set(key, nft);
      } else {
        const existing = finalNFTMap.get(key);
        console.debug(`[중복 제거] NFT 중복 발견: ${key} (기존: ${existing?.name || 'N/A'}, 새로운: ${nft.name || 'N/A'})`);
      }
    });
    
    const finalNFTs = Array.from(finalNFTMap.values());
    
    if (finalNFTs.length < erc721Tokens.length) {
      console.log(`[중복 제거] ${erc721Tokens.length}개 -> ${finalNFTs.length}개 (${erc721Tokens.length - finalNFTs.length}개 중복 제거됨)`);
    }
    
    console.log(`[최종 NFT 목록] 총 ${finalNFTs.length}개 NFT 반환`);
    
    return finalNFTs;
  } catch (error: any) {
    console.error(`NFT 목록 조회 실패 (재시도: ${retryCount}/${maxRetries}):`, error);
    
    const isNetworkError = error?.message?.includes('Failed to fetch') ||
                          error?.message?.includes('NetworkError') ||
                          error?.name === 'TypeError' ||
                          error?.name === 'AbortError';
    
    if (isNetworkError && retryCount < maxRetries) {
      console.log(`${retryDelay * (retryCount + 1)}ms 후 재시도...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay * (retryCount + 1)));
      return fetchNFTBalances(address, retryCount + 1);
    }
    
    console.warn('NFT 목록 조회 최종 실패, 빈 배열 반환');
    return [];
  }
}

export async function fetchNFTMetadata(tokenUri: string): Promise<any> {
  try {
    if (!tokenUri || tokenUri.trim() === '') {
      console.warn('tokenUri is empty');
      return null;
    }

    let url = tokenUri;
    if (tokenUri.startsWith('ipfs://')) {
      url = `https://ipfs.io/ipfs/${tokenUri.replace('ipfs://', '')}`;
    } else if (tokenUri.startsWith('ipfs/')) {
      url = `https://ipfs.io/${tokenUri}`;
    }

    console.log('Fetching metadata from URL:', url);
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.error(`메타데이터 조회 실패: ${response.status} ${response.statusText}`);
      throw new Error(`메타데이터 조회 실패: ${response.statusText}`);
    }
    
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.warn('Response is not JSON, content-type:', contentType);
      const text = await response.text();
      console.log('Response text:', text.substring(0, 200));
      return null;
    }
    
    const data = await response.json();
    console.log('Metadata response:', data);
    return data;
  } catch (error) {
    console.error('메타데이터 조회 실패:', error);
    return null;
  }
}

export async function fetchNFTMetadataFromChainscan(_contractAddress: string, _tokenId: string): Promise<any> {
  return null;
}

