import express from 'express';
import cors from 'cors';
import {
  saveNFTs,
  getNFTsByPage,
  getAllNFTs,
  getNFTCount,
  isPageDataFresh,
  clearWalletData,
  cleanupOldData,
  getWalletLastUpdate,
  setWalletLastUpdate,
  isWalletDataFresh,
  saveNodeInfo,
  getNodeInfo,
  getAllNodeInfo,
  saveClaimData,
  getClaimData,
  getAllClaimData,
  clearAllWalletData,
  savePriceInfo,
  getPriceInfo,
  savePortfolioSummary,
  getPortfolioSummary,
  saveChartData,
  getChartData,
  saveGlobalClaimData,
  getGlobalClaimData,
  getGlobalClaimDataBatch,
  getGlobalClaimDataStats
} from './db.js';

const app = express();
const PORT = process.env.PORT || 3001;

// 미들웨어
app.use(cors());
app.use(express.json());

// 헬스 체크
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 지갑 데이터 상태 조회 (24시간 체크)
app.get('/api/db/wallet/:walletAddress/status', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    if (!walletAddress) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }

    const lastUpdate = getWalletLastUpdate(walletAddress);
    const isFresh = isWalletDataFresh(walletAddress);
    const nftCount = getNFTCount(walletAddress);

    res.json({
      status: '1',
      result: {
        walletAddress,
        lastUpdate,
        isFresh,
        hasData: nftCount > 0,
        nftCount
      }
    });
  } catch (error) {
    console.error('Error checking wallet status:', error);
    res.status(500).json({ error: 'Failed to check wallet status' });
  }
});

// 특정 페이지의 NFT 데이터 조회
app.get('/api/db/nfts/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const { page, itemsPerPage = 10 } = req.query;

    if (!walletAddress) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }

    // 페이지 번호가 제공된 경우
    if (page) {
      const pageNumber = parseInt(page, 10);
      const itemsPerPageNum = parseInt(itemsPerPage, 10);

      // DB에서 데이터 조회
      const nfts = getNFTsByPage(walletAddress, pageNumber, itemsPerPageNum);
      const totalCount = getNFTCount(walletAddress);
      const isFresh = isPageDataFresh(walletAddress, pageNumber);

      res.json({
        status: '1',
        result: {
          list: nfts,
          total: totalCount,
          page: pageNumber,
          itemsPerPage: itemsPerPageNum,
          isFresh,
          fromCache: true
        }
      });
    } else {
      // 전체 NFT 목록 조회
      const nfts = getAllNFTs(walletAddress);
      const totalCount = getNFTCount(walletAddress);

      res.json({
        status: '1',
        result: {
          list: nfts,
          total: totalCount,
          fromCache: true
        }
      });
    }
  } catch (error) {
    console.error('Error fetching NFTs from DB:', error);
    res.status(500).json({ error: 'Failed to fetch NFTs from database' });
  }
});

// NFT 데이터 저장/업데이트
app.post('/api/db/nfts/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const { nfts, pageNumber } = req.body;

    if (!walletAddress) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }

    if (!Array.isArray(nfts)) {
      return res.status(400).json({ error: 'NFTs must be an array' });
    }

    if (pageNumber === undefined || pageNumber === null) {
      return res.status(400).json({ error: 'Page number is required' });
    }

    // DB에 저장
    saveNFTs(walletAddress, nfts, pageNumber);
    // 마지막 업데이트 시간 갱신
    setWalletLastUpdate(walletAddress);

    res.json({
      status: '1',
      message: 'NFTs saved successfully',
      saved: nfts.length,
      pageNumber
    });
  } catch (error) {
    console.error('Error saving NFTs to DB:', error);
    res.status(500).json({ error: 'Failed to save NFTs to database' });
  }
});

// 노드 정보 저장
app.post('/api/db/node-info/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const { contractAddress, tokenId, nodeInfo } = req.body;

    if (!walletAddress || !contractAddress || !tokenId || !nodeInfo) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    saveNodeInfo(walletAddress, contractAddress, tokenId, nodeInfo);

    res.json({
      status: '1',
      message: 'Node info saved successfully'
    });
  } catch (error) {
    console.error('Error saving node info:', error);
    res.status(500).json({ error: 'Failed to save node info' });
  }
});

// 노드 정보 조회
app.get('/api/db/node-info/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const { contractAddress, tokenId } = req.query;

    if (!walletAddress) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }

    if (contractAddress && tokenId) {
      // 특정 NFT의 노드 정보 조회
      const nodeInfo = getNodeInfo(walletAddress, contractAddress, tokenId);
      res.json({
        status: '1',
        result: nodeInfo
      });
    } else {
      // 지갑의 모든 노드 정보 조회
      const nodeInfoList = getAllNodeInfo(walletAddress);
      res.json({
        status: '1',
        result: nodeInfoList
      });
    }
  } catch (error) {
    console.error('Error fetching node info:', error);
    res.status(500).json({ error: 'Failed to fetch node info' });
  }
});

