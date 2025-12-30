import { useState, useEffect, useRef } from 'react';
import {
  ThemeProvider,
  CssBaseline,
  Container,
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  Card,
  CardMedia,
  CardContent,
  Grid,
  TextField,
  Alert,
  CircularProgress,
  Chip,
  Checkbox,
  IconButton,
  Paper,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  LinearProgress,
  Pagination,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  AccountBalanceWallet as WalletIcon,
  Send as SendIcon,
  Close as CloseIcon,
  Logout as LogoutIcon,
  ViewModule as ViewModuleIcon,
  ViewList as ViewListIcon,
  Twitter as TwitterIcon,
} from '@mui/icons-material';
import {
  connectWallet,
  switchToZeroGNetwork,
  getCurrentAccount,
  isMetaMaskInstalled,
} from './utils/metamask';
import { fetchNFTBalances, fetchNFTMetadata, fetchNFTMetadataFromChainscan } from './utils/nftApi';
import { 
  saveNFTsToDB, 
  fetchAllNFTsFromDB, 
  getWalletStatus, 
  saveNodeInfoToDB,
  getNodeInfoFromDB
} from './utils/dbApi';
import { transferMultipleNFTs } from './utils/nftTransfer';
import { fetchNodeNFTInfo, NodeNFTInfo } from './utils/nodeCheckerApi';
import { getTokenBalance, get0GPrice } from './utils/balance';
import { NFTBalance, Trait } from './types';
import { darkTheme } from './theme';

