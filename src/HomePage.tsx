import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ThemeProvider,
  CssBaseline,
  Container,
  Typography,
  TextField,
  Button,
  Box,
  Paper,
  InputAdornment,
} from '@mui/material';
import {
  Search as SearchIcon,
} from '@mui/icons-material';
import { darkTheme } from './theme';
import './HomePage.css';

interface NFTImage {
  tokenId: string;
  imageUrl: string;
  x: number;
  y: number;
  rotation: number;
  size: number;
  opacity: number;
  loaded: boolean;
  animationDelay: number;
}

const imageCache = new Map<string, HTMLImageElement>();
const loadingPromises = new Map<string, Promise<void>>();

function HomePage() {
  const navigate = useNavigate();
  const [searchAddress, setSearchAddress] = useState<string>('');
  const [nftImages, setNftImages] = useState<NFTImage[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isValidAddress = (addr: string): boolean => {
    if (!addr) return false;
    return addr.startsWith('0x') && addr.length === 42;
  };

  const preloadImage = useCallback((url: string): Promise<void> => {
    if (imageCache.has(url)) {
      return Promise.resolve();
    }

    if (loadingPromises.has(url)) {
      return loadingPromises.get(url)!;
    }

    const promise = new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        imageCache.set(url, img);
        loadingPromises.delete(url);
        resolve();
      };
      img.onerror = () => {
        loadingPromises.delete(url);
        resolve();
      };
      img.src = url;
    });

    loadingPromises.set(url, promise);
    return promise;
  }, []);

  useEffect(() => {
    const loadRandomNFTs = async () => {
      setLoading(true);
      
      const tokenIds: number[] = [];
      const baseIds = Array.from({ length: 1000 }, (_, i) => i + 1);
      
      const width = window.innerWidth;
      let count: number;
      if (width < 768) {
        count = 10 + Math.floor(Math.random() * 6);
      } else if (width < 1200) {
        count = 15 + Math.floor(Math.random() * 8);
      } else {
        count = 20 + Math.floor(Math.random() * 9);
      }
      for (let i = 0; i < count; i++) {
        const randomIndex = Math.floor(Math.random() * baseIds.length);
        tokenIds.push(baseIds[randomIndex]);
        baseIds.splice(randomIndex, 1);
      }

      const calculatePositions = () => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        const occupiedAreas: Array<{ x: number; y: number; size: number }> = [];
        const minDistance = 150;
        
        const isPositionValid = (x: number, y: number, size: number): boolean => {
          for (const area of occupiedAreas) {
            const distance = Math.sqrt(
              Math.pow(x - area.x, 2) + Math.pow(y - area.y, 2)
            );
            if (distance < (size / 2 + area.size / 2 + minDistance)) {
              return false;
            }
          }
          return true;
        };
        
        // 위치 찾기 함수 (최대 시도 횟수)
        const findValidPosition = (preferredX: number, preferredY: number, size: number, maxAttempts = 50): { x: number; y: number } | null => {
          // 먼저 선호 위치 확인
          if (isPositionValid(preferredX, preferredY, size)) {
            return { x: preferredX, y: preferredY };
          }
          
          // 주변 위치들을 시도 (원형 패턴으로)
          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const radius = minDistance * attempt * 0.5;
            const angle = (attempt * 137.5) % 360; // 황금각을 이용한 균등 분포
            const x = preferredX + Math.cos(angle * Math.PI / 180) * radius;
            const y = preferredY + Math.sin(angle * Math.PI / 180) * radius;
            
            // 화면 경계 내에 있는지 확인
            if (x >= size / 2 && x <= width - size / 2 && 
                y >= size / 2 && y <= height - size / 2 &&
                isPositionValid(x, y, size)) {
              return { x, y };
            }
          }
          
          return null;
        };
        
        const images: NFTImage[] = [];
        
        for (let index = 0; index < tokenIds.length; index++) {
          const tokenId = tokenIds[index];
          const imageUrl = `https://node-sale-nft-images.0g.ai/${tokenId}.png`;
          
          const total = tokenIds.length;
          
          let preferredX = 0;
          let preferredY = 0;
          let rotation = 0;
          let size = 0;
          
          if (index < total / 3) {
            const cols = Math.ceil(Math.sqrt(total / 3));
            const row = Math.floor(index / cols);
            const col = index % cols;
            const gridWidth = width * 0.32;
            const gridHeight = height * 0.45;
            preferredX = (col / Math.max(cols - 1, 1)) * gridWidth + width * 0.08;
            preferredY = (row / Math.max(Math.ceil((total / 3) / cols) - 1, 1)) * gridHeight + height * 0.27;
            rotation = (Math.random() - 0.5) * 10;
            const sizeVariation = Math.random();
            if (sizeVariation < 0.3) {
              size = 50 + Math.random() * 40;
            } else if (sizeVariation < 0.7) {
              size = 90 + Math.random() * 30;
            } else {
              size = 120 + Math.random() * 40;
            }
          } else if (index < (total * 2) / 3) {
            const angle = ((index - total / 3) / (total / 3)) * Math.PI * 2;
            const radius = Math.min(width, height) * 0.25;
            preferredX = width / 2 + Math.cos(angle) * radius;
            preferredY = height / 2 + Math.sin(angle) * radius;
            rotation = angle * (180 / Math.PI) + (Math.random() - 0.5) * 12;
            const radiusRatio = Math.random();
            if (radiusRatio < 0.2) {
              size = 100 + Math.random() * 50;
            } else if (radiusRatio < 0.6) {
              size = 70 + Math.random() * 40;
            } else {
              size = 50 + Math.random() * 35;
            }
          } else {
            const diagonalIndex = index - (total * 2) / 3;
            const diagonalTotal = total / 3;
            const t = diagonalIndex / Math.max(diagonalTotal - 1, 1);
            preferredX = width * 0.62 + t * (width * 0.32);
            preferredY = height * 0.25 + (1 - t) * (height * 0.5);
            rotation = -25 + t * 50 + (Math.random() - 0.5) * 15;
            const sizeFactor = Math.abs(t - 0.5) * 2;
            const baseSize = 60 + sizeFactor * 40;
            const randomVariation = (Math.random() - 0.5) * 50;
            size = Math.max(50, Math.min(150, baseSize + randomVariation));
          }
          
          const position = findValidPosition(preferredX, preferredY, size);
          if (position) {
            occupiedAreas.push({ x: position.x, y: position.y, size });
            images.push({
              tokenId: tokenId.toString(),
              imageUrl,
              x: position.x,
              y: position.y,
              rotation,
              size,
              opacity: 0.12 + Math.random() * 0.18,
              loaded: false,
              animationDelay: index * 0.05,
            });
          }
        }
          
        setNftImages(images);

        const loadPromises = images.map((img) => preloadImage(img.imageUrl));
        
        Promise.race([
          Promise.all(loadPromises),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]).then(() => {
          setNftImages((prev) =>
            prev.map((img) => ({
              ...img,
              loaded: imageCache.has(img.imageUrl),
            }))
          );
          setLoading(false);
        });
      };

      calculatePositions();

      const handleResize = () => {
        calculatePositions();
      };

      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    };

    loadRandomNFTs();
  }, [preloadImage]);

  const handleSearch = () => {
    if (searchAddress.trim() && isValidAddress(searchAddress.trim())) {
      navigate(`/${searchAddress.trim()}`);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box
        ref={containerRef}
        sx={{
          minHeight: '100vh',
          position: 'relative',
          overflow: 'hidden',
          background: 'linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 50%, #0f0f1e 100%)',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            overflow: 'hidden',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        >
          {nftImages.map((nft, index) => {
            const animationType = index % 3;
            const animationDuration = 8 + (index % 5) * 2;
            const baseTransform = `rotate(${nft.rotation}deg)`;
            
            return (
              <Box
                key={`${nft.tokenId}-${index}`}
                component="img"
                src={nft.imageUrl}
                alt={`NFT #${nft.tokenId}`}
                onError={(e: any) => {
                  e.target.style.display = 'none';
                }}
                onLoad={(e: any) => {
                  const target = e.target as HTMLImageElement;
                  target.style.opacity = nft.opacity.toString();
                }}
                sx={{
                  position: 'absolute',
                  left: `${nft.x}px`,
                  top: `${nft.y}px`,
                  width: `${nft.size}px`,
                  height: `${nft.size}px`,
                  objectFit: 'cover',
                  borderRadius: '12px',
                  opacity: nft.loaded ? nft.opacity : 0,
                  transform: baseTransform,
                  filter: 'blur(0.5px)',
                  transition: 'opacity 0.5s ease-in-out',
                  animation: nft.loaded
                    ? `floatAnimation${animationType} ${animationDuration}s ease-in-out infinite`
                    : 'none',
                  animationDelay: `${nft.animationDelay}s`,
                  transformOrigin: 'center center',
                  '@media (max-width: 768px)': {
                    width: `${nft.size * 0.6}px`,
                    height: `${nft.size * 0.6}px`,
                  },
                }}
                style={{
                  transform: baseTransform,
                }}
              />
            );
          })}
        </Box>

        <Container
          maxWidth="md"
          sx={{
            position: 'relative',
            zIndex: 1,
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            py: 8,
          }}
        >
          <Paper
            elevation={0}
            sx={{
              p: { xs: 4, sm: 6, md: 8 },
              background: 'rgba(30, 35, 48, 0.7)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '24px',
              backdropFilter: 'blur(20px) saturate(180%)',
              boxShadow: '0px 8px 32px rgba(0, 0, 0, 0.4), 0px 4px 16px rgba(0, 0, 0, 0.2)',
              width: '100%',
              maxWidth: '600px',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                mb: 4,
                flexDirection: { xs: 'column', sm: 'row' },
              }}
            >
              <Box
                component="img"
                src="https://docs.0g.ai/img/0G-Logo-Dark.svg"
                alt="0G Logo"
                onError={(e: any) => {
                  e.target.style.display = 'none';
                }}
                sx={{
                  height: { xs: 60, sm: 80, md: 100 },
                  width: 'auto',
                  objectFit: 'contain',
                  flexShrink: 0,
                }}
              />
              <Typography
                variant="h2"
                component="h1"
                sx={{
                  fontWeight: 700,
                  color: '#e6e0e9',
                  textAlign: 'center',
                  fontSize: { xs: '1.75rem', sm: '2.25rem', md: '2.75rem' },
                  letterSpacing: '-0.02em',
                  background: 'linear-gradient(135deg, #ffffff 0%, #a8c5ff 100%)',
                  backgroundClip: 'text',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  margin: 0,
                }}
              >
                AI Alignment Node Dashboard
              </Typography>
            </Box>

            <Box
              sx={{
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                gap: 2,
                alignItems: 'stretch',
                mt: 4,
              }}
            >
              <TextField
                fullWidth
                placeholder="Enter a wallet address"
                value={searchAddress}
                onChange={(e) => setSearchAddress(e.target.value)}
                onKeyPress={handleKeyPress}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: 'rgba(255, 255, 255, 0.5)' }} />
                    </InputAdornment>
                  ),
                  sx: {
                    color: '#e6e0e9',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '12px',
                    '& .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'rgba(255, 255, 255, 0.2)',
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'rgba(255, 255, 255, 0.3)',
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'primary.main',
                    },
                  },
                }}
                sx={{
                  flex: 1,
                }}
              />
              <Button
                variant="contained"
                onClick={handleSearch}
                disabled={!searchAddress.trim() || !isValidAddress(searchAddress.trim())}
                sx={{
                  px: 4,
                  py: 1.5,
                  borderRadius: '12px',
                  fontSize: '1rem',
                  fontWeight: 600,
                  textTransform: 'none',
                  background: 'linear-gradient(135deg, #2962ff 0%, #1976d2 100%)',
                  boxShadow: '0px 4px 16px rgba(41, 98, 255, 0.4)',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #1976d2 0%, #1565c0 100%)',
                    boxShadow: '0px 6px 20px rgba(41, 98, 255, 0.5)',
                    transform: 'translateY(-2px)',
                  },
                  '&:disabled': {
                    background: 'rgba(255, 255, 255, 0.1)',
                    color: 'rgba(255, 255, 255, 0.3)',
                  },
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >
                Search
              </Button>
            </Box>

            {loading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.5)' }}>
                  Loading NFT gallery...
                </Typography>
              </Box>
            )}
          </Paper>
        </Container>

        <Box
          sx={{
            position: 'fixed',
            bottom: 16,
            right: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            zIndex: 1100,
            '@media (max-width: 600px)': {
              bottom: 12,
              right: 12,
            },
          }}
        >
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
    </ThemeProvider>
  );
}

export default HomePage;

