import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  CardContent,
  Grid,
  Alert,
  CircularProgress,
  TextField,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  IconButton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  ToggleButton,
  ToggleButtonGroup,
  Stack,
} from '@mui/material';
import {
  Search as SearchIcon,
  AccountBalanceWallet as WalletIcon,
  Close as CloseIcon,
  OpenInNew as OpenInNewIcon,
  ShoppingCart as ShoppingCartIcon,
  Send as SendIcon,
  ViewModule as ViewModuleIcon,
  ViewList as ViewListViewIcon,
} from '@mui/icons-material';
import { darkTheme } from './theme';
import { 
  connectWallet, 
  switchToZeroGNetwork, 
  getCurrentAccount, 
  isMetaMaskInstalled 
} from './utils/metamask';
import { ethers } from 'ethers';

// ERC721 ABI (minimal for owner and tokenURI)
const ERC721_ABI = [
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function safeTransferFrom(address from, address to, uint256 tokenId)',
];

// NFT Contract Address
const NFT_CONTRACT_ADDRESS = '0x756e78b846af68dd579809f4c204f11223ad5236';
const ZERO_G_RPC = 'https://evmrpc.0g.ai';

interface MarketNFT {
  tokenId: string;
  owner: string;
  image: string;
  price?: string;
  forSale: boolean;
}