// 클레임 데이터 저장
app.post('/api/db/claim-data/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const { tokenId, claimData } = req.body;

    if (!walletAddress || !tokenId || !claimData) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    saveClaimData(walletAddress, tokenId, claimData);

    res.json({
      status: '1',
      message: 'Claim data saved successfully'
    });
  } catch (error) {
    console.error('Error saving claim data:', error);
    res.status(500).json({ error: 'Failed to save claim data' });
  }
});

// 클레임 데이터 조회
app.get('/api/db/claim-data/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const { tokenId } = req.query;

    if (!walletAddress) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }

    if (tokenId) {
      // 특정 NFT의 클레임 데이터 조회
      const claimData = getClaimData(walletAddress, tokenId);
      res.json({
        status: '1',
        result: claimData
      });
    } else {
      // 지갑의 모든 클레임 데이터 조회
      const claimDataList = getAllClaimData(walletAddress);
      res.json({
        status: '1',
        result: claimDataList
      });
    }
  } catch (error) {
    console.error('Error fetching claim data:', error);
    res.status(500).json({ error: 'Failed to fetch claim data' });
  }
});

// 전역 클레임 데이터 조회 (토큰 ID로 조회)
app.get('/api/claim-data/:tokenId', async (req, res) => {
  try {
    const { tokenId } = req.params;
    
    if (!tokenId) {
      return res.status(400).json({ error: 'Token ID is required' });
    }
    
    const claimData = getGlobalClaimData(tokenId);
    
    if (claimData) {
      res.json({
        status: '1',
        result: claimData
      });
    } else {
      res.status(404).json({
        status: '0',
        message: 'Claim data not found'
      });
    }
  } catch (error) {
    console.error('Error fetching global claim data:', error);
    res.status(500).json({ error: 'Failed to fetch claim data' });
  }
});

// 전역 클레임 데이터 배치 조회 (여러 토큰 ID)
app.post('/api/claim-data/batch', async (req, res) => {
  try {
    const { tokenIds } = req.body;
    
    if (!tokenIds || !Array.isArray(tokenIds) || tokenIds.length === 0) {
      return res.status(400).json({ error: 'Token IDs array is required' });
    }
    
    const claimDataList = getGlobalClaimDataBatch(tokenIds);
    
    res.json({
      status: '1',
      result: claimDataList
    });
  } catch (error) {
    console.error('Error fetching global claim data batch:', error);
    res.status(500).json({ error: 'Failed to fetch claim data batch' });
  }
});

// 지갑 데이터 초기화 (전체 삭제 - Refresh 시 사용)
app.delete('/api/db/nfts/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;

    if (!walletAddress) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }

    // 모든 데이터 삭제 (NFT, 노드 정보, 클레임 데이터, 마지막 업데이트 시간)
    clearAllWalletData(walletAddress);

    res.json({
      status: '1',
      message: 'Wallet data cleared successfully'
    });
  } catch (error) {
    console.error('Error clearing wallet data:', error);
    res.status(500).json({ error: 'Failed to clear wallet data' });
  }
});

// 오래된 데이터 정리
app.post('/api/db/cleanup', async (req, res) => {
  try {
    const deleted = cleanupOldData();
    res.json({
      status: '1',
      message: 'Old data cleaned up successfully',
      deleted
    });
  } catch (error) {
    console.error('Error cleaning up old data:', error);
    res.status(500).json({ error: 'Failed to cleanup old data' });
  }
});

// 가격 정보 조회
app.get('/api/price', async (req, res) => {
  try {
    const priceInfo = getPriceInfo();
    if (priceInfo) {
      res.json({
        status: '1',
        result: {
          usd: priceInfo.usd,
          krw: priceInfo.krw,
          change24h: priceInfo.change24h,
          marketCapUsd: priceInfo.marketCapUsd,
          marketCapKrw: priceInfo.marketCapKrw,
          updatedAt: priceInfo.updatedAt
        }
      });
    } else {
      res.json({
        status: '0',
        message: 'Price information not available'
      });
    }
  } catch (error) {
    console.error('Error fetching price info:', error);
    res.status(500).json({ error: 'Failed to fetch price information' });
  }
});

