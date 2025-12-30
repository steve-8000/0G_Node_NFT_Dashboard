import { ethers } from 'ethers';

// 0G Mainnet RPC URL
const ZERO_G_RPC = 'https://evmrpc.0g.ai';

// Get 0G token balance
// useRpcProvider: Use RPC directly without MetaMask
export async function getTokenBalance(address: string, useRpcProvider = false, retryCount = 0): Promise<string> {
  const maxRetries = 3;
  const retryDelay = 1000; // 1s
  
  try {
    let provider: ethers.Provider;
    
    if (useRpcProvider) {
      // Use RPC Provider (no MetaMask)
      // Use staticNetwork to avoid network detection failures
      const network = new ethers.Network('0G Mainnet', 16661);
      provider = new ethers.JsonRpcProvider(ZERO_G_RPC, network, {
        polling: false,
        batchMaxCount: 1,
        staticNetwork: network, // Skip network detection
      });
    } else {
      // Use BrowserProvider (MetaMask required)
      if (typeof window.ethereum === 'undefined') {
        throw new Error('MetaMask is not installed.');
      }
      provider = new ethers.BrowserProvider(window.ethereum);
    }
    
    const balance = await provider.getBalance(address);
    // Convert from wei to 0G (18 decimals)
    const balanceIn0G = ethers.formatEther(balance);
    return parseFloat(balanceIn0G).toFixed(2);
  } catch (error: any) {
    console.error(`Failed to get token balance (재시도: ${retryCount}/${maxRetries}):`, error);
    
    // Retry on network errors
    const isNetworkError = error?.message?.includes('failed to detect network') ||
                          error?.message?.includes('Failed to fetch') ||
                          error?.code === 'NETWORK_ERROR' ||
                          error?.code === 'TIMEOUT';
    
    if (isNetworkError && retryCount < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, retryDelay * (retryCount + 1)));
      return getTokenBalance(address, useRpcProvider, retryCount + 1);
    }
    
    // Return 0 on final failure (don't throw error)
    console.warn('Token balance fetch failed, returning 0');
    return '0.00';
  }
}

// Get 0G price from CoinGecko API (USD only, for backward compatibility)
export async function get0GPrice(): Promise<number | null> {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=zero-gravity&vs_currencies=usd');
    if (response.ok) {
      const data = await response.json();
      if (data['zero-gravity'] && data['zero-gravity'].usd) {
        const price = data['zero-gravity'].usd;
        console.log('0G price from CoinGecko:', price);
        return price;
      }
    }
    console.log('CoinGecko API failed, using fallback price: 0.80 USD');
    return 0.80;
  } catch (error) {
    console.error('Failed to fetch 0G price:', error);
    return 0.80;
  }
}

// Get 0G price from CoinGecko API (USD and KRW)
export async function get0GPriceWithKRW(): Promise<{ usd: number; krw: number; change24h: number } | null> {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=zero-gravity&vs_currencies=usd,krw&include_24hr_change=true');
    if (response.ok) {
      const data = await response.json();
      if (data['zero-gravity']) {
        const usd = data['zero-gravity'].usd || 0;
        const krw = data['zero-gravity'].krw || 0;
        const change24h = data['zero-gravity'].usd_24h_change || 0;
        console.log('0G price from CoinGecko:', { usd, krw, change24h });
        return { usd, krw, change24h };
      }
    }
    console.log('CoinGecko API failed, using fallback prices');
    return { usd: 0.80, krw: 0, change24h: 0 };
  } catch (error) {
    console.error('Failed to fetch 0G price:', error);
    return { usd: 0.80, krw: 0, change24h: 0 };
  }
}

// Get 0G market chart data from DB (server API)
// period: '1D' (1 day), '7D' (7 days), '1M' (30 days), '1Y' (365 days)
export async function get0GMarketChart(period: '1D' | '7D' | '1M' | '1Y' = '1D'): Promise<Array<{ timestamp: number; price: number }> | null> {
  try {
    // Try DB first
    const response = await fetch(`/db-api/api/chart?period=${period}`);
    if (response.ok) {
      const data = await response.json();
      if (data.status === '1' && data.result && data.result.data) {
        console.log(`0G market chart data loaded from DB (${period}):`, data.result.data.length, 'points');
        return data.result.data;
      }
    }
    
    // Fallback to CoinGecko API if DB fails
    console.log(`DB chart data unavailable, using CoinGecko API (${period})`);
    let days: number | string;
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
    
    const fallbackResponse = await fetch(`https://api.coingecko.com/api/v3/coins/zero-gravity/market_chart?vs_currency=usd&days=${days}`);
    if (fallbackResponse.ok) {
      const fallbackData = await fallbackResponse.json();
      if (fallbackData.prices && Array.isArray(fallbackData.prices)) {
        const chartData = fallbackData.prices.map(([timestamp, price]: [number, number]) => ({
          timestamp,
          price: price as number,
        }));
        console.log(`0G market chart data loaded from CoinGecko (${period}):`, chartData.length, 'points');
        return chartData;
      }
    }
    console.log('CoinGecko market chart API failed');
    return null;
  } catch (error) {
    console.error('Failed to fetch 0G market chart:', error);
    return null;
  }
}

// Get 0G price from DB (server API)
export async function get0GPriceFromDB(): Promise<{ usd: number; krw: number; change24h: number; marketCapUsd: number | null; marketCapKrw: number | null } | null> {
  try {
    const response = await fetch('/db-api/api/price');
    if (response.ok) {
      const data = await response.json();
      if (data.status === '1' && data.result) {
        console.log('0G price from DB:', data.result);
        return {
          usd: data.result.usd,
          krw: data.result.krw,
          change24h: data.result.change24h || 0,
          marketCapUsd: data.result.marketCapUsd || null,
          marketCapKrw: data.result.marketCapKrw || null
        };
      }
    }
    console.log('DB price API failed, falling back to CoinGecko');
    return null;
  } catch (error) {
    console.error('Failed to fetch 0G price from DB:', error);
    return null;
  }
}

