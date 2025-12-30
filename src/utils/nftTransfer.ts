import { ethers } from 'ethers';
import { NFTBalance } from '../types';

// ERC721 ABI (safeTransferFrom)
const ERC721_ABI = [
  'function safeTransferFrom(address from, address to, uint256 tokenId) external',
  'function transferFrom(address from, address to, uint256 tokenId) external',
];

// ERC1155 ABI (safeTransferFrom)
const ERC1155_ABI = [
  'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata data) external',
];

// Deprecated (pass gasLimit directly in options)

// Flag to prevent duplicate calls (per NFT)
const transferringNFTs = new Set<string>();

function getNFTKey(nft: NFTBalance): string {
  return `${nft.contractAddress}-${nft.tokenId}`;
}

export async function transferNFT(
  nft: NFTBalance,
  toAddress: string,
  fromAddress: string
): Promise<string> {
  const nftKey = getNFTKey(nft);
  
  if (transferringNFTs.has(nftKey)) {
    console.error(`[transferNFT duplicate call blocked] ${nftKey} - transfer already in progress`);
    throw new Error('NFT transfer is already in progress.');
  }

  if (typeof window.ethereum === 'undefined') {
    throw new Error('MetaMask is not installed.');
  }

  transferringNFTs.add(nftKey);
  console.log(`[transferNFT started] ${nftKey} - flag set`);
  
  try {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();

    // Check if ERC721 or ERC1155 (use type field)
    const isERC1155 = nft.type === 'ERC1155';

    if (isERC1155) {
      // ERC1155 transfer
      const contract = new ethers.Contract(nft.contractAddress, ERC1155_ABI, signer);
      const amount = nft.balance || '1';
      
      console.log(`[ERC1155 safeTransferFrom call] ${nftKey} - submitting transaction to MetaMask...`);
      
      const tx = await contract.safeTransferFrom(
        fromAddress,
        toAddress,
        nft.tokenId,
        amount,
        '0x',
        {
          gasLimit: 300000n // Sufficient gas limit
        }
      );
      const txHash = tx.hash;
      console.log(`[ERC1155 transaction submitted] ${nftKey} - transaction hash: ${txHash} - processing in MetaMask`);
      
      return txHash;
    } else {
      const contract = new ethers.Contract(nft.contractAddress, ERC721_ABI, signer);
      
      console.log(`[ERC721 safeTransferFrom call] ${nftKey} - submitting transaction to MetaMask...`);
      
      const tx = await contract.safeTransferFrom(
        fromAddress,
        toAddress,
        nft.tokenId,
        {
          gasLimit: 300000n // Sufficient gas limit
        }
      );
      const txHash = tx.hash;
      console.log(`[ERC721 transaction submitted] ${nftKey} - transaction hash: ${txHash} - processing in MetaMask`);
      
      return txHash;
    }
  } catch (error: any) {
    transferringNFTs.delete(nftKey);
    console.error(`[transferNFT failed] ${nftKey} - flag cleared:`, error);
    throw error;
  }
}

// Transfer multiple NFTs (individual transfers)
// Note: ERC-721 standard doesn't support batch transfers, so each NFT is sent individually
// MetaMask confirmation popup for each NFT is expected
export async function transferMultipleNFTs(
  nfts: NFTBalance[],
  toAddress: string,
  fromAddress: string
): Promise<string[]> {
  if (typeof window.ethereum === 'undefined') {
    throw new Error('MetaMask is not installed.');
  }

  if (nfts.length === 0) {
    return [];
  }

  const txHashes: string[] = [];
  
  console.log(`Transferring ${nfts.length} NFT(s). MetaMask confirmation will be shown for each NFT.`);
  
  for (let i = 0; i < nfts.length; i++) {
    const nft = nfts[i];
    const nftKey = `${nft.contractAddress}-${nft.tokenId}`;
    try {
      console.log(`[transferMultipleNFTs] [${i + 1}/${nfts.length}] transferNFT call started: ${nftKey}`);
      const txHash = await transferNFT(nft, toAddress, fromAddress);
      console.log(`[transferMultipleNFTs] [${i + 1}/${nfts.length}] transferNFT completed: ${nftKey} -> ${txHash}`);
      txHashes.push(txHash);
      
      const currentNftKey = `${nft.contractAddress}-${nft.tokenId}`;
      transferringNFTs.delete(currentNftKey);
      console.log(`[transferMultipleNFTs] [${i + 1}/${nfts.length}] flag cleared: ${currentNftKey} - ready for next NFT transfer`);
      
      if (i < nfts.length - 1) {
        console.log(`[transferMultipleNFTs] waiting before next NFT transfer... (${i + 1}/${nfts.length})`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error: any) {
      // Detect user rejection
      const isUserRejected = 
        error.code === 'ACTION_REJECTED' || 
        error.code === 4001 || 
        error.message?.includes('user rejected') || 
        error.message?.includes('User rejected') ||
        error.message?.includes('user denied') ||
        error.reason === 'rejected';
      
      if (isUserRejected) {
        console.log(`[${i + 1}/${nfts.length}] User rejected the transaction. Cancelling transfer.`);
        if (txHashes.length > 0) {
          throw new Error(`Transfer was cancelled. ${txHashes.length} NFT(s) were transferred, the rest were cancelled.`);
        } else {
          throw new Error('Transfer was cancelled.');
        }
      }
      
      console.error(`[${i + 1}/${nfts.length}] NFT transfer failed (${nft.contractAddress}/${nft.tokenId}):`, error);
      throw new Error(`NFT transfer failed (${i + 1}/${nfts.length}): ${error.message || error.reason || 'Unknown error'}`);
    }
  }

  console.log(`All NFT transfers completed. Total ${txHashes.length} transaction(s) created.`);
  return txHashes;
}
