import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  Alert,
  CircularProgress,
  IconButton,
  Paper,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  LinearProgress,
  Pagination,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Checkbox,
  Chip,
} from '@mui/material';
import {
  Close as CloseIcon,
  Twitter as TwitterIcon,
  Search as SearchIcon,
  OpenInNew as OpenInNewIcon,
  Send as SendIcon,
  AccountBalanceWallet as WalletIcon,
} from '@mui/icons-material';
import { fetchNFTBalances, fetchDelegatedNFTsFromChainscan } from './utils/nftApi';
import { 
  NodeNFTInfo, 
  getClaimDataBatchFromDB,
  fetchNodeNFTInfoBatch,
  createNodeNFTInfoFromBatchData
} from './utils/nodeCheckerApi';
import { getTokenBalance, get0GPrice, get0GPriceWithKRW, get0GMarketChart, get0GPriceFromDB } from './utils/balance';
import { 
  connectWallet, 
  switchToZeroGNetwork, 
  getCurrentAccount, 
  isMetaMaskInstalled 
} from './utils/metamask';
import { transferMultipleNFTs } from './utils/nftTransfer';
import { NFTBalance } from './types';
import { darkTheme } from './theme';

const STEVE_ADDRESS = '0x00AEA25EFa4C90bd9A7F6725BD2202a88564EB80';

