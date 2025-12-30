import { NetworkConfig } from '../types';

export const ZERO_G_NETWORK: NetworkConfig = {
  chainId: '0x4115', // 16661 in hex
  chainName: '0G Mainnet',
  nativeCurrency: {
    name: '0G',
    symbol: '0G',
    decimals: 18,
  },
  rpcUrls: ['https://evmrpc.0g.ai'],
  blockExplorerUrls: ['https://chainscan.0g.ai'],
};

export async function addZeroGNetwork(): Promise<boolean> {
  if (typeof window.ethereum === 'undefined') {
    throw new Error('MetaMask is not installed.');
  }

  try {
    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [ZERO_G_NETWORK],
    });
    return true;
  } catch (error: any) {
    if (error.code === 4902) {
      // Network already added
      return true;
    }
    throw error;
  }
}

export async function switchToZeroGNetwork(): Promise<boolean> {
  if (typeof window.ethereum === 'undefined') {
    throw new Error('MetaMask is not installed.');
  }

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ZERO_G_NETWORK.chainId }],
    });
    return true;
  } catch (error: any) {
    if (error.code === 4902) {
      // Network not found, add it
      return await addZeroGNetwork();
    }
    throw error;
  }
}

export async function connectWallet(): Promise<string> {
  if (typeof window.ethereum === 'undefined') {
    throw new Error('MetaMask is not installed.');
  }

  try {
    const accounts = await window.ethereum.request({
      method: 'eth_requestAccounts',
    });
    return accounts[0];
  } catch (error) {
    throw error;
  }
}

export async function getCurrentAccount(): Promise<string | null> {
  if (typeof window.ethereum === 'undefined') {
    return null;
  }

  try {
    const accounts = await window.ethereum.request({
      method: 'eth_accounts',
    });
    return accounts[0] || null;
  } catch (error) {
    return null;
  }
}

export function isMetaMaskInstalled(): boolean {
  return typeof window.ethereum !== 'undefined';
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
      isMetaMask?: boolean;
      on: (event: string, handler: (...args: any[]) => void) => void;
      removeListener: (event: string, handler: (...args: any[]) => void) => void;
    };
  }
}