// Portfolio Summary 조회
app.get('/api/db/portfolio/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    if (!walletAddress) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }

    const summary = getPortfolioSummary(walletAddress);
    if (summary) {
      res.json({
        status: '1',
        result: summary
      });
    } else {
      res.json({
        status: '0',
        message: 'Portfolio summary not available'
      });
    }
  } catch (error) {
    console.error('Error fetching portfolio summary:', error);
    res.status(500).json({ error: 'Failed to fetch portfolio summary' });
  }
});

// Portfolio Summary 저장
app.post('/api/db/portfolio/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const summary = req.body;

    if (!walletAddress) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }

    savePortfolioSummary(walletAddress, summary);

    res.json({
      status: '1',
      message: 'Portfolio summary saved successfully'
    });
  } catch (error) {
    console.error('Error saving portfolio summary:', error);
    res.status(500).json({ error: 'Failed to save portfolio summary' });
  }
});

// 차트 데이터 조회
app.get('/api/chart', async (req, res) => {
  try {
    const { period = '1D' } = req.query;
    const chartData = getChartData(period);
    if (chartData) {
      res.json({
        status: '1',
        result: {
          data: chartData.data,
          updatedAt: chartData.updatedAt
        }
      });
    } else {
      res.json({
        status: '0',
        message: 'Chart data not available'
      });
    }
  } catch (error) {
    console.error('Error fetching chart data:', error);
    res.status(500).json({ error: 'Failed to fetch chart data' });
  }
});

async function fetchPriceFromCoinGecko() {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=zero-gravity&vs_currencies=usd,krw&include_24hr_change=true&include_market_cap=true');
    if (response.ok) {
      const data = await response.json();
      if (data['zero-gravity']) {
        const usd = data['zero-gravity'].usd || 0;
        const krw = data['zero-gravity'].krw || 0;
        const change24h = data['zero-gravity'].usd_24h_change || 0;
        const marketCapUsd = data['zero-gravity'].usd_market_cap || null;
        const marketCapKrw = data['zero-gravity'].krw_market_cap || null;
        const updatedAt = savePriceInfo(usd, krw, change24h, marketCapUsd, marketCapKrw);
        console.log(`[Price update] USD: ${usd}, KRW: ${krw}, Change24h: ${change24h}, MarketCap USD: ${marketCapUsd}, MarketCap KRW: ${marketCapKrw}, Updated: ${new Date(updatedAt).toISOString()}`);
        return { usd, krw, change24h, marketCapUsd, marketCapKrw, updatedAt };
      }
    }
    console.warn('[Price update] CoinGecko API response failed');
    return null;
  } catch (error) {
    console.error('[Price update] Error:', error);
    return null;
  }
}

// CoinGecko API에서 차트 데이터 가져오기
async function fetchChartDataFromCoinGecko(period) {
  try {
    let days;
    switch (period) {
      case '1D':
        days = 1;
        break;
      case '7D':
        days = 7;
        break;
      case '1M':
        days = 30;
        break;
      case '1Y':
        days = 365;
        break;
      default:
        days = 1;
    }

    const response = await fetch(`https://api.coingecko.com/api/v3/coins/zero-gravity/market_chart?vs_currency=usd&days=${days}`);
    if (response.ok) {
      const data = await response.json();
      if (data.prices && Array.isArray(data.prices)) {
        const chartData = data.prices.map(([timestamp, price]) => ({
          timestamp,
          price: price,
        }));
        const updatedAt = saveChartData(period, chartData);
        console.log(`[차트 데이터 업데이트] Period: ${period}, Points: ${chartData.length}, Updated: ${new Date(updatedAt).toISOString()}`);
        return { data: chartData, updatedAt };
      }
    }
    console.warn(`[차트 데이터 업데이트] Period: ${period}, CoinGecko API 응답 실패`);
    return null;
  } catch (error) {
    console.error(`[차트 데이터 업데이트] Period: ${period}, 오류:`, error);
    return null;
  }
}

// 모든 기간의 차트 데이터 업데이트
async function updateAllChartData() {
  const periods = ['1D', '7D', '1M', '1Y'];
  for (const period of periods) {
    await fetchChartDataFromCoinGecko(period);
    // Rate limit 방지를 위해 각 요청 사이에 딜레이
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// 서버 시작 시 즉시 가격 정보 및 차트 데이터 업데이트
fetchPriceFromCoinGecko();
updateAllChartData();

// 10분마다 가격 정보 및 차트 데이터 업데이트 (600,000ms = 10분)
const PRICE_UPDATE_INTERVAL = 10 * 60 * 1000;
setInterval(() => {
  fetchPriceFromCoinGecko();
  updateAllChartData();
}, PRICE_UPDATE_INTERVAL);

// 서버 시작
app.listen(PORT, () => {
  console.log(`NFT Database Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Price update interval: ${PRICE_UPDATE_INTERVAL / 1000 / 60} minutes`);
});