function App() {
  const [account, setAccount] = useState<string | null>(null);
  const [nfts, setNfts] = useState<NFTBalance[]>([]);
  const [selectedNFTs, setSelectedNFTs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [toAddress, setToAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedNFTDetail, setSelectedNFTDetail] = useState<NFTBalance | null>(null);
  const [nodeInfoMap, setNodeInfoMap] = useState<Map<string, NodeNFTInfo>>(new Map());
  const [loadingNodeInfoMap, setLoadingNodeInfoMap] = useState<Set<string>>(new Set());
  const [traits, setTraits] = useState<Trait[]>([]);
  const [loadingTraits, setLoadingTraits] = useState(false);
  const [traitsViewMode, setTraitsViewMode] = useState<'grid' | 'list'>('grid');
  const [walletDialogOpen, setWalletDialogOpen] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [tokenBalance, setTokenBalance] = useState<string>('0');
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [zeroGPrice, setZeroGPrice] = useState<number | null>(null);

  useEffect(() => {
    checkConnection();
  }, []);

  useEffect(() => {
    if (account) {
      loadNFTs();
      // Load token balance when account changes
      loadTokenBalance();
    }
  }, [account]);

  useEffect(() => {
    // Load 0G price on mount
    load0GPrice();
  }, []);

  useEffect(() => {
    // 페이지 크기가 변경되면 첫 페이지로 이동
    setPage(1);
  }, [itemsPerPage]);

  // NFT 목록이 로드되면 Portfolio Summary 데이터 로드 (백그라운드)
  // 비활성화: StevePage에서 처리하므로 App.tsx에서는 불필요
  // useEffect(() => {
  //   if (nfts.length > 0 && account) {
  //     loadPortfolioSummary();
  //   }
  // }, [nfts.length, account]);

  // nodeInfoMap 상태 변경 추적 (디버깅용)
  useEffect(() => {
    console.log(`[nodeInfoMap 상태 변경] 현재 크기: ${nodeInfoMap.size}개`);
    if (nodeInfoMap.size > 0) {
      const keys = Array.from(nodeInfoMap.keys());
      console.log(`[nodeInfoMap 키 목록 (처음 10개)]:`, keys.slice(0, 10));
    }
  }, [nodeInfoMap]);

  // Portfolio Summary를 위한 전체 NFT의 nodeInfo 로드 (병렬 처리, 속도 개선, 재시도 로직 포함)
  // 비활성화: StevePage에서 처리하므로 App.tsx에서는 불필요
  // 전체 함수 주석 처리하여 배치 로직 완전 제거
  const loadPortfolioSummary = async (_retryCount = 0, _forceRefreshFlag = false, _nftsToProcess?: typeof nfts) => {
    // 즉시 return하여 배치 로직 실행 방지
    return;
    /*
    // Refresh 버튼 클릭 시: 최소 200개 이상의 NFT가 로드될 때까지 대기
    if (forceRefreshFlag && targetNFTs.length < 200 && !nftsToProcess) {
      console.log(`[Refresh 버튼] Portfolio Summary: NFT 로드 대기 중... (현재: ${targetNFTs.length}개)`);
      await new Promise(resolve => setTimeout(resolve, 500));
      // 재귀 호출로 다시 시도
      return loadPortfolioSummary(retryCount, forceRefreshFlag);
    }

    const maxRetries = 3;
    const retryDelay = 2000; // 2초

    try {
      let missingNFTs: typeof nfts = [];
      
      // Refresh 버튼 클릭 시 (forceRefreshFlag=true): 24시간 제한 무시하고 항상 RPC/API에서 모든 NFT 정보 로드
      if (forceRefreshFlag) {
        console.log('[Refresh 버튼] Portfolio Summary: 24시간 제한 무시하고 RPC/API에서 모든 NFT 정보를 로드합니다.');
        // DB 체크를 건너뛰고 바로 RPC/API에서 로드하도록 진행
      }
      // 브라우저 새로고침 시 (forceRefreshFlag=false): DB에서 먼저 확인
      else {
        const walletStatus = await getWalletStatus(account);
        if (walletStatus && walletStatus.isFresh) {
          // DB에서 노드 정보 로드 (모든 NFT에 대해)
          const dbNodeInfoList = await getNodeInfoFromDB(account);
          if (dbNodeInfoList && Array.isArray(dbNodeInfoList) && dbNodeInfoList.length > 0) {
            const dbNodeInfoMap = new Map<string, NodeNFTInfo>();
            
            // 각 NFT에 대해 DB에서 노드 정보를 가져와서 변환
            for (const nft of targetNFTs) {
              const key = `${nft.contractAddress}-${nft.tokenId}`;
              const dbNodeInfo = dbNodeInfoList.find((item: any) => 
                item.contractAddress === nft.contractAddress && item.tokenId === nft.tokenId
              );
              
              if (dbNodeInfo) {
                // NodeNFTInfo 형식으로 변환 (DB에 저장된 계산된 값 사용)
                dbNodeInfoMap.set(key, {
                  tokenId: nft.tokenId,
                  name: nft.name || `AI Alignment Node #${nft.tokenId}`,
                  totalAllocated: dbNodeInfo.totalAllocated || dbNodeInfo.allocationPerToken || '854.70',
                  totalRemaining: dbNodeInfo.totalRemaining || '0',
                  totalClaimed: dbNodeInfo.totalClaimed || dbNodeInfo.claimed || '0',
                  milestones: [], // 마일스톤은 계산 필요
                  part1Claimed: dbNodeInfo.part1Claimed || dbNodeInfo.claimed || '0',
                  part1Remaining: dbNodeInfo.part1Remaining || '0',
                  part1Total: dbNodeInfo.part1Total || '0',
                  part2Earned: dbNodeInfo.part2Earned || dbNodeInfo.totalReward || '0',
                  part2Remaining: dbNodeInfo.part2Remaining || '0',
                  part2Total: dbNodeInfo.part2Total || '0'
                } as NodeNFTInfo);
              } else {
                // DB에 노드 정보가 없는 NFT는 나중에 RPC/API에서 로드
                missingNFTs.push(nft);
              }
            }
            
            if (dbNodeInfoMap.size > 0) {
              setNodeInfoMap(dbNodeInfoMap);
              console.log(`[setNodeInfoMap] DB에서 로드: ${dbNodeInfoMap.size}개의 노드 정보를 nodeInfoMap에 저장했습니다.`);
              console.log(`Portfolio Summary: DB에서 ${dbNodeInfoMap.size}개의 노드 정보를 로드했습니다.`);
              
              // DB에 노드 정보가 없는 NFT가 있으면 RPC/API에서 로드
              if (missingNFTs.length > 0) {
                console.log(`Portfolio Summary: DB에 노드 정보가 없는 NFT ${missingNFTs.length}개를 RPC/API에서 로드합니다.`);
                // DB 데이터는 이미 설정했으므로, 나머지 로직으로 진행하여 missingNFTs를 로드
                // 아래 코드로 계속 진행
              } else {
                // 모든 NFT의 노드 정보가 DB에 있으면 여기서 종료
                return;
              }
            }
          }
        }
      }

      // Refresh 버튼 클릭 시: 모든 NFT의 노드 정보를 RPC/API에서 로드 (24시간 제한 무시)
      // 브라우저 새로고침 시: DB에 없는 NFT만 RPC/API에서 로드
      const logPrefix = forceRefreshFlag ? '[Refresh 버튼]' : '[브라우저 새로고침]';
      
      const nftsToLoad = forceRefreshFlag
        ? targetNFTs // Refresh 버튼: 모든 NFT를 다시 로드 (기존 nodeInfoMap 무시)
        : missingNFTs.length > 0 
          ? missingNFTs.filter(nft => {
              const key = `${nft.contractAddress}-${nft.tokenId}`;
              return !nodeInfoMap.has(key);
            })
          : targetNFTs.filter(nft => {
              const key = `${nft.contractAddress}-${nft.tokenId}`;
              return !nodeInfoMap.has(key);
            });
      
      console.log(`${logPrefix} Portfolio Summary: 전체 NFT ${targetNFTs.length}개, 이미 로드됨 ${nodeInfoMap.size}개, 로드 필요 ${nftsToLoad.length}개`);
      
      // Refresh 버튼 클릭 시: 기존 nodeInfoMap 초기화 (모든 NFT를 새로 로드)
      if (forceRefreshFlag && nodeInfoMap.size > 0) {
        console.log(`${logPrefix} Portfolio Summary: 기존 노드 정보 초기화 (현재 크기: ${nodeInfoMap.size}개)하고 모든 NFT를 새로 로드합니다.`);
        setNodeInfoMap(new Map());
        console.log(`${logPrefix} Portfolio Summary: nodeInfoMap 초기화 완료 (새 크기: 0개)`);
      }

      if (nftsToLoad.length === 0) {
        console.log(`${logPrefix} Portfolio Summary: 모든 NFT 정보가 이미 로드되어 있습니다. (총 ${targetNFTs.length}개)`);
        return;
      }

      console.log(`${logPrefix} Portfolio Summary: ${nftsToLoad.length}개의 NFT 정보를 병렬로 로드합니다. (재시도: ${retryCount}/${maxRetries}, 전체 NFT: ${targetNFTs.length}개)`);
      
      // Rate limit 방지를 위해 배치 크기 감소 및 딜레이 증가
      const batchSize = 10; // 20개 -> 10개로 감소
      const batches = [];
      let loadedCount = 0;
      let failedKeys: string[] = [];
      
      for (let i = 0; i < nftsToLoad.length; i += batchSize) {
        batches.push(nftsToLoad.slice(i, i + batchSize));
      }

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        console.log(`Portfolio Summary: 배치 ${batchIndex + 1}/${batches.length} 처리 중 (${batch.length}개 NFT)`);
        
        const batchPromises = batch.map(async (nft) => {
          const key = `${nft.contractAddress}-${nft.tokenId}`;
          try {
            const info = await fetchNodeNFTInfo(nft.tokenId);
            if (info) {
              // DB에 저장 (백그라운드) - NodeNFTInfo의 모든 필드 저장
              saveNodeInfoToDB(account, nft.contractAddress, nft.tokenId, {
                ...info,
                totalReward: info.part2Earned || '0',
                allocationPerToken: info.totalAllocated || '854.70'
              }).catch(err => {
                console.debug('노드 정보 DB 저장 실패 (무시됨):', err);
              });
            }
            return { key, info, success: true };
          } catch (err) {
            console.error(`Failed to load node info for NFT ${nft.tokenId}:`, err);
            return { key, info: null, success: false };
          }
        });

        const batchResults = await Promise.allSettled(batchPromises);
        const newNodeInfoMap = new Map<string, NodeNFTInfo>();

        batchResults.forEach((result) => {
          if (result.status === 'fulfilled') {
            if (result.value.info && result.value.success) {
              newNodeInfoMap.set(result.value.key, result.value.info);
              loadedCount++;
            } else {
              failedKeys.push(result.value.key);
            }
          } else {
            console.error('Batch promise rejected:', result.reason);
            // rejected된 경우 key를 알 수 없으므로, 배치의 모든 NFT를 실패로 처리
            batch.forEach(nft => {
              const key = `${nft.contractAddress}-${nft.tokenId}`;
              if (!failedKeys.includes(key)) {
                failedKeys.push(key);
              }
            });
          }
        });

        // 각 배치마다 상태 업데이트
        if (newNodeInfoMap.size > 0) {
          setNodeInfoMap(prevMap => {
            const merged = new Map(prevMap);
            newNodeInfoMap.forEach((value, key) => {
              merged.set(key, value);
            });
            const newSize = merged.size;
            console.log(`[setNodeInfoMap] 배치 ${batchIndex + 1} 업데이트: 이전 크기 ${prevMap.size}개 → 새 크기 ${newSize}개 (추가: ${newNodeInfoMap.size}개)`);
            return merged;
          });
          console.log(`Portfolio Summary: 배치 ${batchIndex + 1}/${batches.length} 완료 (${newNodeInfoMap.size}개 로드, 누적: ${loadedCount}/${nftsToLoad.length})`);
        }

        // Rate limit 방지를 위해 배치 사이에 더 긴 딜레이 (500ms)
        if (batchIndex < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      console.log(`Portfolio Summary: 모든 배치 처리 완료 (성공: ${loadedCount}개, 실패: ${failedKeys.length}개)`);
      
      // nodeInfoMap 상태 확인 (다음 렌더링 사이클에서 확인)
      setTimeout(() => {
        // nodeInfoMap 상태를 직접 확인할 수 없으므로, 로드된 항목 수로 확인
        console.log(`[nodeInfoMap 상태 확인] 예상 저장된 항목 수: ${loadedCount}개 (실제 nodeInfoMap.size는 다음 렌더링에서 확인 가능)`);
      }, 100);

      // 실패한 항목이 있고 재시도 횟수가 남아있으면 재시도
      if (failedKeys.length > 0 && retryCount < maxRetries) {
        console.log(`Portfolio Summary: ${failedKeys.length}개의 NFT 정보 로드 실패. 재시도합니다... (${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, retryDelay * (retryCount + 1)));
        
        // 실패한 NFT만 다시 로드 (재귀 호출)
        const failedNFTs = nftsToLoad.filter((nft: typeof targetNFTs[0]) => {
          const key = `${nft.contractAddress}-${nft.tokenId}`;
          return failedKeys.includes(key);
        });
        
        // 재시도를 위해 실패한 NFT만 다시 시도
        if (failedNFTs.length > 0) {
          // 실패한 NFT들의 nodeInfo만 다시 로드
          for (const nft of failedNFTs) {
            const key = `${nft.contractAddress}-${nft.tokenId}`;
            try {
              const info = await fetchNodeNFTInfo(nft.tokenId);
              if (info) {
                setNodeInfoMap(prevMap => {
                  const merged = new Map(prevMap);
                  merged.set(key, info);
                  return merged;
                });
              }
            } catch (err) {
              console.error(`재시도 실패: NFT ${nft.tokenId}`, err);
            }
          }
        }
      } else {
        console.log(`Portfolio Summary: 로드 완료. 성공: ${loadedCount}개, 실패: ${failedKeys.length}개, 전체: ${targetNFTs.length}개`);
        // 로드 완료 후 nodeInfoMap 상태가 업데이트되도록 강제 리렌더링 트리거
        // 상태 업데이트를 확인하기 위한 추가 로그
        setTimeout(() => {
          console.log(`Portfolio Summary: nodeInfoMap 크기 확인 (예상: ${loadedCount}개)`);
        }, 100);
      }
    } catch (err) {
      console.error(`Failed to load portfolio summary (재시도: ${retryCount}/${maxRetries}):`, err);
      
      if (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * (retryCount + 1)));
        return loadPortfolioSummary(retryCount + 1, forceRefreshFlag);
      }
    }
    */
  };

  // 페이지나 itemsPerPage가 변경되면 현재 페이지의 NFT만 nodeInfo 로드
  useEffect(() => {
    if (nfts.length > 0 && account) {
      loadCurrentPageNFTs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, itemsPerPage, nfts.length, account]);

  // 페이지 변경 시 해당 페이지의 NFT 데이터를 DB에 저장 (백그라운드, 에러 무시)
  useEffect(() => {
    const savePageNFTs = async () => {
      if (!account || nfts.length === 0) return;

      try {
        const startIndex = (page - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const currentPageNFTs = nfts.slice(startIndex, endIndex);
        
        if (currentPageNFTs.length > 0) {
          // DB에 저장 (에러는 무시, 백그라운드 작업)
          saveNFTsToDB(account, currentPageNFTs, page).catch(err => {
            // DB 저장 실패는 무시 (선택적 기능)
            console.debug('DB 저장 실패 (무시됨):', err);
          });
        }
      } catch (error) {
        // 에러 무시
        console.debug('페이지 NFT 저장 실패 (무시됨):', error);
      }
    };

    if (account && nfts.length > 0) {
      savePageNFTs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, itemsPerPage, account, nfts.length]);

  const checkConnection = async () => {
    if (!isMetaMaskInstalled()) {
      setError('MetaMask is not installed.');
      return;
    }

    const currentAccount = await getCurrentAccount();
    if (currentAccount) {
      setAccount(currentAccount);
    }
  };

  const handleConnect = async () => {
    try {
      setError(null);
      setLoading(true);
      
      await switchToZeroGNetwork();
      const address = await connectWallet();
      setAccount(address);
    } catch (err: any) {
      setError(err.message || 'Failed to connect wallet.');
    } finally {
      setLoading(false);
    }
  };

  const loadTokenBalance = async () => {
    if (!account) return;
    
    setLoadingBalance(true);
    try {
      const balance = await getTokenBalance(account);
      setTokenBalance(balance);
    } catch (error) {
      console.error('Failed to load balance:', error);
      setTokenBalance('0');
    } finally {
      setLoadingBalance(false);
    }
  };

  const load0GPrice = async () => {
    try {
      const price = await get0GPrice();
      setZeroGPrice(price);
    } catch (error) {
      console.error('Failed to load 0G price:', error);
    }
  };


  // 현재 페이지의 NFT만 nodeInfo 로드
  const loadCurrentPageNFTs = async (retryCount = 0, forceRefreshFlag = false) => {
    if (!account || nfts.length === 0) return;

    const maxRetries = 3;
    const retryDelay = 1000; // 1초

    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentPageNFTs = nfts.slice(startIndex, endIndex);

    const keysToLoad = currentPageNFTs.map(nft => `${nft.contractAddress}-${nft.tokenId}`);
    setLoadingNodeInfoMap(new Set(keysToLoad));

    try {
      // 강제 새로고침이 아니면 DB에서 먼저 확인
      if (!forceRefreshFlag) {
        const walletStatus = await getWalletStatus(account);
        if (walletStatus && walletStatus.isFresh) {
          // DB에서 현재 페이지의 노드 정보 로드
          const dbNodeInfoMap = new Map<string, NodeNFTInfo>();
          for (const nft of currentPageNFTs) {
            const dbNodeInfo = await getNodeInfoFromDB(account, nft.contractAddress, nft.tokenId);
            if (dbNodeInfo) {
              const key = `${nft.contractAddress}-${nft.tokenId}`;
              dbNodeInfoMap.set(key, dbNodeInfo as NodeNFTInfo);
            }
          }
          
          if (dbNodeInfoMap.size > 0) {
            setNodeInfoMap(prev => {
              const merged = new Map(prev);
              dbNodeInfoMap.forEach((value, key) => merged.set(key, value));
              return merged;
            });
            setLoadingNodeInfoMap(new Set());
            console.log(`현재 페이지: DB에서 ${dbNodeInfoMap.size}개의 노드 정보를 로드했습니다.`);
            return; // DB 데이터 사용, RPC/API 요청 안 함
          }
        }
      }

      // 현재 페이지의 NFT nodeInfo를 병렬로 로드
      const nodeInfoPromises = currentPageNFTs.map(async (nft) => {
        const key = `${nft.contractAddress}-${nft.tokenId}`;
        try {
          const info = await fetchNodeNFTInfo(nft.tokenId);
          if (info) {
            // DB에 저장 (백그라운드) - NodeNFTInfo의 모든 필드 저장
            saveNodeInfoToDB(account, nft.contractAddress, nft.tokenId, {
              ...info,
              totalReward: info.part2Earned || '0',
              allocationPerToken: info.totalAllocated || '854.70'
            }).catch(err => {
              console.debug('노드 정보 DB 저장 실패 (무시됨):', err);
            });
          }
          return { key, info, success: true };
        } catch (err) {
          console.error(`Failed to load node info for NFT ${nft.tokenId}:`, err);
          return { key, info: null, success: false };
        }
      });
      
      const results = await Promise.allSettled(nodeInfoPromises);
      const newPageNodeInfoMap = new Map<string, NodeNFTInfo>();
      const failedKeys: string[] = [];
      
      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          if (result.value.info && result.value.success) {
            newPageNodeInfoMap.set(result.value.key, result.value.info);
          } else {
            failedKeys.push(result.value.key);
          }
        }
      });
      
      // 기존 nodeInfoMap에 현재 페이지 데이터 추가/업데이트
      if (newPageNodeInfoMap.size > 0) {
        setNodeInfoMap(prevMap => {
          const merged = new Map(prevMap);
          newPageNodeInfoMap.forEach((value, key) => {
            merged.set(key, value);
          });
          return merged;
        });
      }

      // 실패한 항목이 있고 재시도 횟수가 남아있으면 재시도
      if (failedKeys.length > 0 && retryCount < maxRetries) {
        console.log(`현재 페이지 NFT 로드 실패: ${failedKeys.length}개. 재시도합니다... (${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, retryDelay * (retryCount + 1)));
        return loadCurrentPageNFTs(retryCount + 1, forceRefreshFlag);
      }
    } catch (err) {
      console.error(`Failed to load current page NFTs (재시도: ${retryCount}/${maxRetries}):`, err);
      
      if (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * (retryCount + 1)));
        return loadCurrentPageNFTs(retryCount + 1, forceRefreshFlag);
      }
    } finally {
      setLoadingNodeInfoMap(new Set());
    }
  };

  const loadNFTs = async (retryCount = 0, forceRefreshFlag = false): Promise<NFTBalance[]> => {
    if (!account) return [];

    const maxRetries = 3;
    const retryDelay = 1000; // 1초

    try {
      setError(null);
      setLoading(true);
      
      // 지갑 상태 확인 (24시간 체크)
      const walletStatus = await getWalletStatus(account);
      
      // Refresh 버튼 클릭이면 무조건 RPC/API 호출하여 DB 업데이트
      if (forceRefreshFlag) {
        console.log('[Refresh 버튼] RPC/API에서 최신 데이터 조회하여 DB 업데이트');
      } 
      // 브라우저 새로고침이면 DB에 데이터가 있으면 DB에서 로드
      else if (walletStatus && walletStatus.isFresh && walletStatus.hasData) {
        console.log('[브라우저 새로고침] DB에서 NFT 데이터 로드 (24시간 내 데이터)');
        const dbNFTs = await fetchAllNFTsFromDB(account);
        
        if (dbNFTs && dbNFTs.length > 0) {
          console.log(`[브라우저 새로고침] DB에서 ${dbNFTs.length}개의 NFT를 로드했습니다.`);
          
          // DB에 저장된 NFT 개수가 적을 수 있으므로, RPC/API에서 실제 개수를 확인
          try {
            const firstResponse = await fetch(`/api/nft/tokens?owner=${account}&limit=100`);
            if (firstResponse.ok) {
              const firstData = await firstResponse.json();
              const totalCount = firstData.result?.total || 0;
              
              console.log(`[브라우저 새로고침] DB: ${dbNFTs.length}개, API total: ${totalCount}개`);
              
              // DB에 저장된 개수가 실제 개수보다 적으면 RPC/API에서 가져와서 DB 업데이트
              if (dbNFTs.length < totalCount && totalCount > 0) {
                console.log(`[브라우저 새로고침] DB에 ${dbNFTs.length}개만 저장되어 있어서 RPC/API에서 모든 NFT를 가져와서 DB를 업데이트합니다.`);
                // RPC/API에서 모든 NFT를 가져와서 DB에 저장하도록 진행 (아래 코드로 계속)
              } else {
                // DB에 충분한 데이터가 있으면 DB 데이터 사용
                console.log(`[브라우저 새로고침] DB에 충분한 데이터가 있어서 DB 데이터를 사용합니다.`);
                setNfts(dbNFTs);
                setLoading(false);
                return dbNFTs; // DB 데이터 사용, RPC/API 요청 안 함
              }
            } else {
              console.warn('[브라우저 새로고침] API total 확인 실패, DB 데이터 사용');
              // API 확인 실패 시 DB 데이터 사용
              setNfts(dbNFTs);
              setLoading(false);
              return dbNFTs;
            }
          } catch (err) {
            console.warn('[브라우저 새로고침] API total 확인 실패, DB 데이터 사용:', err);
            // API 확인 실패 시 DB 데이터 사용
            setNfts(dbNFTs);
            setLoading(false);
            return dbNFTs;
          }
        } else {
          console.log('[브라우저 새로고침] DB에 데이터가 없어서 RPC/API에서 조회합니다.');
        }
      } else {
        console.log(`[초기 로드] RPC/API에서 NFT 목록을 조회합니다. (재시도: ${retryCount}/${maxRetries})`);
      }
      
      const nftList = await fetchNFTBalances(account);
      
      console.log(`RPC/API에서 ${nftList.length}개의 NFT를 로드했습니다.`);
      setNfts(nftList);
      
      // RPC/API에서 가져온 데이터를 DB에 저장 (페이지별로 저장) - 백그라운드
      // 모든 경우에 DB에 저장 (Refresh 버튼, 초기 로드 모두)
      if (nftList.length > 0) {
        const itemsPerPage = 100;
        const totalPages = Math.ceil(nftList.length / itemsPerPage);
        
        const logPrefix = forceRefreshFlag ? '[Refresh 버튼]' : '[초기 로드]';
        console.log(`${logPrefix} DB 저장 시작: 총 ${nftList.length}개 NFT를 ${totalPages}페이지로 나눠서 저장`);
        
        // 비동기로 저장 (속도 개선) - 모든 페이지를 저장
        Promise.all(
          Array.from({ length: totalPages }, async (_, index) => {
            const page = index + 1;
            const startIndex = (page - 1) * itemsPerPage;
            const endIndex = startIndex + itemsPerPage;
            const pageNFTs = nftList.slice(startIndex, endIndex);
            console.log(`${logPrefix} DB 저장 중: 페이지 ${page} (${pageNFTs.length}개 NFT)`);
            await saveNFTsToDB(account, pageNFTs, page);
            console.log(`${logPrefix} DB 저장 완료: 페이지 ${page}`);
          })
        ).then(() => {
          console.log(`${logPrefix} DB 저장 완료: 총 ${nftList.length}개 NFT 저장됨`);
        }).catch(err => {
          console.error(`${logPrefix} DB 저장 실패:`, err);
        });
      }
      
      return nftList; // NFT 리스트 반환
    } catch (err: any) {
      console.error(`NFT 목록 조회 실패 (재시도: ${retryCount}/${maxRetries}):`, err);
      
      if (retryCount < maxRetries) {
        // 재시도
        await new Promise(resolve => setTimeout(resolve, retryDelay * (retryCount + 1)));
        return loadNFTs(retryCount + 1, forceRefreshFlag);
      } else {
        setError(err.message || 'Failed to load NFT list. Please refresh the page.');
        return [];
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleNFTSelection = (nft: NFTBalance) => {
    const key = `${nft.contractAddress}-${nft.tokenId}`;
    const newSelected = new Set(selectedNFTs);
    
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    
    setSelectedNFTs(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedNFTs.size === nfts.length) {
      setSelectedNFTs(new Set());
    } else {
      const allKeys = new Set(nfts.map(nft => `${nft.contractAddress}-${nft.tokenId}`));
      setSelectedNFTs(allKeys);
    }
  };

  // useRef를 사용하여 중복 호출 방지 (React StrictMode 대응)
  const transferInProgressRef = useRef(false);
  
  const handleTransfer = async () => {
    const callStack = new Error().stack;
    const timestamp = Date.now();
    console.log(`[handleTransfer 호출 ${timestamp}]`, { 
      transferring, 
      transferInProgressRef: transferInProgressRef.current,
      selectedNFTsSize: selectedNFTs.size,
      callStack: callStack?.split('\n').slice(0, 5).join('\n') 
    });
    
    // 중복 호출 방지 (state와 ref 모두 확인)
    if (transferring || transferInProgressRef.current) {
      console.warn(`[handleTransfer ${timestamp}] 이미 전송 중입니다. 중복 호출을 무시합니다.`, {
        transferring,
        transferInProgressRef: transferInProgressRef.current
      });
      return;
    }
    
    // 즉시 ref 설정 (React StrictMode에서도 작동)
    transferInProgressRef.current = true;

    if (!account || !toAddress) {
      setError('Please enter recipient address.');
      return;
    }

    if (selectedNFTs.size === 0) {
      setError('Please select NFTs to transfer.');
      return;
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(toAddress)) {
      setError('Please enter a valid Ethereum address.');
      return;
    }

    try {
      setError(null);
      setSuccess(null);
      setTransferring(true); // 즉시 true로 설정하여 중복 호출 방지
      console.log('[handleTransfer] transferring 플래그 설정 완료');
      console.log('[handleTransfer] selectedNFTs 상태:', { 
        size: selectedNFTs.size, 
        keys: Array.from(selectedNFTs),
        nftsLength: nfts.length 
      });
      
      const nftsToTransfer = nfts.filter(
        nft => selectedNFTs.has(`${nft.contractAddress}-${nft.tokenId}`)
      );

      console.log('[handleTransfer] 전송할 NFT 목록:', {
        count: nftsToTransfer.length,
        nfts: nftsToTransfer.map(n => `${n.contractAddress}-${n.tokenId}`),
        selectedNFTsSize: selectedNFTs.size
      });
      
      // 선택된 NFT 수와 필터링된 NFT 수가 일치하지 않으면 경고
      if (nftsToTransfer.length !== selectedNFTs.size) {
        console.warn('[handleTransfer] 경고: 선택된 NFT 수와 필터링된 NFT 수가 일치하지 않습니다!', {
          selectedCount: selectedNFTs.size,
          filteredCount: nftsToTransfer.length,
          selectedKeys: Array.from(selectedNFTs),
          filteredKeys: nftsToTransfer.map(n => `${n.contractAddress}-${n.tokenId}`)
        });
      }

      // 여러 NFT를 전송하는 경우 안내 메시지 표시
      if (nftsToTransfer.length > 1) {
        setSuccess(`총 ${nftsToTransfer.length}개의 NFT를 전송합니다. 각 NFT마다 MetaMask 컨펌창이 표시됩니다.`);
        // 사용자가 메시지를 읽을 시간을 주기 위해 잠시 대기
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
      
      setTransferDialogOpen(false);
      console.log('[handleTransfer] 다이얼로그 닫기 완료');

      console.log('[handleTransfer] transferMultipleNFTs 호출 시작:', { count: nftsToTransfer.length, toAddress });
      const txHashes = await transferMultipleNFTs(nftsToTransfer, toAddress, account);
      console.log('[handleTransfer] transferMultipleNFTs 완료:', txHashes);
      
      setSuccess(`전송 완료: ${nftsToTransfer.length}개의 NFT가 전송되었습니다. 트랜잭션 해시: ${txHashes.join(', ')}`);
      setSelectedNFTs(new Set());
      setToAddress('');
      
      await loadNFTs(); // 반환값은 사용하지 않음 (상태 업데이트만 필요)
    } catch (err: any) {
      console.error('[handleTransfer] NFT 전송 오류:', err);
      setError(err.message || 'Failed to transfer NFTs.');
      setTransferDialogOpen(false);
    } finally {
      console.log('[handleTransfer] transferring 플래그 해제');
      setTransferring(false);
      transferInProgressRef.current = false;
    }
  };

  const handleOpenWalletDialog = async () => {
    setWalletDialogOpen(true);
    if (account) {
      // Refresh balance when opening dialog
      await loadTokenBalance();
    }
  };

  const handleDisconnect = () => {
    setAccount(null);
    setNfts([]);
    setSelectedNFTs(new Set());
    setWalletDialogOpen(false);
    setTokenBalance('0');
  };

  // Count NFTs by collection
  const getNFTCountsByCollection = () => {
    const counts = new Map<string, number>();
    nfts.forEach(nft => {
      const collection = nft.name || nft.symbol || 'Unknown';
      counts.set(collection, (counts.get(collection) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const handleOpenDetail = async (nft: NFTBalance) => {
    setSelectedNFTDetail(nft);
    setTraits([]);
    setLoadingTraits(true);
    setDetailDialogOpen(true);
    
    try {
      console.log('Opening detail for NFT:', nft);
      console.log('tokenUri:', nft.tokenUri);
      console.log('tokenId:', nft.tokenId);
      
      let metadata = null;
      let attributes: any[] = [];
      
      // 방법 1: tokenUri가 있으면 메타데이터 조회 (최우선)
      if (nft.tokenUri && nft.tokenUri.trim() !== '') {
        console.log('Fetching metadata from tokenUri:', nft.tokenUri);
        metadata = await fetchNFTMetadata(nft.tokenUri);
        console.log('Fetched metadata from tokenUri:', metadata);
        
        if (metadata && (metadata.attributes || metadata.traits)) {
          attributes = metadata.attributes || metadata.traits || [];
          console.log('Found attributes/traits from tokenUri:', attributes);
          if (Array.isArray(attributes) && attributes.length > 0) {
            setTraits(attributes);
            setLoadingTraits(false);
            return; // 성공하면 여기서 종료
          }
        }
      }
      
      // 방법 2: node-sale-nft-images에서 직접 조회 (마지막 시도)
      if (!attributes || attributes.length === 0) {
        const imageMetadataUrl = `https://node-sale-nft-images.0g.ai/${nft.tokenId}.json`;
        console.log('Trying image metadata URL as last resort:', imageMetadataUrl);
        try {
          const imageResponse = await fetch(imageMetadataUrl);
          if (imageResponse.ok) {
            const contentType = imageResponse.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              const imageData = await imageResponse.json();
              console.log('Fetched metadata from image URL:', imageData);
              if (imageData.attributes || imageData.traits) {
                attributes = imageData.attributes || imageData.traits || [];
                console.log('Found attributes/traits from image URL:', attributes);
              }
            }
          } else {
            console.warn('Image metadata URL failed:', imageResponse.status, imageResponse.statusText);
          }
        } catch (imageError) {
          console.error('Image metadata fetch error:', imageError);
        }
      }
      
      // 방법 3: 여전히 없으면 chainscan API 시도
      if (!attributes || attributes.length === 0) {
        console.log('Trying chainscan API as fallback...');
        const chainscanData = await fetchNFTMetadataFromChainscan(nft.contractAddress, nft.tokenId);
        if (chainscanData) {
          console.log('Chainscan data:', chainscanData);
          if (chainscanData.attributes || chainscanData.traits) {
            attributes = chainscanData.attributes || chainscanData.traits || [];
            console.log('Found attributes/traits from chainscan:', attributes);
          } else if (chainscanData.result?.attributes || chainscanData.result?.traits) {
            attributes = chainscanData.result.attributes || chainscanData.result.traits || [];
            console.log('Found attributes/traits from chainscan result:', attributes);
          }
        }
      }
      
      // 최종적으로 attributes 설정
      if (Array.isArray(attributes) && attributes.length > 0) {
        console.log('Setting traits:', attributes);
        setTraits(attributes);
      } else {
        console.warn('No attributes found after all attempts. Final attributes:', attributes);
      }
    } catch (error) {
      console.error('Failed to load NFT metadata:', error);
    } finally {
      setLoadingTraits(false);
    }
  };

  const handleCloseDetail = () => {
    setDetailDialogOpen(false);
    setSelectedNFTDetail(null);
    setTraits([]);
  };

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box
        sx={{
          minHeight: '100vh',
          background: '#141218', // Material Design 3 Surface
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <AppBar
          position="fixed"
          elevation={0}
          sx={{
            background: 'rgba(20, 18, 24, 0.95)',
            backdropFilter: 'blur(20px) saturate(180%)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            zIndex: 1100,
            boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.2), 0px 1px 3px rgba(0, 0, 0, 0.1)',
          }}
        >
          <Toolbar sx={{ minHeight: { xs: '56px !important', sm: '64px !important', md: '72px !important' }, px: { xs: 1.5, sm: 2, md: 3 }, py: { xs: 1, sm: 1.5, md: 2 } }}>
            <Box
              component="img"
              src="https://docs.0g.ai/img/0G-Logo-Dark.svg"
              alt="0G Logo"
              sx={{
                height: { xs: 28, sm: 36, md: 44 },
                width: 'auto',
                mr: { xs: 1.5, sm: 2, md: 2.5 },
                flexShrink: 0,
              }}
            />
            <Typography 
              variant="h5" 
              component="div" 
              sx={{ 
                flexGrow: 1, 
                fontWeight: 600, 
                fontSize: { xs: '0.875rem', sm: '1.125rem', md: '1.5rem' },
                letterSpacing: '-0.02em', 
                color: '#e6e0e9',
                lineHeight: 1.2,
                wordBreak: 'break-word',
              }}
            >
              AI Alignment Node Dashboard
            </Typography>
            {account ? (
              <Chip
                label={formatAddress(account)}
                onClick={handleOpenWalletDialog}
                sx={{
                  fontFamily: 'monospace',
                  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.08) 100%)',
                  color: '#e6e0e9',
                  cursor: 'pointer',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '10px',
                  fontWeight: 500,
                  fontSize: '0.8125rem',
                  height: '36px',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  backdropFilter: 'blur(10px)',
                  '&:hover': {
                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0.12) 100%)',
                    borderColor: 'rgba(255, 255, 255, 0.25)',
                    transform: 'translateY(-1px)',
                    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.15)',
                  },
                }}
              />
            ) : (
              <Button
                variant="contained"
                startIcon={<WalletIcon />}
                onClick={handleConnect}
                disabled={loading || !isMetaMaskInstalled()}
                sx={{
                  backgroundColor: '#2962ff',
                  color: '#ffffff',
                  fontWeight: 600,
                  borderRadius: '10px',
                  px: 3,
                  py: 1.25,
                  boxShadow: '0px 2px 4px rgba(41, 98, 255, 0.3), 0px 4px 8px rgba(0, 0, 0, 0.15)',
                  '&:hover': {
                    backgroundColor: '#3d72ff',
                    boxShadow: '0px 4px 8px rgba(41, 98, 255, 0.4), 0px 8px 16px rgba(0, 0, 0, 0.2)',
                    transform: 'translateY(-1px)',
                  },
                  '&.Mui-disabled': {
                    backgroundColor: 'rgba(41, 98, 255, 0.3)',
                    color: 'rgba(255, 255, 255, 0.5)',
                  },
                }}
              >
                {loading ? 'Connecting...' : 'Connect MetaMask'}
              </Button>
            )}
          </Toolbar>
        </AppBar>

        <Container maxWidth="lg" sx={{ mt: 11, mb: 12, pt: 3, px: { xs: 2, sm: 3, md: 4 } }}>
          {error && (
            <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {success && (
            <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess(null)}>
              {success}
            </Alert>
          )}

          {account && (
            <>
              {/* Wallet Portfolio Summary */}
              <Paper
                elevation={0}
                sx={{
                  p: 4,
                  mb: 4,
                  background: 'rgba(30, 35, 48, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '20px',
                  backdropFilter: 'blur(10px)',
                  boxShadow: '0px 4px 16px rgba(0, 0, 0, 0.15), 0px 2px 6px rgba(0, 0, 0, 0.1)',
                }}
              >
                <Typography 
                  variant="h5" 
                  sx={{ 
                    mb: 3.5, 
                    fontWeight: 600,
                    color: '#e6e0e9',
                    letterSpacing: '-0.01em',
                    fontSize: '1.5rem',
                  }}
                >
                  Portfolio Summary
                </Typography>
                <Grid container spacing={3}>
                  {/* Left side - Tiles */}
                  <Grid item xs={12} md={6}>
                    <Grid container spacing={2}>
                      {/* 0G Token Balance */}
                      <Grid item xs={12} sm={6}>
                        <Box
                          sx={{
                            p: 2.5,
                            background: 'rgba(255, 255, 255, 0.05)',
                            borderRadius: '16px',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            '&:hover': {
                              borderColor: 'rgba(255, 255, 255, 0.16)',
                              background: 'rgba(255, 255, 255, 0.08)',
                              transform: 'translateY(-2px)',
                              boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.2)',
                            },
                            height: '100%',
                          }}
                        >
                          <Typography 
                            variant="caption" 
                            color="text.secondary" 
                            sx={{ 
                              display: 'block', 
                              mb: 2,
                              fontSize: '0.6875rem',
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              letterSpacing: '1px',
                              opacity: 0.7,
                            }}
                          >
                            0G Token Balance
                          </Typography>
                          {loadingBalance ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                              <CircularProgress size={20} />
                              <Typography variant="body2" color="text.secondary">Loading...</Typography>
                            </Box>
                          ) : (
                            <>
                              <Typography 
                                variant="h4" 
                                sx={{ 
                                  fontWeight: 700,
                                  mb: 1.5,
                                  color: '#ffffff',
                                  lineHeight: 1.2,
                                  fontSize: { xs: '1.25rem', sm: '1.5rem', md: '1.75rem' },
                                  letterSpacing: '-0.02em',
                                  wordBreak: 'break-word',
                                }}
                              >
                                {parseFloat(tokenBalance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 0G
                              </Typography>
                              {zeroGPrice && (
                                <Typography 
                                  variant="body2" 
                                  sx={{ 
                                    color: '#a8c5ff',
                                    fontWeight: 500,
                                    fontSize: { xs: '0.75rem', sm: '0.8125rem', md: '0.875rem' },
                                    opacity: 0.9,
                                    wordBreak: 'break-word',
                                  }}
                                >
                                  ≈ ${(parseFloat(tokenBalance) * zeroGPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </Typography>
                              )}
                            </>
                          )}
                        </Box>
                      </Grid>

                      {/* NFT Count */}
                      <Grid item xs={12} sm={6}>
                        <Box
                          sx={{
                            p: 3,
                            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.03) 100%)',
                            borderRadius: '16px',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            backdropFilter: 'blur(10px)',
                            '&:hover': {
                              borderColor: 'rgba(255, 255, 255, 0.18)',
                              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.06) 100%)',
                              transform: 'translateY(-3px)',
                              boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.25), 0px 4px 12px rgba(0, 0, 0, 0.15)',
                            },
                            height: '100%',
                          }}
                        >
                          <Typography 
                            variant="caption" 
                            color="text.secondary" 
                            sx={{ 
                              display: 'block', 
                              mb: 2,
                              fontSize: '0.6875rem',
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              letterSpacing: '1px',
                              opacity: 0.7,
                            }}
                          >
                            Total NFTs
                          </Typography>
                          <Typography 
                            variant="h4" 
                            sx={{ 
                              fontWeight: 700,
                              color: '#ffffff',
                              lineHeight: 1.2,
                              fontSize: { xs: '1.25rem', sm: '1.5rem', md: '1.75rem' },
                              letterSpacing: '-0.02em',
                              mb: 1.5,
                            }}
                          >
                            {nfts.length}
                          </Typography>
                          {(() => {
                            let totalRemaining = 0;
                            // nfts 배열을 기준으로 nodeInfoMap에서 정보를 찾아 계산 (정확한 키 매칭)
                            nfts.forEach((nft) => {
                              const key = `${nft.contractAddress}-${nft.tokenId}`;
                              const info = nodeInfoMap.get(key);
                              if (info) {
                                const remaining = parseFloat(info.totalRemaining || '0');
                                if (!isNaN(remaining)) {
                                  totalRemaining += remaining;
                                }
                              }
                            });
                            
                            return zeroGPrice && totalRemaining > 0 ? (
                              <Typography 
                                variant="body2" 
                                sx={{ 
                                  color: '#a8c5ff',
                                  fontWeight: 500,
                                  fontSize: { xs: '0.75rem', sm: '0.8125rem', md: '0.875rem' },
                                  opacity: 0.9,
                                  wordBreak: 'break-word',
                                }}
                              >
                                Remaining: ≈ ${(totalRemaining * zeroGPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </Typography>
                            ) : null;
                          })()}
                        </Box>
                      </Grid>

                      {/* Expected EARN */}
                      <Grid item xs={12}>
                        <Box
                          sx={{
                            p: 3,
                            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.03) 100%)',
                            borderRadius: '16px',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            backdropFilter: 'blur(10px)',
                            '&:hover': {
                              borderColor: 'rgba(255, 255, 255, 0.18)',
                              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.06) 100%)',
                              transform: 'translateY(-2px)',
                              boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.2), 0px 4px 12px rgba(0, 0, 0, 0.15)',
                            },
                          }}
                        >
                          <Typography 
                            variant="caption" 
                            color="text.secondary" 
                            sx={{ 
                              display: 'block', 
                              mb: 2.5,
                              fontSize: '0.6875rem',
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              letterSpacing: '1px',
                              opacity: 0.7,
                            }}
                          >
                            Expected EARN
                          </Typography>
                          {(() => {
                            const earnPerNFTPerDay = 0.52;
                            const totalNFTs = nfts.length;
                            const dailyEarn = totalNFTs * earnPerNFTPerDay;
                            const monthlyEarn = dailyEarn * 30;
                            const yearlyEarn = dailyEarn * 365;

                            const earnItems = [
                              { period: '1 Day', value: dailyEarn, color: '#4caf50' },
                              { period: '1 Month', value: monthlyEarn, color: '#2962ff' },
                              { period: '1 Year', value: yearlyEarn, color: '#ff9800' },
                            ];

                            return (
                              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                {earnItems.map((item, index) => (
                                  <Box
                                    key={index}
                                    sx={{
                                      p: 2.5,
                                      background: `linear-gradient(135deg, rgba(${item.color === '#4caf50' ? '76, 175, 80' : item.color === '#2962ff' ? '41, 98, 255' : '255, 152, 0'}, 0.12) 0%, rgba(${item.color === '#4caf50' ? '76, 175, 80' : item.color === '#2962ff' ? '41, 98, 255' : '255, 152, 0'}, 0.06) 100%)`,
                                      borderRadius: '12px',
                                      border: `1px solid rgba(${item.color === '#4caf50' ? '76, 175, 80' : item.color === '#2962ff' ? '41, 98, 255' : '255, 152, 0'}, 0.25)`,
                                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                      backdropFilter: 'blur(8px)',
                                      '&:hover': {
                                        borderColor: `rgba(${item.color === '#4caf50' ? '76, 175, 80' : item.color === '#2962ff' ? '41, 98, 255' : '255, 152, 0'}, 0.45)`,
                                        background: `linear-gradient(135deg, rgba(${item.color === '#4caf50' ? '76, 175, 80' : item.color === '#2962ff' ? '41, 98, 255' : '255, 152, 0'}, 0.18) 0%, rgba(${item.color === '#4caf50' ? '76, 175, 80' : item.color === '#2962ff' ? '41, 98, 255' : '255, 152, 0'}, 0.1) 100%)`,
                                        transform: 'translateY(-2px)',
                                        boxShadow: `0px 4px 16px rgba(${item.color === '#4caf50' ? '76, 175, 80' : item.color === '#2962ff' ? '41, 98, 255' : '255, 152, 0'}, 0.2)`,
                                      },
                                    }}
                                  >
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                      <Box sx={{ width: 14, height: 14, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                                      <Box sx={{ flex: 1 }}>
                                        <Typography 
                                          variant="body1" 
                                          sx={{ 
                                            color: 'text.primary', 
                                            fontWeight: 600, 
                                            fontSize: { xs: '0.8125rem', sm: '0.875rem', md: '0.9375rem' },
                                            lineHeight: 1.5,
                                            wordBreak: 'break-word',
                                          }}
                                        >
                                          {item.period}: {item.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 0G
                                          {zeroGPrice && (
                                            <Typography component="span" sx={{ color: 'primary.light', ml: { xs: 0.5, sm: 1 }, fontSize: { xs: '0.75rem', sm: '0.8125rem', md: '0.875rem' }, display: { xs: 'block', sm: 'inline' } }}>
                                              (≈ ${(item.value * zeroGPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                                            </Typography>
                                          )}
                                        </Typography>
                                      </Box>
                                    </Box>
                                  </Box>
                                ))}
                              </Box>
                            );
                          })()}
                        </Box>
                      </Grid>
                    </Grid>
                  </Grid>

                  {/* Right side - Allocation Overview */}
                  <Grid item xs={12} md={6}>
                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2.5,
                        p: 3,
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.03) 100%)',
                        borderRadius: '16px',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        backdropFilter: 'blur(10px)',
                        '&:hover': {
                          borderColor: 'rgba(255, 255, 255, 0.18)',
                          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.06) 100%)',
                          transform: 'translateY(-2px)',
                          boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.2), 0px 4px 12px rgba(0, 0, 0, 0.15)',
                        },
                        height: '100%',
                      }}
                    >
                      {(() => {
                        let totalAllocated = 0;
                        let totalClaimed = 0;
                        let totalRemaining = 0;
                        
                        // Portfolio Summary 계산: 실제 로드된 NFT의 정보만 합산
                        // nodeInfoMap에는 실제로 로드된 NFT 정보만 있으므로, 이 정보로만 계산
                        const loadedNFTCount = nodeInfoMap.size;
                        const nodeInfoMapKeys = Array.from(nodeInfoMap.keys());
                        
                        console.log(`[Portfolio Summary 계산 시작] nodeInfoMap.size: ${loadedNFTCount}개, nfts.length: ${nfts.length}개`);
                        console.log(`[nodeInfoMap 키 샘플 (처음 10개)]:`, nodeInfoMapKeys.slice(0, 10));
                        console.log(`[nfts 배열 키 샘플 (처음 10개)]:`, nfts.slice(0, 10).map(nft => `${nft.contractAddress}-${nft.tokenId}`));
                        
                        // 모든 NFT의 정보를 순회하여 계산
                        // nfts 배열을 기준으로 nodeInfoMap에서 정보를 찾아 계산 (정확한 키 매칭)
                        let calculatedCount = 0;
                        nfts.forEach((nft) => {
                          const key = `${nft.contractAddress}-${nft.tokenId}`;
                          const info = nodeInfoMap.get(key);
                          if (info) {
                            calculatedCount++;
                            const allocated = parseFloat(info.totalAllocated || '0');
                            const remaining = parseFloat(info.totalRemaining || '0');
                            const claimed = parseFloat(info.totalClaimed || '0');
                            
                            if (!isNaN(allocated)) totalAllocated += allocated;
                            if (!isNaN(remaining)) totalRemaining += remaining;
                            // totalClaimed는 NodeNFTInfo에서 직접 가져오거나, allocated - remaining으로 계산
                            if (!isNaN(claimed) && claimed > 0) {
                              totalClaimed += claimed;
                            } else if (!isNaN(allocated) && !isNaN(remaining)) {
                              totalClaimed += allocated - remaining;
                            }
                          }
                        });
                        
                        // 디버깅 로그 (더 자세한 정보)
                        if (calculatedCount < nfts.length) {
                          console.log(`Portfolio Summary 계산: ${calculatedCount}/${nfts.length}개 NFT 정보 사용 (nodeInfoMap.size: ${loadedNFTCount}, 계산 중...)`);
                          console.log(`  - Total Allocated: ${totalAllocated.toFixed(2)} 0G`);
                          console.log(`  - Total Claimed: ${totalClaimed.toFixed(2)} 0G`);
                          console.log(`  - Total Remaining: ${totalRemaining.toFixed(2)} 0G`);
                          console.log(`  - nodeInfoMap 키 목록 샘플 (처음 5개):`, Array.from(nodeInfoMap.keys()).slice(0, 5));
                          console.log(`  - nfts 배열 키 샘플 (처음 5개):`, nfts.slice(0, 5).map(nft => `${nft.contractAddress}-${nft.tokenId}`));
                        } else {
                          console.log(`Portfolio Summary 계산 완료: ${calculatedCount}개 NFT 정보 사용 (nodeInfoMap.size: ${loadedNFTCount})`);
                        }

                        const claimedPercentage = totalAllocated > 0 ? (totalClaimed / totalAllocated) * 100 : 0;
                        const remainingPercentage = totalAllocated > 0 ? (totalRemaining / totalAllocated) * 100 : 0;

                        return (
                          <>
                            {/* Section Title */}
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{
                                fontSize: '0.6875rem',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '1px',
                                opacity: 0.7,
                                mb: 2,
                              }}
                            >
                              Allocation Overview
                            </Typography>
                            
                            {/* Compact Donut Chart */}
                            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2.5 }}>
                              <Box sx={{ position: 'relative', width: 110, height: 110, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg width="110" height="110" viewBox="0 0 110 110" style={{ transform: 'rotate(-90deg)' }}>
                                  {/* Background circle */}
                                  <circle
                                    cx="55"
                                    cy="55"
                                    r="45"
                                    fill="none"
                                    stroke="rgba(255, 255, 255, 0.06)"
                                    strokeWidth="18"
                                  />
                                  {/* Remaining (blue) - starts from top */}
                                  <circle
                                    cx="55"
                                    cy="55"
                                    r="45"
                                    fill="none"
                                    stroke="#2962ff"
                                    strokeWidth="18"
                                    strokeDasharray={`${2 * Math.PI * 45 * (remainingPercentage / 100)} ${2 * Math.PI * 45}`}
                                    strokeDashoffset="0"
                                    strokeLinecap="round"
                                  />
                                  {/* Claimed (green) - after remaining */}
                                  <circle
                                    cx="55"
                                    cy="55"
                                    r="45"
                                    fill="none"
                                    stroke="#4caf50"
                                    strokeWidth="18"
                                    strokeDasharray={`${2 * Math.PI * 45 * (claimedPercentage / 100)} ${2 * Math.PI * 45}`}
                                    strokeDashoffset={`-${2 * Math.PI * 45 * (remainingPercentage / 100)}`}
                                    strokeLinecap="round"
                                  />
                                </svg>
                              </Box>
                            </Box>

                            {/* Legend */}
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              {/* Allocation */}
                              <Box 
                                sx={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: 2,
                                  p: 2.5,
                                  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)',
                                  borderRadius: '12px',
                                  border: '1px solid rgba(255, 255, 255, 0.08)',
                                  backdropFilter: 'blur(8px)',
                                  transition: 'all 0.2s ease',
                                  '&:hover': {
                                    borderColor: 'rgba(255, 255, 255, 0.12)',
                                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.04) 100%)',
                                  },
                                }}
                              >
                                <Box sx={{ width: 16, height: 16, borderRadius: '50%', background: '#ffffff', flexShrink: 0 }} />
                                <Box sx={{ flex: 1 }}>
                                  <Typography 
                                    variant="body1" 
                                    sx={{ 
                                      color: '#ffffff', 
                                      fontWeight: 600, 
                                      fontSize: { xs: '0.8125rem', sm: '0.875rem', md: '0.9375rem' },
                                      lineHeight: 1.5,
                                      letterSpacing: '0.01em',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    Allocation: {totalAllocated.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 0G
                                  </Typography>
                                </Box>
                              </Box>
                              
                              {/* Claimed */}
                              <Box 
                                sx={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: 2,
                                  p: 2.5,
                                  background: 'linear-gradient(135deg, rgba(76, 175, 80, 0.12) 0%, rgba(76, 175, 80, 0.06) 100%)',
                                  borderRadius: '12px',
                                  border: '1px solid rgba(76, 175, 80, 0.25)',
                                  backdropFilter: 'blur(8px)',
                                  transition: 'all 0.2s ease',
                                  '&:hover': {
                                    borderColor: 'rgba(76, 175, 80, 0.35)',
                                    background: 'linear-gradient(135deg, rgba(76, 175, 80, 0.16) 0%, rgba(76, 175, 80, 0.08) 100%)',
                                  },
                                }}
                              >
                                <Box sx={{ width: 16, height: 16, borderRadius: '50%', background: '#4caf50', flexShrink: 0 }} />
                                <Box sx={{ flex: 1 }}>
                                  <Typography 
                                    variant="body1" 
                                    sx={{ 
                                      color: '#ffffff', 
                                      fontWeight: 600, 
                                      fontSize: { xs: '0.8125rem', sm: '0.875rem', md: '0.9375rem' },
                                      lineHeight: 1.5,
                                      letterSpacing: '0.01em',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    Claimed: {totalClaimed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 0G ({claimedPercentage.toFixed(1)}%)
                                  </Typography>
                                </Box>
                              </Box>
                              
                              {/* Remaining */}
                              <Box 
                                sx={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: 2,
                                  p: 2.5,
                                  background: 'linear-gradient(135deg, rgba(41, 98, 255, 0.12) 0%, rgba(41, 98, 255, 0.06) 100%)',
                                  borderRadius: '12px',
                                  border: '1px solid rgba(41, 98, 255, 0.25)',
                                  backdropFilter: 'blur(8px)',
                                  transition: 'all 0.2s ease',
                                  '&:hover': {
                                    borderColor: 'rgba(41, 98, 255, 0.35)',
                                    background: 'linear-gradient(135deg, rgba(41, 98, 255, 0.16) 0%, rgba(41, 98, 255, 0.08) 100%)',
                                  },
                                }}
                              >
                                <Box sx={{ width: 16, height: 16, borderRadius: '50%', background: '#2962ff', flexShrink: 0 }} />
                                <Box sx={{ flex: 1 }}>
                                  <Typography 
                                    variant="body1" 
                                    sx={{ 
                                      color: '#a8c5ff', 
                                      fontWeight: 600, 
                                      fontSize: { xs: '0.8125rem', sm: '0.875rem', md: '0.9375rem' },
                                      lineHeight: 1.5,
                                      letterSpacing: '0.01em',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    Remaining: {totalRemaining.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 0G ({remainingPercentage.toFixed(1)}%)
                                  </Typography>
                                </Box>
                              </Box>
                            </Box>
                          </>
                        );
                      })()}
                    </Box>
                  </Grid>
                </Grid>
              </Paper>

              <Paper
                elevation={0}
                sx={{
                  p: 4,
                  mb: 4,
                  background: 'rgba(30, 35, 48, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '20px',
                  backdropFilter: 'blur(10px)',
                  boxShadow: '0px 4px 16px rgba(0, 0, 0, 0.15), 0px 2px 6px rgba(0, 0, 0, 0.1)',
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mb: 3.5,
                  }}
                >
                  <Typography variant="h5" sx={{ fontWeight: 600, color: '#e6e0e9', fontSize: '1.5rem', letterSpacing: '-0.01em' }}>
                    My NFT List ({nfts.length})
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    {nfts.length > 0 && (
                      <Button
                        variant="outlined"
                        onClick={handleSelectAll}
                        size="small"
                      >
                        {selectedNFTs.size === nfts.length ? 'Deselect All' : 'Select All'}
                      </Button>
                    )}
                    <Button
                      variant="contained"
                      size="medium"
                      startIcon={<SendIcon />}
                      onClick={() => setTransferDialogOpen(true)}
                      disabled={transferring || selectedNFTs.size === 0}
                    >
                      {transferring ? (
                        <CircularProgress size={20} color="inherit" />
                      ) : (
                        `Transfer ${selectedNFTs.size}`
                      )}
                    </Button>
                  </Box>
                </Box>

                <Divider sx={{ mb: 3.5, borderColor: 'rgba(255, 255, 255, 0.08)', borderWidth: '1px' }} />

                {loading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                    <CircularProgress />
                  </Box>
                ) : nfts.length === 0 ? (
                  <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
                    <Typography variant="body1">No NFTs found.</Typography>
                  </Box>
                ) : (
                  <>
                    <Grid container spacing={2} sx={{ 
                      '& .MuiGrid-item': {
                        flexBasis: '20%',
                        maxWidth: '20%',
                        '@media (max-width: 1200px)': {
                          flexBasis: '25%',
                          maxWidth: '25%',
                        },
                        '@media (max-width: 900px)': {
                          flexBasis: '33.333%',
                          maxWidth: '33.333%',
                        },
                        '@media (max-width: 600px)': {
                          flexBasis: '50%',
                          maxWidth: '50%',
                        },
                      }
                    }}>
                      {nfts
                        .slice((page - 1) * itemsPerPage, page * itemsPerPage)
                        .map((nft) => {
                      const key = `${nft.contractAddress}-${nft.tokenId}`;
                      const isSelected = selectedNFTs.has(key);
                      
                      return (
                        <Grid item key={key}>
                          <Card
                            sx={{
                              cursor: 'pointer',
                              position: 'relative',
                              border: isSelected ? '2px solid' : '1.5px solid',
                              borderColor: isSelected ? '#2962ff' : 'rgba(255, 255, 255, 0.1)',
                              background: isSelected
                                ? 'linear-gradient(135deg, rgba(41, 98, 255, 0.15) 0%, rgba(41, 98, 255, 0.08) 100%)'
                                : 'linear-gradient(135deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.02) 100%)',
                              borderRadius: '16px',
                              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                              backdropFilter: 'blur(10px)',
                              height: '100%',
                              display: 'flex',
                              flexDirection: 'column',
                              overflow: 'hidden',
                              boxShadow: isSelected 
                                ? '0px 4px 16px rgba(41, 98, 255, 0.3), 0px 2px 8px rgba(0, 0, 0, 0.2)'
                                : '0px 2px 8px rgba(0, 0, 0, 0.1), 0px 1px 3px rgba(0, 0, 0, 0.05)',
                              '&:hover': {
                                borderColor: isSelected ? '#2962ff' : 'rgba(255, 255, 255, 0.2)',
                                background: isSelected
                                  ? 'linear-gradient(135deg, rgba(41, 98, 255, 0.2) 0%, rgba(41, 98, 255, 0.12) 100%)'
                                  : 'linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.04) 100%)',
                                transform: 'translateY(-4px)',
                                boxShadow: isSelected
                                  ? '0px 8px 24px rgba(41, 98, 255, 0.4), 0px 4px 12px rgba(0, 0, 0, 0.25)'
                                  : '0px 4px 16px rgba(0, 0, 0, 0.2), 0px 2px 8px rgba(0, 0, 0, 0.15)',
                              },
                            }}
                            onClick={() => toggleNFTSelection(nft)}
                          >
                            <Checkbox
                              checked={isSelected}
                              onChange={() => toggleNFTSelection(nft)}
                              onClick={(e) => e.stopPropagation()}
                              sx={{
                                position: 'absolute',
                                top: 8,
                                right: 8,
                                zIndex: 10,
                                color: 'rgba(255, 255, 255, 0.5)',
                                '&.Mui-checked': {
                                  color: '#FFFFFF',
                                },
                                p: 0.5,
                              }}
                            />
                            {nft.image ? (
                              <CardMedia
                                component="img"
                                height="180"
                                image={nft.image}
                                alt={nft.name || 'NFT'}
                                sx={{ objectFit: 'cover' }}
                              />
                            ) : (
                              <Box
                                sx={{
                                  height: 180,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  background: 'rgba(103, 80, 164, 0.1)',
                                }}
                              >
                                <Typography variant="body2" color="text.secondary">No Image</Typography>
                              </Box>
                            )}
                            <CardContent sx={{ flex: 1, p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                              <Box>
                                <Typography
                                  variant="body2"
                                  component="div"
                                  sx={{
                                    fontWeight: 500,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    fontSize: '0.875rem',
                                    mb: 0.5,
                                  }}
                                >
                                  {nft.name || 'Unnamed'}
                                </Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}
                                  >
                                    #{nft.tokenId}
                                  </Typography>
                                  <Button
                                    size="small"
                                    variant="contained"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenDetail(nft);
                                    }}
                                    sx={{
                                      fontSize: '0.7rem',
                                      py: 0.5,
                                      px: 1.5,
                                      minWidth: 'auto',
                                      backgroundColor: 'rgba(255, 255, 255, 0.15)',
                                      color: '#e6e0e9',
                                      fontWeight: 500,
                                      textTransform: 'none',
                                      borderRadius: '8px',
                                      border: '1px solid rgba(255, 255, 255, 0.2)',
                                      boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
                                      '&:hover': {
                                        backgroundColor: 'rgba(255, 255, 255, 0.25)',
                                        color: '#ffffff',
                                        borderColor: 'rgba(255, 255, 255, 0.3)',
                                        boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.15)',
                                      },
                                    }}
                                  >
                                    Detail
                                  </Button>
                                </Box>
                              </Box>
                              
                              {/* Progress Bar for Part 1 + Part 2 */}
                              {(() => {
                                const nftKey = `${nft.contractAddress}-${nft.tokenId}`;
                                const isLoading = loadingNodeInfoMap.has(nftKey);
                                const info = nodeInfoMap.get(nftKey);
                                
                                if (isLoading) {
                                  return (
                                    <Box sx={{ mt: 'auto', pt: 1, display: 'flex', justifyContent: 'center' }}>
                                      <CircularProgress size={14} sx={{ color: 'primary.main' }} />
                                    </Box>
                                  );
                                }
                                
                                if (info) {
                                  const totalAllocated = parseFloat(info.totalAllocated);
                                  const totalRemaining = parseFloat(info.totalRemaining);
                                  const progressPercentage = totalAllocated > 0 
                                    ? (totalRemaining / totalAllocated) * 100 
                                    : 0;
                                  
                                  return (
                                    <Box sx={{ mt: 'auto', pt: 1 }} onClick={(e) => e.stopPropagation()}>
                                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', mb: 0.5, display: 'block' }}>
                                        Remaining: {info.totalRemaining} 0G
                                      </Typography>
                                      <LinearProgress
                                        variant="determinate"
                                        value={progressPercentage}
                                        sx={{
                                          height: 4,
                                          borderRadius: 2,
                                          backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                          '& .MuiLinearProgress-bar': {
                                            borderRadius: 2,
                                            backgroundColor: '#ffffff',
                                          },
                                        }}
                                      />
                                    </Box>
                                  );
                                }
                                
                                return null;
                              })()}
                            </CardContent>
                          </Card>
                        </Grid>
                      );
                    })}
                    </Grid>
                    {/* Pagination and Items per page at bottom */}
                    {nfts.length > 0 && (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 3 }}>
                        <FormControl size="small" sx={{ minWidth: 120 }}>
                          <InputLabel sx={{ color: 'text.secondary' }}>Items per page</InputLabel>
                          <Select
                            value={itemsPerPage}
                            label="Items per page"
                            onChange={(e) => setItemsPerPage(Number(e.target.value))}
                            sx={{
                              color: 'text.primary',
                              '& .MuiOutlinedInput-notchedOutline': {
                                borderColor: 'rgba(255, 255, 255, 0.23)',
                              },
                              '&:hover .MuiOutlinedInput-notchedOutline': {
                                borderColor: 'rgba(255, 255, 255, 0.4)',
                              },
                              '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                borderColor: 'primary.main',
                              },
                            }}
                          >
                            <MenuItem value={10}>10</MenuItem>
                            <MenuItem value={50}>50</MenuItem>
                            <MenuItem value={100}>100</MenuItem>
                          </Select>
                        </FormControl>
                        <Pagination
                          count={Math.ceil(nfts.length / itemsPerPage)}
                          page={page}
                          onChange={(_, value) => setPage(value)}
                          color="primary"
                          sx={{
                            '& .MuiPaginationItem-root': {
                              color: 'text.secondary',
                              '&.Mui-selected': {
                                backgroundColor: 'rgba(103, 80, 164, 0.3)',
                                color: 'primary.main',
                                '&:hover': {
                                  backgroundColor: 'rgba(103, 80, 164, 0.4)',
                                },
                              },
                            },
                          }}
                        />
                      </Box>
                    )}
                  </>
                )}
              </Paper>
            </>
          )}

          {!account && (
            <Paper
              elevation={0}
              sx={{
                p: 8,
                textAlign: 'center',
                background: '#121212',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '4px',
              }}
            >
              <WalletIcon sx={{ fontSize: 64, color: '#FFFFFF', mb: 2 }} />
              <Typography variant="h5" gutterBottom sx={{ color: '#FFFFFF', fontWeight: 500 }}>
                Connect MetaMask
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                Connect MetaMask to view and transfer NFTs on 0G Mainnet.
              </Typography>
              <Button
                variant="contained"
                size="large"
                startIcon={<WalletIcon />}
                onClick={handleConnect}
                disabled={loading || !isMetaMaskInstalled()}
                sx={{
                  backgroundColor: '#FFFFFF',
                  color: '#000000',
                  '&:hover': {
                    backgroundColor: '#E0E0E0',
                  },
                  '&.Mui-disabled': {
                    backgroundColor: 'rgba(255, 255, 255, 0.3)',
                    color: 'rgba(255, 255, 255, 0.5)',
                  },
                }}
              >
                {loading ? 'Connecting...' : 'Connect MetaMask'}
              </Button>
            </Paper>
          )}
        </Container>

        {/* Footer */}
        <Box
          component="footer"
          sx={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            py: 2.5,
            px: { xs: 2, sm: 4 },
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(20, 18, 24, 0.95)',
            backdropFilter: 'blur(20px) saturate(180%)',
            zIndex: 1100,
            boxShadow: '0px -2px 8px rgba(0, 0, 0, 0.15), 0px -1px 3px rgba(0, 0, 0, 0.1)',
          }}
        >
          <Container maxWidth="lg">
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 2,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box
                  component="a"
                  href="https://x.com/stv_8000"
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    color: '#FFFFFF',
                    textDecoration: 'none',
                    '&:hover': {
                      opacity: 0.8,
                    },
                  }}
                >
                  <TwitterIcon sx={{ fontSize: 20, mr: 1 }} />
                  <Typography variant="body2" sx={{ color: '#FFFFFF' }}>
                    Twitter
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box
                  component="img"
                  src="https://pbs.twimg.com/profile_images/1979103782098124800/dNTIJr3x_400x400.png"
                  alt="Steve"
                  onError={(e: any) => {
                    e.target.style.display = 'none';
                  }}
                  sx={{
                    height: 30,
                    width: 30,
                    borderRadius: '50%',
                    display: 'block',
                  }}
                />
                <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                  Powered by Steve
                </Typography>
              </Box>
            </Box>
          </Container>
        </Box>

        {/* Wallet Info Dialog */}
        <Dialog
          open={walletDialogOpen}
          onClose={() => setWalletDialogOpen(false)}
          maxWidth="sm"
          fullWidth
          PaperProps={{
            sx: {
              background: 'rgba(30, 35, 48, 0.95)',
              backdropFilter: 'blur(20px) saturate(180%)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '20px',
            },
          }}
        >
          <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 2, borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <Typography variant="h6" sx={{ color: '#e6e0e9', fontWeight: 600, fontSize: '1.25rem', letterSpacing: '-0.01em' }}>Wallet Information</Typography>
            <IconButton 
              onClick={() => setWalletDialogOpen(false)} 
              size="small"
              sx={{
                color: 'rgba(255, 255, 255, 0.7)',
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  color: '#e6e0e9',
                },
              }}
            >
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent sx={{ backgroundColor: 'transparent', color: '#e6e0e9', p: 4 }}>
            {account && (
              <Box>
                <Box sx={{ mb: 3, p: 2.5, background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.03) 100%)', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.1)', backdropFilter: 'blur(10px)' }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Wallet Address
                  </Typography>
                  <Typography variant="body1" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    {account}
                  </Typography>
                </Box>

                <Box sx={{ mb: 3, p: 2, background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    0G Token Balance
                  </Typography>
                  {loadingBalance ? (
                    <CircularProgress size={20} />
                  ) : (
                    <Typography variant="h5">
                      {tokenBalance} 0G
                    </Typography>
                  )}
                </Box>

                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mb: 1 }}>
                    NFT Count by Collection
                  </Typography>
                  <List dense>
                    {getNFTCountsByCollection().map((item, index) => (
                      <ListItem key={index} sx={{ px: 0 }}>
                        <ListItemText
                          primary={item.name}
                          secondary={`${item.count} NFT(s)`}
                        />
                      </ListItem>
                    ))}
                    {nfts.length === 0 && (
                      <ListItem sx={{ px: 0 }}>
                        <ListItemText primary="No NFTs found" />
                      </ListItem>
                    )}
                  </List>
                </Box>
              </Box>
            )}
          </DialogContent>
          <DialogActions sx={{ p: 2, pt: 1 }}>
            <Button
              startIcon={<RefreshIcon />}
              onClick={async () => {
                // Refresh 버튼: RPC/API 호출을 통해 DB를 최신화
                console.log('[Refresh 버튼] RPC/API 호출로 DB 최신화 시작');
                setLoading(true);
                try {
                  // 1. 먼저 모든 NFT를 로드하고 결과를 직접 받음
                  const loadedNFTs = await loadNFTs(0, true); // forceRefreshFlag=true로 RPC/API 호출하여 DB 업데이트
                  
                  if (!loadedNFTs || loadedNFTs.length === 0) {
                    console.warn('[Refresh 버튼] NFT 로드 실패 또는 빈 결과');
                    return;
                  }
                  
                  console.log(`[Refresh 버튼] NFT 로드 완료: ${loadedNFTs.length}개`);
                  
                  // 2. 모든 NFT가 로드된 후 Portfolio Summary 로드 (로드된 NFT 리스트 직접 전달)
                  await loadPortfolioSummary(0, true, loadedNFTs); // forceRefreshFlag=true로 RPC/API 호출하여 DB 업데이트
                  await loadTokenBalance();
                  await load0GPrice();
                  console.log('[Refresh 버튼] DB 최신화 완료');
                } catch (err) {
                  console.error('[Refresh 버튼] DB 최신화 실패:', err);
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading || loadingBalance}
            >
              Refresh
            </Button>
            <Button
              startIcon={<LogoutIcon />}
              onClick={handleDisconnect}
              color="error"
            >
              Disconnect
            </Button>
          </DialogActions>
        </Dialog>

        {/* Transfer Dialog */}
        <Dialog
          open={transferDialogOpen}
          onClose={() => setTransferDialogOpen(false)}
          maxWidth="sm"
          fullWidth
          PaperProps={{
            sx: {
              background: 'rgba(30, 35, 48, 0.95)',
              backdropFilter: 'blur(20px) saturate(180%)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '20px',
            },
          }}
        >
          <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 2, borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <Typography variant="h6" sx={{ color: '#e6e0e9', fontWeight: 600, fontSize: '1.25rem', letterSpacing: '-0.01em' }}>Transfer NFTs</Typography>
            <IconButton 
              onClick={() => setTransferDialogOpen(false)} 
              size="small"
              sx={{
                color: 'rgba(255, 255, 255, 0.7)',
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  color: '#e6e0e9',
                },
              }}
            >
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent sx={{ backgroundColor: 'transparent', color: '#e6e0e9', p: 4 }}>
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Selected NFTs: {selectedNFTs.size}
              </Typography>
              <TextField
                fullWidth
                label="Recipient Address"
                placeholder="0x..."
                value={toAddress}
                onChange={(e) => setToAddress(e.target.value)}
                sx={{
                  mt: 2,
                  '& .MuiOutlinedInput-root': {
                    fontFamily: 'monospace',
                  },
                }}
              />
            </Box>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setTransferDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="contained"
              startIcon={<SendIcon />}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!transferring && !transferInProgressRef.current) {
                  handleTransfer();
                }
              }}
              disabled={transferring || transferInProgressRef.current || selectedNFTs.size === 0 || !toAddress}
            >
              {transferring ? (
                <CircularProgress size={20} color="inherit" />
              ) : (
                'Transfer'
              )}
            </Button>
          </DialogActions>
        </Dialog>

        {/* NFT Detail Dialog */}
        <Dialog
          open={detailDialogOpen}
          onClose={handleCloseDetail}
          maxWidth="lg"
          fullWidth
          PaperProps={{
            sx: {
              background: '#121212',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            },
          }}
        >
          {selectedNFTDetail && (
            <>
              <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
                <Typography variant="h6" sx={{ color: '#FFFFFF', fontWeight: 500 }}>
                  NFT Detail
                </Typography>
                <IconButton onClick={handleCloseDetail} size="small" sx={{ color: '#FFFFFF' }}>
                  <CloseIcon />
                </IconButton>
              </DialogTitle>
              <DialogContent sx={{ backgroundColor: '#121212', color: '#FFFFFF', p: 3 }}>
                <Grid container spacing={3}>
                  {/* Left: NFT Image */}
                  <Grid item xs={12} md={4}>
                    <Box
                      sx={{
                        position: 'relative',
                        width: '100%',
                        aspectRatio: '1',
                        borderRadius: '16px',
                        overflow: 'hidden',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        mb: 3,
                        boxShadow: '0px 4px 16px rgba(0, 0, 0, 0.2), 0px 2px 8px rgba(0, 0, 0, 0.1)',
                      }}
                    >
                      {selectedNFTDetail.image ? (
                        <img
                          src={selectedNFTDetail.image}
                          alt={selectedNFTDetail.name || `NFT #${selectedNFTDetail.tokenId}`}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                          }}
                        />
                      ) : (
                        <Box
                          sx={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'rgba(255, 255, 255, 0.05)',
                          }}
                        >
                          <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.5)' }}>
                            No Image
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  </Grid>

                  {/* Right: Details */}
                  <Grid item xs={12} md={8}>
                    <Box sx={{ mb: 4 }}>
                      <Typography variant="h6" sx={{ color: '#e6e0e9', fontWeight: 600, mb: 3, fontSize: '1.125rem', letterSpacing: '-0.01em' }}>
                        Details
                      </Typography>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Box sx={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          py: 1.5, 
                          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                          transition: 'all 0.2s ease',
                          '&:hover': {
                            backgroundColor: 'rgba(255, 255, 255, 0.03)',
                            px: 1,
                            borderRadius: '8px',
                          },
                        }}>
                          <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.8125rem', fontWeight: 500 }}>
                            Token ID
                          </Typography>
                          <Typography variant="body2" sx={{ color: '#e6e0e9', fontWeight: 600, fontFamily: 'monospace' }}>
                            {selectedNFTDetail.tokenId}
                          </Typography>
                        </Box>
                        <Box sx={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          py: 1.5, 
                          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                          transition: 'all 0.2s ease',
                          '&:hover': {
                            backgroundColor: 'rgba(255, 255, 255, 0.03)',
                            px: 1,
                            borderRadius: '8px',
                          },
                        }}>
                          <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.8125rem', fontWeight: 500 }}>
                            Token Name
                          </Typography>
                          <Typography variant="body2" sx={{ color: '#e6e0e9', fontWeight: 600 }}>
                            {selectedNFTDetail.name || '--'}
                          </Typography>
                        </Box>
                        {selectedNFTDetail.image && (
                          <Box sx={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            py: 1.5, 
                            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                            transition: 'all 0.2s ease',
                            '&:hover': {
                              backgroundColor: 'rgba(255, 255, 255, 0.03)',
                              px: 1,
                              borderRadius: '8px',
                            },
                          }}>
                            <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.8125rem', fontWeight: 500 }}>
                              Original Content URL
                            </Typography>
                            <Typography
                              variant="body2"
                              component="a"
                              href={selectedNFTDetail.image}
                              target="_blank"
                              rel="noopener noreferrer"
                              sx={{
                                color: '#a8c5ff',
                                textDecoration: 'none',
                                fontWeight: 500,
                                maxWidth: '60%',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                transition: 'all 0.2s ease',
                                '&:hover': {
                                  color: '#2962ff',
                                  textDecoration: 'underline',
                                },
                              }}
                            >
                              {selectedNFTDetail.image}
                            </Typography>
                          </Box>
                        )}
                        {account && (
                          <Box sx={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            py: 1.5, 
                            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                            transition: 'all 0.2s ease',
                            '&:hover': {
                              backgroundColor: 'rgba(255, 255, 255, 0.03)',
                              px: 1,
                              borderRadius: '8px',
                            },
                          }}>
                            <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.8125rem', fontWeight: 500 }}>
                              Owner
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#e6e0e9', fontWeight: 600, fontFamily: 'monospace' }}>
                              {formatAddress(account)}
                            </Typography>
                          </Box>
                        )}
                        <Box sx={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          py: 1.5, 
                          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                          transition: 'all 0.2s ease',
                          '&:hover': {
                            backgroundColor: 'rgba(255, 255, 255, 0.03)',
                            px: 1,
                            borderRadius: '8px',
                          },
                        }}>
                          <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.8125rem', fontWeight: 500 }}>
                            Token Standard
                          </Typography>
                          <Typography variant="body2" sx={{ color: '#e6e0e9', fontWeight: 600 }}>
                            {selectedNFTDetail.type || 'ERC721'}
                          </Typography>
                        </Box>
                        <Box sx={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          py: 1.5, 
                          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                          transition: 'all 0.2s ease',
                          '&:hover': {
                            backgroundColor: 'rgba(255, 255, 255, 0.03)',
                            px: 1,
                            borderRadius: '8px',
                          },
                        }}>
                          <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.8125rem', fontWeight: 500 }}>
                            Contract Address
                          </Typography>
                          <Typography
                            variant="body2"
                            component="a"
                            href={`https://chainscan.0g.ai/address/${selectedNFTDetail.contractAddress}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{
                              color: '#a8c5ff',
                              fontWeight: 600,
                              fontFamily: 'monospace',
                              textDecoration: 'none',
                              transition: 'all 0.2s ease',
                              '&:hover': {
                                color: '#2962ff',
                                textDecoration: 'underline',
                              },
                            }}
                          >
                            {formatAddress(selectedNFTDetail.contractAddress)}
                          </Typography>
                        </Box>
                        {selectedNFTDetail.name && (
                          <Box sx={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            py: 1.5, 
                            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                            transition: 'all 0.2s ease',
                            '&:hover': {
                              backgroundColor: 'rgba(255, 255, 255, 0.03)',
                              px: 1,
                              borderRadius: '8px',
                            },
                          }}>
                            <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.8125rem', fontWeight: 500 }}>
                              Contract Info
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#e6e0e9', fontWeight: 600 }}>
                              {selectedNFTDetail.name} {selectedNFTDetail.symbol ? `(${selectedNFTDetail.symbol})` : ''}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    </Box>
                  </Grid>
                </Grid>

                {/* Traits Section */}
                <Box sx={{ mt: 4 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Typography variant="h6" sx={{ color: '#e6e0e9', fontWeight: 600, fontSize: '1.125rem', letterSpacing: '-0.01em' }}>
                      Trait ({traits.length})
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={() => setTraitsViewMode(traitsViewMode === 'grid' ? 'list' : 'grid')}
                      sx={{
                        color: traitsViewMode === 'grid' ? '#2962ff' : 'rgba(255, 255, 255, 0.5)',
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '10px',
                        transition: 'all 0.2s ease',
                        '&:hover': {
                          backgroundColor: 'rgba(255, 255, 255, 0.1)',
                          borderColor: 'rgba(255, 255, 255, 0.2)',
                        },
                      }}
                    >
                      {traitsViewMode === 'grid' ? <ViewModuleIcon /> : <ViewListIcon />}
                    </IconButton>
                  </Box>
                {loadingTraits ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                    <CircularProgress sx={{ color: '#FFFFFF' }} />
                  </Box>
                ) : traits.length === 0 ? (
                  <Box sx={{ textAlign: 'center', py: 4 }}>
                    <Typography variant="body1" sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                      No traits found for this NFT.
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 1, color: 'rgba(255, 255, 255, 0.5)' }}>
                      This NFT may not have metadata or traits information.
                    </Typography>
                  </Box>
                ) : traitsViewMode === 'grid' ? (
                  <Grid container spacing={2}>
                    {traits.map((trait, index) => {
                      const traitValue = typeof trait.value === 'number' ? trait.value.toString() : trait.value;
                      const count = trait.count || 0;
                      const percentage = trait.percentage || 0;
                      const floorPrice = trait.floor_price;
                      
                      // 색상 결정 (퍼센트에 따라)
                      let highlightColor = '#FFFFFF';
                      if (percentage < 1) {
                        highlightColor = '#FF6B35'; // Orange
                      } else if (percentage < 5) {
                        highlightColor = '#9C27B0'; // Purple
                      } else if (percentage < 15) {
                        highlightColor = '#2196F3'; // Blue
                      }
                      
                      return (
                        <Grid item xs={12} sm={6} md={4} key={index}>
                          <Paper
                            elevation={0}
                            sx={{
                              p: 2,
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              borderRadius: '4px',
                              transition: 'all 0.2s ease',
                              '&:hover': {
                                borderColor: 'rgba(255, 255, 255, 0.2)',
                                background: 'rgba(255, 255, 255, 0.08)',
                              },
                            }}
                          >
                            <Typography
                              variant="caption"
                              sx={{
                                display: 'block',
                                mb: 1,
                                fontSize: '0.7rem',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                color: 'rgba(255, 255, 255, 0.7)',
                              }}
                            >
                              {trait.trait_type}
                            </Typography>
                            <Typography
                              variant="body1"
                              sx={{
                                mb: 1.5,
                                fontWeight: 500,
                                color: '#FFFFFF',
                              }}
                            >
                              {traitValue}
                            </Typography>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                              {count > 0 && (
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                                    Count
                                  </Typography>
                                  <Typography
                                    variant="caption"
                                    sx={{
                                      fontWeight: 600,
                                      color: highlightColor,
                                    }}
                                  >
                                    {count.toLocaleString()}
                                  </Typography>
                                </Box>
                              )}
                              {percentage > 0 && (
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                                    Percentage
                                  </Typography>
                                  <Typography
                                    variant="caption"
                                    sx={{
                                      fontWeight: 600,
                                      color: highlightColor,
                                    }}
                                  >
                                    {percentage.toFixed(2)}%
                                  </Typography>
                                </Box>
                              )}
                              {floorPrice !== undefined && floorPrice !== null && floorPrice !== '-' && (
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                                    Floor Price
                                  </Typography>
                                  <Typography variant="caption" sx={{ fontWeight: 600, color: '#FFFFFF' }}>
                                    {typeof floorPrice === 'number' 
                                      ? `${floorPrice.toFixed(3)} ETH`
                                      : floorPrice}
                                  </Typography>
                                </Box>
                              )}
                            </Box>
                          </Paper>
                        </Grid>
                      );
                    })}
                  </Grid>
                ) : (
                  <Box>
                    {traits.map((trait, index) => {
                      const traitValue = typeof trait.value === 'number' ? trait.value.toString() : trait.value;
                      const count = trait.count || 0;
                      const percentage = trait.percentage || 0;
                      const floorPrice = trait.floor_price;
                      
                      return (
                        <Paper
                          key={index}
                          elevation={0}
                          sx={{
                            p: 2,
                            mb: 2,
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '4px',
                          }}
                        >
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Box>
                              <Typography
                                variant="caption"
                                sx={{
                                  display: 'block',
                                  mb: 0.5,
                                  fontSize: '0.7rem',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.5px',
                                  color: 'rgba(255, 255, 255, 0.7)',
                                }}
                              >
                                {trait.trait_type}
                              </Typography>
                              <Typography variant="body1" sx={{ fontWeight: 500, color: '#FFFFFF' }}>
                                {traitValue}
                              </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                              {count > 0 && (
                                <Box>
                                  <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255, 255, 255, 0.7)' }}>
                                    Count
                                  </Typography>
                                  <Typography variant="body2" sx={{ fontWeight: 600, color: '#FFFFFF' }}>
                                    {count.toLocaleString()}
                                  </Typography>
                                </Box>
                              )}
                              {percentage > 0 && (
                                <Box>
                                  <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255, 255, 255, 0.7)' }}>
                                    Percentage
                                  </Typography>
                                  <Typography variant="body2" sx={{ fontWeight: 600, color: '#FFFFFF' }}>
                                    {percentage.toFixed(2)}%
                                  </Typography>
                                </Box>
                              )}
                              {floorPrice !== undefined && floorPrice !== null && floorPrice !== '-' && (
                                <Box>
                                  <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255, 255, 255, 0.7)' }}>
                                    Floor Price
                                  </Typography>
                                  <Typography variant="body2" sx={{ fontWeight: 600, color: '#FFFFFF' }}>
                                    {typeof floorPrice === 'number' 
                                      ? `${floorPrice.toFixed(3)} ETH`
                                      : floorPrice}
                                  </Typography>
                                </Box>
                              )}
                            </Box>
                          </Box>
                        </Paper>
                      );
                    })}
                  </Box>
                  )}
                </Box>
              </DialogContent>
              <DialogActions sx={{ p: 2, pt: 1 }}>
                <Button onClick={handleCloseDetail} sx={{ color: '#FFFFFF' }}>Close</Button>
              </DialogActions>
            </>
          )}
        </Dialog>
      </Box>
    </ThemeProvider>
  );
}

export default App;