function StevePage() {
  const { address } = useParams<{ address: string }>();
  const navigate = useNavigate();
  
  const isValidAddress = (addr: string | undefined): boolean => {
    if (!addr) return false;
    return addr.startsWith('0x') && addr.length === 42;
  };
  
  const [account, setAccount] = useState<string>(() => {
    if (address && isValidAddress(address)) {
      return address.toLowerCase();
    }
    return STEVE_ADDRESS;
  });
  const [searchAddress, setSearchAddress] = useState<string>('');
  const [nfts, setNfts] = useState<NFTBalance[]>([]);
  const [delegatedNFTKeys, setDelegatedNFTKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedNFTDetail, setSelectedNFTDetail] = useState<NFTBalance | null>(null);
  const [nodeInfoMap, setNodeInfoMap] = useState<Map<string, NodeNFTInfo>>(new Map());
  const [loadingNodeInfoMap] = useState<Set<string>>(new Set());
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loadingTransfers, setLoadingTransfers] = useState(false);
  const [tokenBalance, setTokenBalance] = useState<string>('0');
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [zeroGPrice, setZeroGPrice] = useState<number | null>(null);
  const [zeroGPriceKRW, setZeroGPriceKRW] = useState<number | null>(null);
  const [priceChange24h, setPriceChange24h] = useState<number | null>(null);
  const [marketCapUsd, setMarketCapUsd] = useState<number | null>(null);
  const [marketCapKrw, setMarketCapKrw] = useState<number | null>(null);
  const [chartData, setChartData] = useState<Array<{ timestamp: number; price: number }> | null>(null);
  const [hoveredPrice, setHoveredPrice] = useState<{ price: number; x: number; y: number; index: number } | null>(null);
  const [chartPeriod, setChartPeriod] = useState<'1D' | '7D' | '1M' | '1Y'>('1D');
  const [currency, setCurrency] = useState<'USD' | 'KRW'>(() => {
    const savedCurrency = localStorage.getItem('0gnft_currency') as 'USD' | 'KRW' | null;
    return savedCurrency || 'USD';
  });
  
  const [portfolioSummary, setPortfolioSummary] = useState<{
    totalAllocated: number;
    totalClaimed: number;
    totalRemaining: number;
    totalEarned: number;
  } | null>(null);
  
  const [connectedWallet, setConnectedWallet] = useState<string | null>(null);
  const [selectedNFTs, setSelectedNFTs] = useState<Set<string>>(new Set());
  const [toAddress, setToAddress] = useState('');
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const transferInProgressRef = useRef(false);

  useEffect(() => {
    if (address && isValidAddress(address)) {
      const normalizedAddress = address.toLowerCase();
      if (normalizedAddress !== account.toLowerCase()) {
        setAccount(normalizedAddress);
      }
    } else if (address && !isValidAddress(address)) {
      navigate(`/${STEVE_ADDRESS}`, { replace: true });
    }
  }, [address, account, navigate]);

  useEffect(() => {
    if (account) {
      setNfts([]);
      setDelegatedNFTKeys(new Set());
      setNodeInfoMap(new Map());
      setTokenBalance('0');
      setPortfolioSummary(null);
      
      loadNFTs();
      loadTokenBalance();
    }
  }, [account]);

  useEffect(() => {
    load0GPrice();
    loadChartData();
  }, []);

  useEffect(() => {
    loadChartData();
  }, [chartPeriod]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      load0GPrice();
    }, 300000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    setPage(1);
  }, [itemsPerPage]);

  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    if (!isMetaMaskInstalled()) {
      return;
    }

    try {
      // Check and switch to 0G network if needed
      await switchToZeroGNetwork();
      
      const currentAccount = await getCurrentAccount();
      if (currentAccount) {
        setConnectedWallet(currentAccount.toLowerCase());
      }
    } catch (err) {
      // Silently fail - user may not have MetaMask connected
      console.warn('Network check failed:', err);
    }
  };

  const handleConnect = async () => {
    try {
      setError(null);
      setLoading(true);
      
      await switchToZeroGNetwork();
      const address = await connectWallet();
      const normalizedAddress = address.toLowerCase();
      setConnectedWallet(normalizedAddress);
      
      navigate(`/${normalizedAddress}`, { replace: true });
    } catch (err: any) {
      setError(err.message || 'Failed to connect wallet.');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = () => {
    setConnectedWallet(null);
    setSelectedNFTs(new Set());
    setToAddress('');
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

  const handleTransfer = async () => {
    if (transferring || transferInProgressRef.current) {
      return;
    }

    if (!connectedWallet || !toAddress) {
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

    if (connectedWallet.toLowerCase() !== account.toLowerCase()) {
      setError('Connected wallet address does not match the displayed address.');
      return;
    }

    try {
      setError(null);
      setSuccess(null);
      setTransferring(true);
      transferInProgressRef.current = true;
      
      const nftsToTransfer = nfts.filter(
        nft => selectedNFTs.has(`${nft.contractAddress}-${nft.tokenId}`)
      );

      if (nftsToTransfer.length > 1) {
        setSuccess(`Transferring ${nftsToTransfer.length} NFTs. Please confirm each transaction in MetaMask.`);
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
      
      setTransferDialogOpen(false);

      const txHashes = await transferMultipleNFTs(nftsToTransfer, toAddress, connectedWallet);
      
      setSuccess(`Transfer complete: ${nftsToTransfer.length} NFT(s) transferred. Transaction hash: ${txHashes.join(', ')}`);
      setSelectedNFTs(new Set());
      setToAddress('');
      
      await loadNFTs();
    } catch (err: any) {
      console.error('NFT transfer error:', err);
      setError(err.message || 'Failed to transfer NFTs.');
      setTransferDialogOpen(false);
    } finally {
      setTransferring(false);
      transferInProgressRef.current = false;
    }
  };

  const loadPortfolioSummary = async (nftList?: NFTBalance[]) => {
    const currentNfts = nftList || nfts;
    if (currentNfts.length === 0 || !account) return;

    const startTime = Date.now();
    
    try {
      const tokenIdSet = new Set<string>();
      const nftKeyMap = new Map<string, { contractAddress: string; tokenId: string }>();
      
      for (let i = 0; i < currentNfts.length; i++) {
        const nft = currentNfts[i];
        if (nft.tokenId) {
          tokenIdSet.add(nft.tokenId);
          nftKeyMap.set(nft.tokenId, { contractAddress: nft.contractAddress, tokenId: nft.tokenId });
        }
      }
      
      const allTokenIds = Array.from(tokenIdSet);
      if (allTokenIds.length === 0) return;
      
      const [claimDataMap, graphQLDataMap] = await Promise.all([
        getClaimDataBatchFromDB(allTokenIds),
        fetchNodeNFTInfoBatch(allTokenIds)
      ]);
      
      const allNodeInfoMap = new Map<string, NodeNFTInfo>();
      let totalAllocated = 0;
      let totalClaimed = 0;
      let totalRemaining = 0;
      let totalEarned = 0;
      
      for (const [tokenId, nftInfo] of nftKeyMap) {
        const key = `${nftInfo.contractAddress}-${tokenId}`;
        const claimData = claimDataMap.get(tokenId);
        const graphQLData = graphQLDataMap.get(tokenId);
        const nodeInfo = createNodeNFTInfoFromBatchData(tokenId, claimData, graphQLData);
        
        if (nodeInfo) {
          allNodeInfoMap.set(key, nodeInfo);
          
          const allocated = parseFloat(nodeInfo.totalAllocated || '0');
          const remaining = parseFloat(nodeInfo.totalRemaining || '0');
          const claimed = parseFloat(nodeInfo.totalClaimed || '0');
          const earned = parseFloat(nodeInfo.part2Earned || '0');
          
          if (!isNaN(allocated)) totalAllocated += allocated;
          if (!isNaN(remaining)) totalRemaining += remaining;
          if (!isNaN(claimed) && claimed > 0) {
            totalClaimed += claimed;
          } else if (!isNaN(allocated) && !isNaN(remaining)) {
            totalClaimed += allocated - remaining;
          }
          if (!isNaN(earned)) totalEarned += earned;
        }
      }
      
      if (allNodeInfoMap.size > 0) {
        setNodeInfoMap(allNodeInfoMap);
        setPortfolioSummary({
          totalAllocated,
          totalClaimed,
          totalRemaining,
          totalEarned
        });
      }
      
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`[Portfolio Summary] ${allNodeInfoMap.size}개 로드 및 계산 완료 (${elapsed}초)`);
      
    } catch (err: any) {
      console.error(`[Portfolio Summary] 오류:`, err);
    }
  };

  const formatPrice = (valueInUSD: number): string => {
    if (currency === 'USD') {
      return `$${valueInUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    } else {
      const valueInKRW = zeroGPriceKRW && zeroGPrice ? (valueInUSD * (zeroGPriceKRW / zeroGPrice)) : null;
      if (valueInKRW) {
        return `₩${valueInKRW.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
      }
      return `$${valueInUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  };

  const handleSearch = () => {
    const trimmedAddress = searchAddress.trim();
    if (!trimmedAddress) {
      setError('Please enter a wallet address');
      return;
    }
    
    // Validate address format (0x prefix, 42 chars)
    if (!trimmedAddress.startsWith('0x') || trimmedAddress.length !== 42) {
      setError('Invalid wallet address format. Please enter a valid address (0x...)');
      return;
    }
    
    setError(null);
    const normalizedAddress = trimmedAddress.toLowerCase();
    // Update URL
    navigate(`/${normalizedAddress}`, { replace: true });
    setAccount(normalizedAddress);
    setSearchAddress(''); // Clear search field
  };

  const loadTokenBalance = async () => {
    if (!account) return;
    
    setLoadingBalance(true);
    try {
      // Use RPC Provider (no MetaMask)
      const balance = await getTokenBalance(account, true);
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
      const priceData = await get0GPriceFromDB();
      if (priceData) {
        setZeroGPrice(priceData.usd);
        setZeroGPriceKRW(priceData.krw);
        setPriceChange24h(priceData.change24h);
        setMarketCapUsd(priceData.marketCapUsd);
        setMarketCapKrw(priceData.marketCapKrw);
        return;
      }
      
      console.log('DB price API failed, using CoinGecko API');
      const fallbackPriceData = await get0GPriceWithKRW();
      if (fallbackPriceData) {
        setZeroGPrice(fallbackPriceData.usd);
        setZeroGPriceKRW(fallbackPriceData.krw);
        setPriceChange24h(fallbackPriceData.change24h);
        setMarketCapUsd(null);
        setMarketCapKrw(null);
      } else {
        const price = await get0GPrice();
        setZeroGPrice(price);
        setZeroGPriceKRW(null);
        setPriceChange24h(null);
        setMarketCapUsd(null);
        setMarketCapKrw(null);
      }
    } catch (error) {
      console.error('Failed to load 0G price:', error);
      try {
        const price = await get0GPrice();
        setZeroGPrice(price);
        setZeroGPriceKRW(null);
        setPriceChange24h(null);
        setMarketCapUsd(null);
        setMarketCapKrw(null);
      } catch (e) {
        console.error('Failed to load fallback 0G price:', e);
      }
    }
  };

  const loadChartData = async () => {
    try {
      const data = await get0GMarketChart(chartPeriod);
      setChartData(data);
    } catch (error) {
      console.error('Failed to load chart data:', error);
    }
  };


  /*
  const loadCurrentPageNFTs = async () => {
    if (!account || nfts.length === 0) return;

    const startTime = Date.now();
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentPageNFTs = nfts.slice(startIndex, endIndex);

    const keysToLoad = currentPageNFTs.map(nft => `${nft.contractAddress}-${nft.tokenId}`);
    setLoadingNodeInfoMap(new Set(keysToLoad));

    try {
      // 이미 로드된 NFT는 제외
      const nftsToLoad = currentPageNFTs.filter(nft => {
        const key = `${nft.contractAddress}-${nft.tokenId}`;
        return !nodeInfoMap.has(key);
      });

      if (nftsToLoad.length === 0) {
        setLoadingNodeInfoMap(new Set());
        return;
      }

      console.log(`현재 페이지: ${nftsToLoad.length}개의 NFT 정보를 DB 배치 조회로 로드합니다.`);
      
      // 1단계: 모든 토큰 ID의 클레임 데이터를 배치로 한 번에 조회
      const tokenIds = nftsToLoad.map(nft => nft.tokenId);
      const { getClaimDataBatchFromDB } = await import('./utils/nodeCheckerApi');
      const claimDataMap = await getClaimDataBatchFromDB(tokenIds);
      
      // 2단계: GraphQL API로 totalReward 정보를 배치로 조회
      const SUBGRAPH_URL = 'https://api.studio.thegraph.com/query/89220/0g-arbitrum/version/latest';
      const graphqlQuery = `
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
      
      let nftDataMap = new Map<string, any>();
      try {
        const response = await fetch(SUBGRAPH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: graphqlQuery,
            variables: { ids: tokenIds },
          }),
        });
        
        if (response.ok) {
          const data = await response.json();
          const nfts = data.data?.nfts || [];
          nfts.forEach((nft: any) => {
            if (nft?.id) {
              nftDataMap.set(nft.id, nft);
            }
          });
        }
      } catch (error) {
        console.warn('GraphQL 배치 조회 실패:', error);
      }
      
      // 3단계: 클레임 데이터와 GraphQL 데이터를 결합하여 NodeNFTInfo 생성
      const newPageNodeInfoMap = new Map<string, NodeNFTInfo>();
      
      nftsToLoad.forEach((nft) => {
        const key = `${nft.contractAddress}-${nft.tokenId}`;
        const claimData = claimDataMap.get(nft.tokenId);
        const nftData = nftDataMap.get(nft.tokenId);
        
        // totalReward 계산
        const totalRewardWei = nftData?.totalReward || '0';
        const totalReward = parseFloat((BigInt(totalRewardWei) / BigInt(10 ** 18)).toString()) / (10 ** 18);
        const totalRewardFormatted = totalReward.toFixed(2);
        
        // 할당량 및 클레임 데이터
        const totalAllocated = claimData?.allocationPerToken || '854.70';
        const part1Claimed = claimData?.claimed || '0';
        const consumed = claimData?.consumed || '0';
        const partPercentage = claimData?.partPercentage ? parseFloat(claimData.partPercentage) : 0.33;
        
        // 계산
        const part1Total = parseFloat(totalAllocated) * partPercentage;
        const part1RemainingShare = Math.max(0, part1Total - parseFloat(consumed));
        const part2Total = parseFloat(totalAllocated) * (1 - partPercentage);
        const part2Remaining = Math.max(0, part2Total - totalReward);
        const totalRemaining = (part1RemainingShare + part2Remaining).toFixed(2);
        const totalClaimed = (parseFloat(totalAllocated) - parseFloat(totalRemaining)).toFixed(2);
        
        const nodeInfo: NodeNFTInfo = {
          tokenId: nft.tokenId,
          name: `AI Alignment Node #${nft.tokenId}`,
          totalAllocated,
          totalRemaining,
          totalClaimed,
          milestones: getMilestones(totalRemaining),
          part1Claimed,
          part1Remaining: part1RemainingShare.toFixed(2),
          part1Total: part1Total.toFixed(2),
          part2Earned: totalRewardFormatted,
          part2Remaining: part2Remaining.toFixed(2),
          part2Total: part2Total.toFixed(2),
        };
        
        newPageNodeInfoMap.set(key, nodeInfo);
      });
      
      // 상태 업데이트 (한 번에)
      if (newPageNodeInfoMap.size > 0) {
        setNodeInfoMap(prevMap => {
          const merged = new Map(prevMap);
          newPageNodeInfoMap.forEach((value, key) => {
            merged.set(key, value);
          });
          return merged;
        });
      }
      
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`현재 페이지: ${newPageNodeInfoMap.size}개 NFT 정보 로드 완료 (소요 시간: ${elapsed}초)`);
      
    } catch (err) {
      console.error(`Failed to load current page NFTs:`, err);
    } finally {
      setLoadingNodeInfoMap(new Set());
    }
  };
  */

  const loadNFTs = async (retryCount = 0): Promise<NFTBalance[]> => {
    const maxRetries = 3;
    const retryDelay = 1000;

    try {
      setError(null);
      setLoading(true);
      
      const [nftList, delegatedNFTs] = await Promise.all([
        fetchNFTBalances(account),
        fetchDelegatedNFTsFromChainscan(account).catch(() => [])
      ]);
      
      const delegatedKeys = new Set<string>();
      delegatedNFTs.forEach((nft: NFTBalance) => {
        const key = `${nft.contractAddress.toLowerCase()}-${nft.tokenId}`;
        delegatedKeys.add(key);
      });
      
      setDelegatedNFTKeys(delegatedKeys);
      setNfts(nftList);
      
      if (nftList.length > 0 && account) {
        loadPortfolioSummary(nftList).catch(err => {
          console.error('[Portfolio Summary] 백그라운드 로드 실패:', err);
        });
      }
      
      return nftList;
    } catch (err: any) {
      console.error(`NFT 목록 조회 실패 (재시도: ${retryCount}/${maxRetries}):`, err);
      
      if (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * (retryCount + 1)));
        return loadNFTs(retryCount + 1);
      } else {
        setError(err.message || 'Failed to load NFT list. Please refresh the page.');
        return [];
      }
    } finally {
      setLoading(false);
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const handleOpenDetail = async (nft: NFTBalance) => {
    setSelectedNFTDetail(nft);
    setTransfers([]);
    setLoadingTransfers(true);
    setDetailDialogOpen(true);
    
    try {
      const apiUrl = `/api/nft/transfers?contract=${nft.contractAddress}&tokenId=${nft.tokenId}&cursor=0&limit=50&sort=DESC`;
      
      try {
        const response = await fetch(apiUrl);
        if (response.ok) {
          const data = await response.json();
          if (data.status === '1' && data.result && data.result.list) {
            setTransfers(data.result.list);
          }
        }
      } catch (error) {
      }
    } catch (error) {
    } finally {
      setLoadingTransfers(false);
    }
  };

  const handleCloseDetail = () => {
    setDetailDialogOpen(false);
    setSelectedNFTDetail(null);
    setTransfers([]);
  };

  const LazyNFTImage = React.memo(({ src, alt, tokenId }: { src?: string; alt: string; tokenId: string }) => {
    const [isLoaded, setIsLoaded] = useState(false);
    const [hasError, setHasError] = useState(false);
    const [isInView, setIsInView] = useState(false);
    const imgRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!imgRef.current) return;

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setIsInView(true);
              observer.disconnect();
            }
          });
        },
        { rootMargin: '50px' }
      );

      observer.observe(imgRef.current);

      return () => {
        observer.disconnect();
      };
    }, []);

    const imageUrl = src || `https://node-sale-nft-images.0g.ai/${tokenId}.png`;

    return (
      <Box
        ref={imgRef}
        sx={{
          height: 180,
          position: 'relative',
          background: 'rgba(103, 80, 164, 0.1)',
          overflow: 'hidden',
        }}
      >
        {isInView && (
          <>
            {!hasError && (
              <CardMedia
                component="img"
                height="180"
                image={imageUrl}
                alt={alt}
                sx={{
                  objectFit: 'cover',
                  opacity: isLoaded ? 1 : 0,
                  transition: 'opacity 0.3s ease',
                }}
                onLoad={() => setIsLoaded(true)}
                onError={() => {
                  setHasError(true);
                  setIsLoaded(false);
                }}
                loading="lazy"
              />
            )}
            {hasError && (
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
            {!isLoaded && !hasError && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(103, 80, 164, 0.1)',
                }}
              >
                <CircularProgress size={24} sx={{ color: 'rgba(255, 255, 255, 0.3)' }} />
              </Box>
            )}
          </>
        )}
        {!isInView && (
          <Box
            sx={{
              height: 180,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(103, 80, 164, 0.1)',
            }}
          >
            <CircularProgress size={24} sx={{ color: 'rgba(255, 255, 255, 0.3)' }} />
          </Box>
        )}
      </Box>
    );
  });

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
          <Toolbar 
            sx={{ 
              minHeight: { xs: 'auto !important', sm: '64px !important', md: '72px !important' },
              px: { xs: 1.5, sm: 2, md: 3 }, 
              py: { xs: 1, sm: 1.5, md: 2 },
              flexDirection: { xs: 'column', sm: 'row' },
              alignItems: { xs: 'stretch', sm: 'center' },
              gap: { xs: 1, sm: 0 },
            }}
          >
            {/* First Row: Logo + Title + Toggle (모바일) / Logo + Title (데스크톱) */}
            <Box sx={{ display: 'flex', alignItems: 'center', width: { xs: '100%', sm: 'auto' }, flexGrow: { xs: 0, sm: 1 }, gap: { xs: 1, sm: 0 } }}>
              <Box
                component="img"
                src="https://docs.0g.ai/img/0G-Logo-Dark.svg"
                alt="0G Logo"
                sx={{
                  height: { xs: 28, sm: 36, md: 44 },
                  width: 'auto',
                  mr: { xs: 1, sm: 2, md: 2.5 },
                  flexShrink: 0,
                }}
              />
              <Typography 
                variant="h5" 
                component="div" 
                sx={{ 
                  flexGrow: { xs: 1, sm: 1 }, 
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
              {/* 모바일에서만 첫 번째 줄에 토글 표시 */}
              <Box sx={{ display: { xs: 'block', sm: 'none' }, flexShrink: 0 }}>
                <ToggleButtonGroup
                  value={currency}
                  exclusive
                  onChange={(_, newCurrency) => {
                    if (newCurrency !== null) {
                      setCurrency(newCurrency);
                      localStorage.setItem('0gnft_currency', newCurrency);
                    }
                  }}
                  size="small"
                  sx={{
                    '& .MuiToggleButton-root': {
                      color: 'rgba(255, 255, 255, 0.7)',
                      borderColor: 'rgba(255, 255, 255, 0.23)',
                      '&.Mui-selected': {
                        backgroundColor: 'rgba(103, 80, 164, 0.3)',
                        color: '#ffffff',
                        borderColor: 'rgba(103, 80, 164, 0.5)',
                        '&:hover': {
                          backgroundColor: 'rgba(103, 80, 164, 0.4)',
                        },
                      },
                      '&:hover': {
                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      },
                    },
                  }}
                >
                  <ToggleButton value="USD">USD</ToggleButton>
                  <ToggleButton value="KRW">KRW</ToggleButton>
                </ToggleButtonGroup>
              </Box>
            </Box>
            
            {/* Second Row: Search (모바일) / Toggle + Search (데스크톱) */}
            <Box 
              sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: { xs: 1, sm: 2 },
                width: { xs: '100%', sm: 'auto' },
                justifyContent: { xs: 'flex-start', sm: 'flex-end' },
              }}
            >
              {/* 데스크톱에서만 토글 표시 */}
              <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
                <ToggleButtonGroup
                  value={currency}
                  exclusive
                  onChange={(_, newCurrency) => {
                    if (newCurrency !== null) {
                      setCurrency(newCurrency);
                      localStorage.setItem('0gnft_currency', newCurrency);
                    }
                  }}
                  size="small"
                  sx={{
                    '& .MuiToggleButton-root': {
                      color: 'rgba(255, 255, 255, 0.7)',
                      borderColor: 'rgba(255, 255, 255, 0.23)',
                      '&.Mui-selected': {
                        backgroundColor: 'rgba(103, 80, 164, 0.3)',
                        color: '#ffffff',
                        borderColor: 'rgba(103, 80, 164, 0.5)',
                        '&:hover': {
                          backgroundColor: 'rgba(103, 80, 164, 0.4)',
                        },
                      },
                      '&:hover': {
                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      },
                    },
                  }}
                >
                  <ToggleButton value="USD">USD</ToggleButton>
                  <ToggleButton value="KRW">KRW</ToggleButton>
                </ToggleButtonGroup>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: { xs: 1, sm: '0 0 auto' }, width: { xs: '100%', sm: 'auto' } }}>
                <TextField
                  size="small"
                  placeholder="Wallet Address"
                  value={searchAddress}
                  onChange={(e) => setSearchAddress(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleSearch();
                    }
                  }}
                  sx={{
                    width: { xs: '100%', sm: '280px' },
                    flex: { xs: 1, sm: '0 0 auto' },
                    '& .MuiOutlinedInput-root': {
                      color: '#e6e0e9',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      '& fieldset': {
                        borderColor: 'rgba(255, 255, 255, 0.23)',
                      },
                      '&:hover fieldset': {
                        borderColor: 'rgba(255, 255, 255, 0.4)',
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: 'primary.main',
                      },
                    },
                    '& .MuiInputBase-input': {
                      fontSize: '0.8125rem',
                      fontFamily: 'monospace',
                    },
                  }}
                />
                <Button
                  variant="contained"
                  onClick={handleSearch}
                  startIcon={<SearchIcon sx={{ display: { xs: 'none', sm: 'block' } }} />}
                  size="small"
                  sx={{
                    minWidth: { xs: '48px', sm: '100px' },
                    height: '36px',
                    background: 'linear-gradient(135deg, rgba(103, 80, 164, 0.8) 0%, rgba(103, 80, 164, 0.6) 100%)',
                    color: '#ffffff',
                    fontWeight: 600,
                    textTransform: 'none',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: '0px 2px 8px rgba(103, 80, 164, 0.3)',
                    '&:hover': {
                      background: 'linear-gradient(135deg, rgba(103, 80, 164, 1) 0%, rgba(103, 80, 164, 0.8) 100%)',
                      boxShadow: '0px 4px 12px rgba(103, 80, 164, 0.4)',
                    },
                    flexShrink: 0,
                    '& .MuiButton-startIcon': {
                      margin: { xs: 0, sm: '0 8px 0 0' },
                    },
                  }}
                >
                  <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Search</Box>
                  <SearchIcon sx={{ display: { xs: 'block', sm: 'none' }, fontSize: '20px' }} />
                </Button>
                {connectedWallet ? (
                  <Chip
                    label={formatAddress(connectedWallet)}
                    onDelete={handleDisconnect}
                    deleteIcon={<CloseIcon />}
                    sx={{
                      fontFamily: 'monospace',
                      background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.08) 100%)',
                      color: '#e6e0e9',
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
                      },
                      '& .MuiChip-deleteIcon': {
                        color: 'rgba(255, 255, 255, 0.7)',
                        '&:hover': {
                          color: '#ffffff',
                        },
                      },
                    }}
                  />
                ) : (
                  <Button
                    variant="contained"
                    startIcon={<WalletIcon />}
                    onClick={handleConnect}
                    disabled={loading || !isMetaMaskInstalled()}
                    size="small"
                    sx={{
                      backgroundColor: '#2962ff',
                      color: '#ffffff',
                      fontWeight: 600,
                      borderRadius: '8px',
                      px: 2,
                      py: 0.75,
                      height: '36px',
                      boxShadow: '0px 2px 4px rgba(41, 98, 255, 0.3), 0px 4px 8px rgba(0, 0, 0, 0.15)',
                      '&:hover': {
                        backgroundColor: '#3d72ff',
                        boxShadow: '0px 4px 8px rgba(41, 98, 255, 0.4), 0px 8px 16px rgba(0, 0, 0, 0.2)',
                      },
                      '&.Mui-disabled': {
                        backgroundColor: 'rgba(41, 98, 255, 0.3)',
                        color: 'rgba(255, 255, 255, 0.5)',
                      },
                      display: { xs: 'none', sm: 'flex' },
                    }}
                  >
                    {loading ? 'Connecting...' : 'Connect'}
                  </Button>
                )}
              </Box>
            </Box>
          </Toolbar>
        </AppBar>

        <Container maxWidth="lg" sx={{ mt: { xs: 14, sm: 11 }, mb: 12, pt: 3, px: { xs: 2, sm: 3, md: 4 } }}>
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

          {/* Price Information Section */}
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
                  Price Information
                </Typography>
                <Grid container spacing={3} sx={{ display: 'flex', alignItems: 'stretch' }}>
                  {/* Left: Price Card (USD + KRW) */}
                  <Grid item xs={12} md={4} sx={{ display: 'flex' }}>
                    <Box
                      sx={{
                        p: 3,
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
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
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
                        Current Price
                      </Typography>
                      {(() => {
                        const displayPrice = currency === 'USD' ? zeroGPrice : zeroGPriceKRW;
                        const displayMarketCap = currency === 'USD' ? marketCapUsd : marketCapKrw;
                        
                        if (displayPrice) {
                          return (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                              <Typography 
                                variant="h4" 
                                sx={{ 
                                  fontWeight: 700,
                                  color: '#ffffff',
                                  lineHeight: 1.2,
                                  fontSize: { xs: '1.5rem', sm: '1.75rem', md: '2rem' },
                                  letterSpacing: '-0.02em',
                                }}
                              >
                                {currency === 'USD' 
                                  ? `$${displayPrice.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`
                                  : `₩${displayPrice.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                                }
                              </Typography>
                              {priceChange24h !== null && (
                                <Typography 
                                  variant="body2" 
                                  sx={{ 
                                    color: priceChange24h >= 0 ? '#4caf50' : '#f44336',
                                    fontWeight: 600,
                                    fontSize: '0.875rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 0.5,
                                  }}
                                >
                                  {priceChange24h >= 0 ? '↑' : '↓'} {Math.abs(priceChange24h).toFixed(2)}% (24h)
                                </Typography>
                              )}
                              {displayMarketCap && (
                                <Typography 
                                  variant="body2" 
                                  sx={{ 
                                    color: '#a8c5ff',
                                    fontWeight: 500,
                                    fontSize: '0.875rem',
                                  }}
                                >
                                  Market Cap: {currency === 'USD'
                                    ? `$${displayMarketCap.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                                    : `₩${displayMarketCap.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                                  }
                                </Typography>
                              )}
                            </Box>
                          );
                        } else {
                          return (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                              <CircularProgress size={20} />
                              <Typography variant="body2" color="text.secondary">Loading...</Typography>
                            </Box>
                          );
                        }
                      })()}
                      {/* External Links */}
                      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 3, pt: 3, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                        <IconButton
                          onClick={() => window.open('https://coinmarketcap.com/currencies/zero-gravity/', '_blank')}
                          sx={{
                            width: 48,
                            height: 48,
                            borderRadius: '50%',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            padding: 0,
                            overflow: 'hidden',
                            '&:hover': {
                              background: 'rgba(255, 255, 255, 0.1)',
                              borderColor: 'rgba(255, 255, 255, 0.2)',
                              transform: 'scale(1.1)',
                            },
                            transition: 'all 0.2s',
                          }}
                          title="CoinMarketCap"
                        >
                          <Box
                            component="img"
                            src="https://coinmarketcap.com/favicon.ico"
                            alt="CoinMarketCap"
                            sx={{ 
                              width: '100%', 
                              height: '100%', 
                              objectFit: 'cover',
                            }}
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              const parent = target.parentElement;
                              if (parent) {
                                parent.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="white"><path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/></svg>';
                              }
                            }}
                          />
                        </IconButton>
                        <IconButton
                          onClick={() => window.open('https://www.coingecko.com/en/coins/0g', '_blank')}
                          sx={{
                            width: 48,
                            height: 48,
                            borderRadius: '50%',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            padding: 0,
                            overflow: 'hidden',
                            '&:hover': {
                              background: 'rgba(255, 255, 255, 0.1)',
                              borderColor: 'rgba(255, 255, 255, 0.2)',
                              transform: 'scale(1.1)',
                            },
                            transition: 'all 0.2s',
                          }}
                          title="CoinGecko"
                        >
                          <Box
                            component="img"
                            src="https://www.coingecko.com/favicon.ico"
                            alt="CoinGecko"
                            sx={{ 
                              width: '100%', 
                              height: '100%', 
                              objectFit: 'cover',
                            }}
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              const parent = target.parentElement;
                              if (parent) {
                                parent.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="white"><path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/></svg>';
                              }
                            }}
                          />
                        </IconButton>
                        <IconButton
                          onClick={() => window.open('https://www.tradingview.com/symbols/0G/', '_blank')}
                          sx={{
                            width: 48,
                            height: 48,
                            borderRadius: '50%',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            padding: 0,
                            overflow: 'hidden',
                            '&:hover': {
                              background: 'rgba(255, 255, 255, 0.1)',
                              borderColor: 'rgba(255, 255, 255, 0.2)',
                              transform: 'scale(1.1)',
                            },
                            transition: 'all 0.2s',
                          }}
                          title="TradingView"
                        >
                          <Box
                            component="img"
                            src="https://www.tradingview.com/favicon.ico"
                            alt="TradingView"
                            sx={{ 
                              width: '100%', 
                              height: '100%', 
                              objectFit: 'cover',
                            }}
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              const parent = target.parentElement;
                              if (parent) {
                                parent.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="white"><path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/></svg>';
                              }
                            }}
                          />
                        </IconButton>
                      </Box>
                    </Box>
                  </Grid>

                  {/* Right: Chart */}
                  <Grid item xs={12} md={8} sx={{ display: 'flex' }}>
                    <Box
                      sx={{
                        p: 3,
                        background: 'rgba(255, 255, 255, 0.05)',
                        borderRadius: '16px',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        '&:hover': {
                          borderColor: 'rgba(255, 255, 255, 0.16)',
                          background: 'rgba(255, 255, 255, 0.08)',
                        },
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: '100%',
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography 
                          variant="caption" 
                          color="text.secondary" 
                          sx={{ 
                            fontSize: '0.6875rem',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: '1px',
                            opacity: 0.7,
                          }}
                        >
                          {chartPeriod === '1D' ? '1-Day' : chartPeriod === '7D' ? '7-Day' : chartPeriod === '1M' ? '1-Month' : chartPeriod === '1Y' ? '1-Year' : 'Price'} Price Chart
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          {(['1D', '7D', '1M', '1Y'] as const).map((period) => (
                            <Button
                              key={period}
                              variant={chartPeriod === period ? 'contained' : 'outlined'}
                              size="small"
                              onClick={() => setChartPeriod(period)}
                              sx={{
                                minWidth: 'auto',
                                px: 1.5,
                                py: 0.5,
                                fontSize: '0.6875rem',
                                fontWeight: chartPeriod === period ? 600 : 400,
                                textTransform: 'none',
                                borderRadius: 1,
                              }}
                            >
                              {period}
                            </Button>
                          ))}
                        </Box>
                      </Box>
                      {chartData && chartData.length > 0 ? (
                        <Box 
                          sx={{ 
                            width: '100%', 
                            height: '240px', 
                            position: 'relative',
                            pt: 2,
                            pb: 3,
                            pl: 3,
                            pr: 2,
                          }}
                          onMouseMove={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const svg = e.currentTarget.querySelector('svg');
                            if (!svg) return;
                            
                            const svgRect = svg.getBoundingClientRect();
                            // SVG viewBox: 0 0 400 200
                            // Chart area: chartX=20, chartWidth=380
                            const chartX = 20;
                            const chartWidth = 380;
                            
                            // 마우스 위치를 SVG 좌표계로 변환
                            const mouseX = ((e.clientX - svgRect.left) / svgRect.width) * 400;
                            
                            // 차트 영역 내부인지 확인
                            if (mouseX >= chartX && mouseX <= chartX + chartWidth) {
                              // 차트 영역 내의 상대 위치 (0 ~ 1)
                              const relativeX = (mouseX - chartX) / chartWidth;
                              const index = Math.round(relativeX * (chartData.length - 1));
                              
                              if (index >= 0 && index < chartData.length) {
                                const dataPoint = chartData[index];
                                setHoveredPrice({
                                  price: dataPoint.price,
                                  x: e.clientX - rect.left,
                                  y: e.clientY - rect.top,
                                  index,
                                });
                              }
                            } else {
                              setHoveredPrice(null);
                            }
                          }}
                          onMouseLeave={() => setHoveredPrice(null)}
                        >
                          <svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                            <defs>
                              <linearGradient id="priceGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="#2962ff" stopOpacity="0.3" />
                                <stop offset="100%" stopColor="#2962ff" stopOpacity="0" />
                              </linearGradient>
                            </defs>
                            {(() => {
                              const prices = chartData.map(d => d.price);
                              const minPrice = Math.min(...prices);
                              const maxPrice = Math.max(...prices);
                              const priceRange = maxPrice - minPrice || 1;
                              const padding = priceRange * 0.1;
                              const adjustedMin = minPrice - padding;
                              const adjustedMax = maxPrice + padding;
                              const adjustedRange = adjustedMax - adjustedMin || 1;

                              const chartHeight = 160;
                              const chartY = 20;
                              const chartWidth = 380;
                              const chartX = 20;

                              // Y-axis labels
                              const yAxisSteps = 5;
                              const yLabels = [];
                              for (let i = 0; i <= yAxisSteps; i++) {
                                const price = adjustedMax - (adjustedRange * i / yAxisSteps);
                                const y = chartY + (i * chartHeight / yAxisSteps);
                                yLabels.push({ price, y });
                              }

                              // X-axis labels (dates)
                              const xAxisSteps = 6;
                              const xLabels = [];
                              for (let i = 0; i <= xAxisSteps; i++) {
                                const index = Math.round((i / xAxisSteps) * (chartData.length - 1));
                                if (index < chartData.length) {
                                  const date = new Date(chartData[index].timestamp);
                                  const x = chartX + (i * chartWidth / xAxisSteps);
                                  xLabels.push({ date, x, index });
                                }
                              }

                              const points = chartData.map((d, i) => {
                                const x = chartX + (i / (chartData.length - 1)) * chartWidth;
                                const y = chartY + chartHeight - ((d.price - adjustedMin) / adjustedRange) * chartHeight;
                                return `${x},${y}`;
                              }).join(' ');

                              const areaPoints = `${points} L ${chartX + chartWidth},${chartY + chartHeight} L ${chartX},${chartY + chartHeight} Z`;

                              return (
                                <>
                                  {/* Y-axis */}
                                  <line
                                    x1={chartX}
                                    y1={chartY}
                                    x2={chartX}
                                    y2={chartY + chartHeight}
                                    stroke="rgba(255, 255, 255, 0.3)"
                                    strokeWidth="1.5"
                                  />
                                  {/* X-axis */}
                                  <line
                                    x1={chartX}
                                    y1={chartY + chartHeight}
                                    x2={chartX + chartWidth}
                                    y2={chartY + chartHeight}
                                    stroke="rgba(255, 255, 255, 0.3)"
                                    strokeWidth="1.5"
                                  />
                                  {/* Grid lines */}
                                  {yLabels.map((label, i) => (
                                    <line
                                      key={`grid-y-${i}`}
                                      x1={chartX}
                                      y1={label.y}
                                      x2={chartX + chartWidth}
                                      y2={label.y}
                                      stroke="rgba(255, 255, 255, 0.05)"
                                      strokeWidth="1"
                                    />
                                  ))}
                                  {/* Y-axis labels */}
                                  {yLabels.map((label, i) => {
                                    const displayPrice = currency === 'USD' 
                                      ? label.price 
                                      : (zeroGPriceKRW && zeroGPrice ? (label.price * (zeroGPriceKRW / zeroGPrice)) : label.price);
                                    const priceText = currency === 'USD'
                                      ? `$${displayPrice.toFixed(4)}`
                                      : `₩${displayPrice.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
                                    return (
                                      <text
                                        key={`y-label-${i}`}
                                        x={chartX - 8}
                                        y={label.y + 4}
                                        fill="rgba(255, 255, 255, 0.6)"
                                        fontSize="10"
                                        textAnchor="end"
                                        fontFamily="monospace"
                                      >
                                        {priceText}
                                      </text>
                                    );
                                  })}
                                  {/* X-axis labels */}
                                  {xLabels.map((label, i) => (
                                    <text
                                      key={`x-label-${i}`}
                                      x={label.x}
                                      y={chartY + chartHeight + 16}
                                      fill="rgba(255, 255, 255, 0.6)"
                                      fontSize="10"
                                      textAnchor="middle"
                                      fontFamily="monospace"
                                    >
                                      {label.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </text>
                                  ))}
                                  {/* Area fill */}
                                  <path
                                    d={`M ${areaPoints}`}
                                    fill="url(#priceGradient)"
                                  />
                                  {/* Price line */}
                                  <polyline
                                    points={points}
                                    fill="none"
                                    stroke="#2962ff"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                  {/* Hover indicator line */}
                                  {hoveredPrice && (() => {
                                    const index = hoveredPrice.index;
                                    if (index >= 0 && index < chartData.length) {
                                      const dataPoint = chartData[index];
                                      const x = chartX + (index / (chartData.length - 1)) * chartWidth;
                                      const y = chartY + chartHeight - ((dataPoint.price - adjustedMin) / adjustedRange) * chartHeight;
                                      return (
                                        <>
                                          <line
                                            x1={x}
                                            y1={chartY}
                                            x2={x}
                                            y2={chartY + chartHeight}
                                            stroke="rgba(255, 255, 255, 0.5)"
                                            strokeWidth="1"
                                            strokeDasharray="4,4"
                                          />
                                          <circle
                                            cx={x}
                                            cy={y}
                                            r="5"
                                            fill="#2962ff"
                                            stroke="#ffffff"
                                            strokeWidth="2"
                                          />
                                        </>
                                      );
                                    }
                                    return null;
                                  })()}
                                </>
                              );
                            })()}
                          </svg>
                          {/* Tooltip */}
                          {hoveredPrice && (() => {
                            const index = hoveredPrice.index;
                            if (index >= 0 && index < chartData.length) {
                              const dataPoint = chartData[index];
                              return (
                                <Box
                                  sx={{
                                    position: 'absolute',
                                    left: `${hoveredPrice.x}px`,
                                    top: `${hoveredPrice.y - 60}px`,
                                    transform: 'translateX(-50%)',
                                    background: 'rgba(20, 18, 24, 0.95)',
                                    border: '1px solid rgba(255, 255, 255, 0.2)',
                                    borderRadius: '8px',
                                    p: 1.5,
                                    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.3)',
                                    pointerEvents: 'none',
                                    zIndex: 1000,
                                    minWidth: '120px',
                                  }}
                                >
                                  <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.7rem', display: 'block', mb: 0.5 }}>
                                    {new Date(dataPoint.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                  </Typography>
                                  {(() => {
                                    const tooltipPriceUSD = dataPoint.price;
                                    const tooltipPriceKRW = zeroGPriceKRW && zeroGPrice ? (dataPoint.price * (zeroGPriceKRW / zeroGPrice)) : null;
                                    
                                    return (
                                      <>
                                        <Typography variant="body2" sx={{ color: '#ffffff', fontWeight: 600, fontSize: '0.875rem' }}>
                                          USD ${tooltipPriceUSD.toFixed(4)}
                                        </Typography>
                                        {tooltipPriceKRW && (
                                          <Typography variant="body2" sx={{ color: '#a8c5ff', fontWeight: 600, fontSize: '0.875rem' }}>
                                            KRW ₩{tooltipPriceKRW.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                          </Typography>
                                        )}
                                      </>
                                    );
                                  })()}
                                </Box>
                              );
                            }
                            return null;
                          })()}
                        </Box>
                      ) : (
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '180px' }}>
                          <CircularProgress size={24} />
                        </Box>
                      )}
                    </Box>
                  </Grid>
                </Grid>
              </Paper>

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
                <Grid container spacing={3} sx={{ display: 'flex', alignItems: 'stretch' }}>
                  {/* Left side - Tiles */}
                  <Grid item xs={12} md={6} sx={{ display: 'flex' }}>
                    <Grid container spacing={2} sx={{ width: '100%' }}>
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
                              mb: 1.5,
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
                                  mb: 1,
                                  color: '#ffffff',
                                  lineHeight: 1.2,
                                  fontSize: { xs: '1.25rem', sm: '1.5rem', md: '1.75rem' },
                                  letterSpacing: '-0.02em',
                                  wordBreak: 'break-word',
                                }}
                              >
                                {parseFloat(tokenBalance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 0G
                              </Typography>
                              {(() => {
                                const balanceValue = parseFloat(tokenBalance) * (zeroGPrice || 0);
                                return balanceValue > 0 ? (
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
                                    ≈ {formatPrice(balanceValue)}
                                  </Typography>
                                ) : null;
                              })()}
                            </>
                          )}
                        </Box>
                      </Grid>

                      {/* NFT Count */}
                      <Grid item xs={12} sm={6}>
                        <Box
                          sx={{
                            p: 2.5,
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
                              mb: 1.5,
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
                              mb: 0.75,
                            }}
                          >
                            {nfts.length}
                          </Typography>
                          {(() => {
                            const delegatedCount = Array.from(delegatedNFTKeys).filter(key => {
                              return nfts.some(nft => `${nft.contractAddress.toLowerCase()}-${nft.tokenId}` === key);
                            }).length;
                            const ownedCount = nfts.length - delegatedCount;
                            
                            return (
                              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                <Typography 
                                  variant="body2" 
                                  sx={{ 
                                    color: '#4caf50',
                                    fontWeight: 500,
                                    fontSize: { xs: '0.75rem', sm: '0.8125rem', md: '0.875rem' },
                                  }}
                                >
                                  Owned: {ownedCount}
                                </Typography>
                                <Typography 
                                  variant="body2" 
                                  sx={{ 
                                    color: '#2962ff',
                                    fontWeight: 500,
                                    fontSize: { xs: '0.75rem', sm: '0.8125rem', md: '0.875rem' },
                                  }}
                                >
                                  Delegated: {delegatedCount}
                                </Typography>
                              </Box>
                            );
                          })()}
                          {(() => {
                            // Portfolio Summary state에서 가져옴 (중복 계산 방지)
                            const totalRemaining = portfolioSummary?.totalRemaining || 0;
                            
                            const remainingValue = totalRemaining * (zeroGPrice || 0);
                            return remainingValue > 0 ? (
                              <Typography 
                                variant="body2" 
                                sx={{ 
                                  color: '#a8c5ff',
                                  fontWeight: 500,
                                  fontSize: { xs: '0.75rem', sm: '0.8125rem', md: '0.875rem' },
                                  opacity: 0.9,
                                  wordBreak: 'break-word',
                                  mt: 1.5,
                                }}
                              >
                                ≈ {formatPrice(remainingValue)}
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
                                          {(() => {
                                            const earnValue = item.value * (zeroGPrice || 0);
                                            return earnValue > 0 ? (
                                              <Typography component="span" sx={{ color: 'primary.light', ml: { xs: 0.5, sm: 1 }, fontSize: { xs: '0.75rem', sm: '0.8125rem', md: '0.875rem' }, display: { xs: 'block', sm: 'inline' } }}>
                                                (≈ {formatPrice(earnValue)})
                                              </Typography>
                                            ) : null;
                                          })()}
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
                  <Grid item xs={12} md={6} sx={{ display: 'flex' }}>
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
                        flex: 1,
                        minHeight: '100%',
                      }}
                    >
                      {(() => {
                        // Portfolio Summary 계산 결과를 state에서 가져옴 (중복 계산 방지)
                        const totalAllocated = portfolioSummary?.totalAllocated || 0;
                        const totalClaimed = portfolioSummary?.totalClaimed || 0;
                        const totalRemaining = portfolioSummary?.totalRemaining || 0;

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

          {/* Latest Operations Dashboard */}
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
                  Latest Operations
                </Typography>
                <Grid container spacing={3} sx={{ display: 'flex', alignItems: 'stretch' }}>
                  {/* Total Claimable Today */}
                  <Grid item xs={12} md={6} sx={{ display: 'flex' }}>
                    <Box
                      sx={{
                        p: 3,
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.03) 100%)',
                        borderRadius: '16px',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        backdropFilter: 'blur(10px)',
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
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
                          mb: 2,
                          fontSize: '0.6875rem',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '1px',
                          opacity: 0.7,
                        }}
                      >
                        Total Claimable Today
                      </Typography>
                      <Box
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flex: 1,
                          textAlign: 'center',
                        }}
                      >
                        <Typography
                          variant="h4"
                          sx={{
                            color: 'rgba(255, 255, 255, 0.5)',
                            fontWeight: 600,
                            mb: 2,
                            fontSize: '1.5rem',
                          }}
                        >
                          Coming Soon
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            color: 'rgba(255, 255, 255, 0.4)',
                            fontSize: '0.875rem',
                          }}
                        >
                          Contract connection in progress
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>

                  {/* Claim Transactions */}
                  <Grid item xs={12} md={6} sx={{ display: 'flex' }}>
                    <Box
                      sx={{
                        p: 3,
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.03) 100%)',
                        borderRadius: '16px',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        backdropFilter: 'blur(10px)',
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
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
                          mb: 2,
                          fontSize: '0.6875rem',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '1px',
                          opacity: 0.7,
                        }}
                      >
                        Claim Transactions
                      </Typography>
                      <Box
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flex: 1,
                          textAlign: 'center',
                        }}
                      >
                        <Typography
                          variant="h4"
                          sx={{
                            color: 'rgba(255, 255, 255, 0.5)',
                            fontWeight: 600,
                            mb: 2,
                            fontSize: '1.5rem',
                          }}
                        >
                          Coming Soon
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            color: 'rgba(255, 255, 255, 0.4)',
                            fontSize: '0.875rem',
                          }}
                        >
                          Chain API integration in progress
                        </Typography>
                      </Box>
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
                  {connectedWallet && connectedWallet.toLowerCase() === account.toLowerCase() && (
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
                        size="small"
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
                  )}
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
                      const canTransfer = connectedWallet && connectedWallet.toLowerCase() === account.toLowerCase();
                      
                      return (
                        <Grid item key={key}>
                          <Card
                            sx={{
                              cursor: 'pointer',
                              position: 'relative',
                              border: isSelected && canTransfer ? '2px solid' : '1.5px solid',
                              borderColor: isSelected && canTransfer ? '#2962ff' : 'rgba(255, 255, 255, 0.1)',
                              background: isSelected && canTransfer
                                ? 'linear-gradient(135deg, rgba(41, 98, 255, 0.15) 0%, rgba(41, 98, 255, 0.08) 100%)'
                                : 'linear-gradient(135deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.02) 100%)',
                              borderRadius: '16px',
                              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                              backdropFilter: 'blur(10px)',
                              height: '100%',
                              display: 'flex',
                              flexDirection: 'column',
                              overflow: 'hidden',
                              boxShadow: isSelected && canTransfer
                                ? '0px 4px 16px rgba(41, 98, 255, 0.3), 0px 2px 8px rgba(0, 0, 0, 0.2)'
                                : '0px 2px 8px rgba(0, 0, 0, 0.1), 0px 1px 3px rgba(0, 0, 0, 0.05)',
                              '&:hover': {
                                borderColor: isSelected && canTransfer ? '#2962ff' : 'rgba(255, 255, 255, 0.2)',
                                background: isSelected && canTransfer
                                  ? 'linear-gradient(135deg, rgba(41, 98, 255, 0.2) 0%, rgba(41, 98, 255, 0.12) 100%)'
                                  : 'linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.04) 100%)',
                                transform: 'translateY(-4px)',
                                boxShadow: isSelected && canTransfer
                                  ? '0px 8px 24px rgba(41, 98, 255, 0.4), 0px 4px 12px rgba(0, 0, 0, 0.25)'
                                  : '0px 4px 16px rgba(0, 0, 0, 0.2), 0px 2px 8px rgba(0, 0, 0, 0.15)',
                              },
                            }}
                            onClick={() => canTransfer ? toggleNFTSelection(nft) : handleOpenDetail(nft)}
                          >
                            {canTransfer && (
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
                            )}
                            <LazyNFTImage
                              src={nft.image}
                              alt={nft.name || `NFT #${nft.tokenId}`}
                              tokenId={nft.tokenId}
                            />
                            <CardContent sx={{ flex: 1, p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                              <Box>
                                {/* 제목과 Detail 버튼을 같은 줄에 배치 */}
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                                  <Typography
                                    variant="body2"
                                    component="div"
                                    sx={{
                                      fontWeight: 500,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      fontSize: '0.875rem',
                                      flex: 1,
                                    }}
                                  >
                                    {nft.name && nft.name !== 'Unnamed' ? nft.name : `#${nft.tokenId}`}
                                  </Typography>
                                  <Button
                                    size="small"
                                    variant="contained"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenDetail(nft);
                                    }}
                                    sx={{
                                      fontSize: '0.65rem',
                                      py: 0.25,
                                      px: 1,
                                      minWidth: 'auto',
                                      backgroundColor: 'rgba(255, 255, 255, 0.15)',
                                      color: '#e6e0e9',
                                      fontWeight: 500,
                                      textTransform: 'none',
                                      borderRadius: '6px',
                                      border: '1px solid rgba(255, 255, 255, 0.2)',
                                      boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.1)',
                                      ml: 1,
                                      '&:hover': {
                                        backgroundColor: 'rgba(255, 255, 255, 0.25)',
                                        color: '#ffffff',
                                        borderColor: 'rgba(255, 255, 255, 0.3)',
                                        boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.15)',
                                      },
                                    }}
                                  >
                                    Detail
                                  </Button>
                                </Box>
                                {/* Claimed와 Remaining 정보 */}
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: 0.5 }}>
                                  {(() => {
                                    const nftKey = `${nft.contractAddress}-${nft.tokenId}`;
                                    const info = nodeInfoMap.get(nftKey);
                                    if (info) {
                                      const totalClaimed = parseFloat(info.totalClaimed || '0');
                                      const totalRemaining = parseFloat(info.totalRemaining || '0');
                                      return (
                                        <>
                                          <Typography
                                            variant="caption"
                                            sx={{ 
                                              fontSize: '0.65rem', 
                                              color: 'rgba(255, 255, 255, 0.7)',
                                              lineHeight: 1.2,
                                            }}
                                          >
                                            Claimed: {totalClaimed.toFixed(2)} 0G
                                          </Typography>
                                          <Typography
                                            variant="caption"
                                            sx={{ 
                                              fontSize: '0.65rem', 
                                              color: 'rgba(255, 255, 255, 0.7)',
                                              lineHeight: 1.2,
                                            }}
                                          >
                                            Remaining: {totalRemaining.toFixed(2)} 0G
                                          </Typography>
                                        </>
                                      );
                                    }
                                    // 정보가 없을 때는 빈 공간 유지 (깜빡임 방지)
                                    return (
                                      <Box sx={{ minHeight: '32px' }} />
                                    );
                                  })()}
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
                                  const totalClaimed = parseFloat(info.totalClaimed || '0');
                                  const claimedPercentage = totalAllocated > 0 
                                    ? (totalClaimed / totalAllocated) * 100 
                                    : 0;
                                  
                                  return (
                                    <Box sx={{ mt: 'auto', pt: 1 }} onClick={(e) => e.stopPropagation()}>
                                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', mb: 0.5, display: 'block' }}>
                                        Progress: {claimedPercentage.toFixed(1)}%
                                      </Typography>
                                      <LinearProgress
                                        variant="determinate"
                                        value={claimedPercentage}
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
                            {selectedNFTDetail.name && selectedNFTDetail.name !== 'Unnamed' ? selectedNFTDetail.name : `#${selectedNFTDetail.tokenId}`}
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

                {/* Transfer History Section */}
                <Box sx={{ mt: 4 }}>
                  <Typography variant="h6" sx={{ color: '#e6e0e9', fontWeight: 600, fontSize: '1.125rem', letterSpacing: '-0.01em', mb: 3 }}>
                    Transfer History ({transfers.length})
                  </Typography>
                  {loadingTransfers ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                      <CircularProgress sx={{ color: '#FFFFFF' }} />
                    </Box>
                  ) : transfers.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 4 }}>
                      <Typography variant="body1" sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                        No transfer history found for this NFT.
                      </Typography>
                    </Box>
                  ) : (
                    <Box>
                      {transfers.map((transfer, index) => {
                        const date = new Date(transfer.timestamp * 1000);
                        const formattedDate = date.toLocaleString('ko-KR', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        });
                        const isMint = transfer.from === '0x0000000000000000000000000000000000000000';
                        
                        return (
                          <Paper
                            key={index}
                            elevation={0}
                            sx={{
                              p: 2.5,
                              mb: 2,
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              borderRadius: '8px',
                              transition: 'all 0.2s ease',
                              '&:hover': {
                                borderColor: 'rgba(255, 255, 255, 0.2)',
                                background: 'rgba(255, 255, 255, 0.08)',
                              },
                            }}
                          >
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                              <Box sx={{ flex: 1 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                  <Typography
                                    variant="caption"
                                    sx={{
                                      fontSize: '0.7rem',
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.5px',
                                      color: 'rgba(255, 255, 255, 0.7)',
                                    }}
                                  >
                                    {isMint ? 'Mint' : 'Transfer'}
                                  </Typography>
                                  <Typography
                                    variant="caption"
                                    sx={{
                                      fontSize: '0.75rem',
                                      color: 'rgba(255, 255, 255, 0.5)',
                                    }}
                                  >
                                    {formattedDate}
                                  </Typography>
                                </Box>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.6)', minWidth: '40px' }}>
                                      From:
                                    </Typography>
                                    <Typography
                                      variant="body2"
                                      component="a"
                                      href={`https://chainscan.0g.ai/address/${transfer.from}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      sx={{
                                        color: isMint ? 'rgba(255, 255, 255, 0.4)' : '#a8c5ff',
                                        fontFamily: 'monospace',
                                        fontSize: '0.8125rem',
                                        textDecoration: 'none',
                                        '&:hover': {
                                          color: '#2962ff',
                                          textDecoration: 'underline',
                                        },
                                      }}
                                    >
                                      {isMint ? 'Null Address' : `${transfer.from.slice(0, 6)}...${transfer.from.slice(-4)}`}
                                    </Typography>
                                  </Box>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.6)', minWidth: '40px' }}>
                                      To:
                                    </Typography>
                                    <Typography
                                      variant="body2"
                                      component="a"
                                      href={`https://chainscan.0g.ai/address/${transfer.to}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      sx={{
                                        color: '#a8c5ff',
                                        fontFamily: 'monospace',
                                        fontSize: '0.8125rem',
                                        textDecoration: 'none',
                                        '&:hover': {
                                          color: '#2962ff',
                                          textDecoration: 'underline',
                                        },
                                      }}
                                    >
                                      {`${transfer.to.slice(0, 6)}...${transfer.to.slice(-4)}`}
                                    </Typography>
                                  </Box>
                                </Box>
                              </Box>
                              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                                <Typography
                                  variant="body2"
                                  component="a"
                                  href={`https://chainscan.0g.ai/tx/${transfer.transactionHash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  sx={{
                                    color: '#a8c5ff',
                                    fontFamily: 'monospace',
                                    fontSize: '0.8125rem',
                                    textDecoration: 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 0.5,
                                    '&:hover': {
                                      color: '#2962ff',
                                      textDecoration: 'underline',
                                    },
                                  }}
                                >
                                  <OpenInNewIcon sx={{ fontSize: '0.875rem' }} />
                                  {`${transfer.transactionHash.slice(0, 8)}...${transfer.transactionHash.slice(-6)}`}
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.7rem' }}>
                                  Block #{transfer.blockNumber.toLocaleString()}
                                </Typography>
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

export default StevePage;
