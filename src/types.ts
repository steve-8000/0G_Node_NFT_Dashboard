export interface NFTBalance {
  contractAddress: string;
  tokenId: string;
  tokenUri?: string;
  name?: string;
  symbol?: string;
  image?: string;
  balance?: string;
  type?: string; // ERC721, ERC1155, etc.
  contract?: string; // Used for collection queries
}

export interface NFTToken {
  contract: string;
  tokenId: string;
  owner: string;
  tokenUri?: string;
  name?: string;
  symbol?: string;
  image?: string;
  type?: string;
  amount?: string;
}

export interface NFTBalanceResponse {
  status: string;
  message: string;
  result: {
    total: number;
    list: NFTBalance[];
  };
}

export interface NFTTokenResponse {
  status: string;
  message: string;
  result: {
    total: number;
    list: NFTToken[];
    next?: string | number | null; // Cursor for pagination
  };
}

export interface NetworkConfig {
  chainId: string;
  chainName: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: string[];
  blockExplorerUrls: string[];
}

export interface Trait {
  trait_type: string;
  value: string | number;
  display_type?: string;
  count?: number;
  percentage?: number;
  floor_price?: number | string;
}

export interface NFTTransfer {
  txIndex: number;
  txLogIndex: number;
  from: string;
  to: string;
  tokenId: string;
  timestamp: number;
  transactionHash: string;
  contract: string;
  blockNumber: number;
}