function MarketPage() {
  const navigate = useNavigate();
  const [account, setAccount] = useState<string | null>(null);
  const [nfts, setNfts] = useState<MarketNFT[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTokenId, setSearchTokenId] = useState<string>('');
  const [selectedNFT, setSelectedNFT] = useState<MarketNFT | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [buyDialogOpen, setBuyDialogOpen] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferAddress, setTransferAddress] = useState<string>('');
  const [transferring, setTransferring] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>('tokenId');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Load current account on mount
  useEffect(() => {
    const loadAccount = async () => {
      if (isMetaMaskInstalled()) {
        const currentAccount = await getCurrentAccount();
        if (currentAccount) {
          setAccount(currentAccount.toLowerCase());
        }
      }
    };
    loadAccount();
  }, []);

  // Load NFTs
  useEffect(() => {
    loadNFTs();
  }, []);

  const loadNFTs = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Load NFTs from token ID 1 to 1000 (adjust based on your collection size)
      const provider = new ethers.JsonRpcProvider(ZERO_G_RPC);
      const contract = new ethers.Contract(NFT_CONTRACT_ADDRESS, ERC721_ABI, provider);
      
      const marketNFTs: MarketNFT[] = [];
      const maxTokenId = 1000; // Adjust based on your collection size
      
      // Batch load NFTs (check ownership)
      const batchSize = 50;
      for (let startId = 1; startId <= maxTokenId; startId += batchSize) {
        const promises: Promise<void>[] = [];
        
        for (let tokenId = startId; tokenId < startId + batchSize && tokenId <= maxTokenId; tokenId++) {
          promises.push(
            (async () => {
              try {
                const owner = await contract.ownerOf(tokenId);
                const imageUrl = `https://node-sale-nft-images.0g.ai/${tokenId}.png`;
                
                marketNFTs.push({
                  tokenId: tokenId.toString(),
                  owner: owner.toLowerCase(),
                  image: imageUrl,
                  forSale: false, // TODO: Check if listed on marketplace contract
                });
              } catch (err: any) {
                // Token doesn't exist or error - skip silently
                // This is expected for tokens that haven't been minted yet
              }
            })()
          );
        }
        
        await Promise.all(promises);
        
        // Update UI periodically for better UX
        if (marketNFTs.length > 0 && marketNFTs.length % 100 === 0) {
          setNfts([...marketNFTs].sort((a, b) => parseInt(a.tokenId) - parseInt(b.tokenId)));
        }
      }
      
      setNfts(marketNFTs.sort((a, b) => parseInt(a.tokenId) - parseInt(b.tokenId)));
    } catch (err: any) {
      console.error('Error loading NFTs:', err);
      setError(err.message || 'Failed to load NFTs. Please check if the contract address is correct.');
    } finally {
      setLoading(false);
    }
  };

  const handleConnectWallet = async () => {
    try {
      if (!isMetaMaskInstalled()) {
        setError('MetaMask is not installed. Please install MetaMask to continue.');
        return;
      }

      await switchToZeroGNetwork();
      const connectedAccount = await connectWallet();
      setAccount(connectedAccount.toLowerCase());
    } catch (err: any) {
      setError(err.message || 'Failed to connect wallet');
    }
  };

  const handleNFTClick = (nft: MarketNFT) => {
    setSelectedNFT(nft);
    setDetailDialogOpen(true);
  };

  const handleBuyClick = () => {
    if (!selectedNFT) return;
    setDetailDialogOpen(false);
    setBuyDialogOpen(true);
  };

  const handleBuy = async () => {
    if (!selectedNFT || !account) return;
    
    setTransferring(true);
    setError(null);
    
    try {
      if (!isMetaMaskInstalled()) {
        throw new Error('MetaMask is not installed');
      }

      // TODO: Implement actual purchase logic
      // This is a placeholder - you'll need to integrate with a marketplace contract
      // For now, this would just be a direct transfer (which requires approval)
      // const provider = new ethers.BrowserProvider(window.ethereum!);
      // const signer = await provider.getSigner();
      // const contract = new ethers.Contract(NFT_CONTRACT_ADDRESS, ERC721_ABI, signer);
      setError('Purchase functionality not yet implemented. Marketplace contract integration required.');
      
      setBuyDialogOpen(false);
    } catch (err: any) {
      console.error('Buy error:', err);
      setError(err.message || 'Failed to purchase NFT');
    } finally {
      setTransferring(false);
    }
  };

  const handleTransferClick = () => {
    if (!selectedNFT) return;
    setDetailDialogOpen(false);
    setTransferDialogOpen(true);
  };

  const handleTransfer = async () => {
    if (!selectedNFT || !account || !transferAddress.trim()) return;
    
    if (!/^0x[a-fA-F0-9]{40}$/.test(transferAddress.trim())) {
      setError('Invalid address format');
      return;
    }

    if (selectedNFT.owner !== account) {
      setError('You are not the owner of this NFT');
      return;
    }

    setTransferring(true);
    setError(null);

    try {
      if (!isMetaMaskInstalled()) {
        throw new Error('MetaMask is not installed');
      }

      await switchToZeroGNetwork();
      const provider = new ethers.BrowserProvider(window.ethereum!);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(NFT_CONTRACT_ADDRESS, ERC721_ABI, signer);

      const tx = await contract.safeTransferFrom(
        account,
        transferAddress.trim(),
        selectedNFT.tokenId,
        {
          gasLimit: 150000,
        }
      );

      await tx.wait();
      setSuccess('NFT transferred successfully!');
      setTransferDialogOpen(false);
      setTransferAddress('');
      loadNFTs(); // Reload NFTs
    } catch (err: any) {
      console.error('Transfer error:', err);
      if (err.code === 4001) {
        setError('Transaction was rejected');
      } else {
        setError(err.message || 'Failed to transfer NFT');
      }
    } finally {
      setTransferring(false);
    }
  };

  // Sort NFTs based on sortBy
  const sortedNFTs = [...nfts].sort((a, b) => {
    switch (sortBy) {
      case 'tokenId':
        return parseInt(a.tokenId) - parseInt(b.tokenId);
      case 'tokenIdDesc':
        return parseInt(b.tokenId) - parseInt(a.tokenId);
      default:
        return parseInt(a.tokenId) - parseInt(b.tokenId);
    }
  });

  const filteredNFTs = searchTokenId
    ? sortedNFTs.filter(nft => nft.tokenId.includes(searchTokenId))
    : sortedNFTs;

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', backgroundColor: '#0a0a0f' }}>
        <AppBar position="static" sx={{ backgroundColor: 'rgba(26, 26, 46, 0.8)', backdropFilter: 'blur(20px)' }}>
          <Toolbar>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 700 }}>
              0G NFT Marketplace
            </Typography>
            {account ? (
              <Chip
                icon={<WalletIcon />}
                label={formatAddress(account)}
                color="primary"
                sx={{ mr: 2 }}
              />
            ) : (
              <Button
                color="inherit"
                startIcon={<WalletIcon />}
                onClick={handleConnectWallet}
                sx={{ mr: 2 }}
              >
                Connect Wallet
              </Button>
            )}
            <Button
              color="inherit"
              onClick={() => navigate('/')}
            >
              Home
            </Button>
          </Toolbar>
        </AppBar>

        <Container maxWidth="xl" sx={{ py: 4 }}>
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

          {/* OpenSea-style Header */}
          <Box sx={{ mb: 4 }}>
            <Typography variant="h4" sx={{ color: '#e6e0e9', fontWeight: 700, mb: 1 }}>
              0G Node NFT Collection
            </Typography>
            <Typography variant="body1" sx={{ color: 'rgba(255, 255, 255, 0.6)', mb: 3 }}>
              {filteredNFTs.length} items
            </Typography>
            
            {/* Search and Filter Bar */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }}>
              <TextField
                fullWidth
                placeholder="Search by Token ID..."
                value={searchTokenId}
                onChange={(e) => setSearchTokenId(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: 'rgba(255, 255, 255, 0.5)' }} />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  flex: 1,
                  '& .MuiOutlinedInput-root': {
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '12px',
                    '& fieldset': {
                      borderColor: 'rgba(255, 255, 255, 0.1)',
                    },
                    '&:hover fieldset': {
                      borderColor: 'rgba(255, 255, 255, 0.2)',
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: 'primary.main',
                    },
                  },
                  '& .MuiInputBase-input': {
                    color: '#e6e0e9',
                    py: 1.5,
                  },
                }}
              />
              
              <Stack direction="row" spacing={1}>
                <FormControl size="small" sx={{ minWidth: 150 }}>
                  <InputLabel sx={{ color: 'rgba(255, 255, 255, 0.6)' }}>Sort by</InputLabel>
                  <Select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    label="Sort by"
                    sx={{
                      color: '#e6e0e9',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      borderRadius: '12px',
                      '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                      },
                      '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: 'rgba(255, 255, 255, 0.2)',
                      },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: 'primary.main',
                      },
                    }}
                  >
                    <MenuItem value="tokenId">Token ID (Low to High)</MenuItem>
                    <MenuItem value="tokenIdDesc">Token ID (High to Low)</MenuItem>
                  </Select>
                </FormControl>
                
                <ToggleButtonGroup
                  value={viewMode}
                  exclusive
                  onChange={(_, newMode) => newMode && setViewMode(newMode)}
                  size="small"
                  sx={{
                    '& .MuiToggleButton-root': {
                      color: 'rgba(255, 255, 255, 0.6)',
                      borderColor: 'rgba(255, 255, 255, 0.1)',
                      '&.Mui-selected': {
                        backgroundColor: 'rgba(41, 98, 255, 0.2)',
                        color: 'primary.main',
                        borderColor: 'primary.main',
                      },
                    },
                  }}
                >
                  <ToggleButton value="grid">
                    <ViewModuleIcon />
                  </ToggleButton>
                  <ToggleButton value="list">
                    <ViewListViewIcon />
                  </ToggleButton>
                </ToggleButtonGroup>
              </Stack>
            </Stack>
          </Box>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress />
            </Box>
          ) : viewMode === 'grid' ? (
            <Grid container spacing={2.5}>
              {filteredNFTs.map((nft) => (
                <Grid item xs={6} sm={4} md={3} lg={2} xl={2} key={nft.tokenId}>
                  <Card
                    sx={{
                      backgroundColor: 'transparent',
                      border: 'none',
                      borderRadius: '16px',
                      cursor: 'pointer',
                      overflow: 'hidden',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      position: 'relative',
                      '&:hover': {
                        transform: 'translateY(-8px)',
                        '& .nft-image': {
                          transform: 'scale(1.05)',
                        },
                        '& .nft-overlay': {
                          opacity: 1,
                        },
                      },
                    }}
                    onClick={() => handleNFTClick(nft)}
                  >
                    <Box
                      sx={{
                        position: 'relative',
                        width: '100%',
                        paddingTop: '100%',
                        overflow: 'hidden',
                        borderRadius: '12px',
                        backgroundColor: 'rgba(0, 0, 0, 0.3)',
                      }}
                    >
                      <Box
                        component="img"
                        src={nft.image}
                        alt={`NFT #${nft.tokenId}`}
                        className="nft-image"
                        sx={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        }}
                        onError={(e: any) => {
                          e.target.src = 'https://via.placeholder.com/400?text=NFT';
                        }}
                      />
                      <Box
                        className="nft-overlay"
                        sx={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)',
                          opacity: 0,
                          transition: 'opacity 0.3s ease',
                          display: 'flex',
                          alignItems: 'flex-end',
                          p: 2,
                        }}
                      >
                        <Typography
                          variant="body2"
                          sx={{
                            color: '#fff',
                            fontWeight: 600,
                          }}
                        >
                          View Details
                        </Typography>
                      </Box>
                    </Box>
                    <CardContent sx={{ p: 1.5, pb: 1, '&:last-child': { pb: 1 } }}>
                      <Typography
                        variant="body2"
                        sx={{
                          color: '#e6e0e9',
                          fontWeight: 600,
                          fontSize: '0.875rem',
                          mb: 0.5,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        #{nft.tokenId}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.5 }}>
                        <Typography
                          variant="caption"
                          sx={{
                            color: 'rgba(255, 255, 255, 0.5)',
                            fontSize: '0.75rem',
                          }}
                        >
                          {formatAddress(nft.owner)}
                        </Typography>
                        {nft.forSale && nft.price && (
                          <Chip
                            label={`${nft.price} 0G`}
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: '0.7rem',
                              backgroundColor: 'rgba(41, 98, 255, 0.2)',
                              color: 'primary.main',
                              fontWeight: 600,
                            }}
                          />
                        )}
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          ) : (
            <Stack spacing={2}>
              {filteredNFTs.map((nft) => (
                <Card
                  key={nft.tokenId}
                  sx={{
                    backgroundColor: 'rgba(30, 35, 48, 0.5)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    '&:hover': {
                      backgroundColor: 'rgba(30, 35, 48, 0.7)',
                      borderColor: 'primary.main',
                    },
                  }}
                  onClick={() => handleNFTClick(nft)}
                >
                  <Box sx={{ display: 'flex', p: 2, gap: 2 }}>
                    <Box
                      component="img"
                      src={nft.image}
                      alt={`NFT #${nft.tokenId}`}
                      sx={{
                        width: 80,
                        height: 80,
                        borderRadius: '8px',
                        objectFit: 'cover',
                        backgroundColor: 'rgba(0, 0, 0, 0.3)',
                      }}
                      onError={(e: any) => {
                        e.target.src = 'https://via.placeholder.com/80?text=NFT';
                      }}
                    />
                    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <Typography variant="h6" sx={{ color: '#e6e0e9', fontWeight: 600, mb: 0.5 }}>
                        Token #{nft.tokenId}
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                        Owner: {formatAddress(nft.owner)}
                      </Typography>
                    </Box>
                    {nft.forSale && nft.price && (
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Chip
                          label={`${nft.price} 0G`}
                          color="primary"
                          sx={{ fontWeight: 600 }}
                        />
                      </Box>
                    )}
                  </Box>
                </Card>
              ))}
            </Stack>
          )}

          {!loading && filteredNFTs.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <Typography variant="h6" sx={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                No NFTs found
              </Typography>
            </Box>
          )}
        </Container>

        {/* NFT Detail Dialog */}
        <Dialog
          open={detailDialogOpen}
          onClose={() => setDetailDialogOpen(false)}
          maxWidth="sm"
          fullWidth
          PaperProps={{
            sx: {
              backgroundColor: 'rgba(26, 26, 46, 0.95)',
              backdropFilter: 'blur(20px)',
            },
          }}
        >
          <DialogTitle sx={{ color: '#e6e0e9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">NFT Details</Typography>
            <IconButton onClick={() => setDetailDialogOpen(false)} sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent>
            {selectedNFT && (
              <Box>
                <Box
                  component="img"
                  src={selectedNFT.image}
                  alt={`NFT #${selectedNFT.tokenId}`}
                  sx={{
                    width: '100%',
                    borderRadius: '12px',
                    mb: 3,
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                  }}
                  onError={(e: any) => {
                    e.target.src = 'https://via.placeholder.com/400?text=NFT';
                  }}
                />
                <Typography variant="h6" sx={{ color: '#e6e0e9', mb: 2 }}>
                  Token #{selectedNFT.tokenId}
                </Typography>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.6)', mb: 0.5 }}>
                    Owner
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body1" sx={{ color: '#e6e0e9', fontFamily: 'monospace' }}>
                      {selectedNFT.owner}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={() => window.open(`https://chainscan.0g.ai/address/${selectedNFT.owner}`, '_blank')}
                      sx={{ color: 'rgba(255, 255, 255, 0.7)' }}
                    >
                      <OpenInNewIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>
                {selectedNFT.price && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.6)', mb: 0.5 }}>
                      Price
                    </Typography>
                    <Typography variant="h6" sx={{ color: '#e6e0e9' }}>
                      {selectedNFT.price} 0G
                    </Typography>
                  </Box>
                )}
              </Box>
            )}
          </DialogContent>
          <DialogActions sx={{ p: 2, gap: 1 }}>
            {selectedNFT && account && selectedNFT.owner === account && (
              <Button
                variant="outlined"
                onClick={handleTransferClick}
                sx={{ color: '#e6e0e9', borderColor: 'rgba(255, 255, 255, 0.3)' }}
              >
                Transfer
              </Button>
            )}
            {selectedNFT && account && selectedNFT.owner !== account && selectedNFT.forSale && (
              <Button
                variant="contained"
                startIcon={<ShoppingCartIcon />}
                onClick={handleBuyClick}
              >
                Buy Now
              </Button>
            )}
            <Button
              onClick={() => setDetailDialogOpen(false)}
              sx={{ color: 'rgba(255, 255, 255, 0.7)' }}
            >
              Close
            </Button>
          </DialogActions>
        </Dialog>

        {/* Buy Dialog */}
        <Dialog
          open={buyDialogOpen}
          onClose={() => !transferring && setBuyDialogOpen(false)}
          maxWidth="sm"
          fullWidth
          PaperProps={{
            sx: {
              backgroundColor: 'rgba(26, 26, 46, 0.95)',
              backdropFilter: 'blur(20px)',
            },
          }}
        >
          <DialogTitle sx={{ color: '#e6e0e9' }}>
            Purchase NFT
          </DialogTitle>
          <DialogContent>
            {selectedNFT && (
              <Box>
                <Typography variant="body1" sx={{ color: 'rgba(255, 255, 255, 0.7)', mb: 2 }}>
                  Token #{selectedNFT.tokenId}
                </Typography>
                {selectedNFT.price && (
                  <Typography variant="h6" sx={{ color: '#e6e0e9', mb: 2 }}>
                    Price: {selectedNFT.price} 0G
                  </Typography>
                )}
                <Alert severity="info" sx={{ mt: 2 }}>
                  Purchase functionality requires marketplace contract integration.
                </Alert>
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => setBuyDialogOpen(false)}
              disabled={transferring}
              sx={{ color: 'rgba(255, 255, 255, 0.7)' }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleBuy}
              disabled={transferring || !selectedNFT}
              startIcon={transferring ? <CircularProgress size={16} /> : <ShoppingCartIcon />}
            >
              {transferring ? 'Processing...' : 'Confirm Purchase'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Transfer Dialog */}
        <Dialog
          open={transferDialogOpen}
          onClose={() => !transferring && setTransferDialogOpen(false)}
          maxWidth="sm"
          fullWidth
          PaperProps={{
            sx: {
              backgroundColor: 'rgba(26, 26, 46, 0.95)',
              backdropFilter: 'blur(20px)',
            },
          }}
        >
          <DialogTitle sx={{ color: '#e6e0e9' }}>
            Transfer NFT
          </DialogTitle>
          <DialogContent>
            {selectedNFT && (
              <Box>
                <Typography variant="body1" sx={{ color: 'rgba(255, 255, 255, 0.7)', mb: 2 }}>
                  Token #{selectedNFT.tokenId}
                </Typography>
                <TextField
                  fullWidth
                  label="Recipient Address"
                  value={transferAddress}
                  onChange={(e) => setTransferAddress(e.target.value)}
                  placeholder="0x..."
                  disabled={transferring}
                  sx={{
                    mt: 2,
                    '& .MuiOutlinedInput-root': {
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      '& fieldset': {
                        borderColor: 'rgba(255, 255, 255, 0.2)',
                      },
                      '&:hover fieldset': {
                        borderColor: 'rgba(255, 255, 255, 0.3)',
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: 'primary.main',
                      },
                    },
                    '& .MuiInputBase-input': {
                      color: '#e6e0e9',
                    },
                    '& .MuiInputLabel-root': {
                      color: 'rgba(255, 255, 255, 0.6)',
                    },
                  }}
                />
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => {
                setTransferDialogOpen(false);
                setTransferAddress('');
              }}
              disabled={transferring}
              sx={{ color: 'rgba(255, 255, 255, 0.7)' }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleTransfer}
              disabled={transferring || !transferAddress.trim()}
              startIcon={transferring ? <CircularProgress size={16} /> : <SendIcon />}
            >
              {transferring ? 'Transferring...' : 'Transfer'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </ThemeProvider>
  );
}

export default MarketPage;

