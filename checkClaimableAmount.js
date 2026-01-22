import { ethers } from 'ethers';

const ZERO_G_RPC = 'https://evmrpc.0g.ai';
const CLAIM_CONTRACT_ADDRESS = '0x6a9c6b5507e322aa00eb9c45e80c07ab63acabb6';
const TARGET_ADDRESS = '0x00AEA25EFa4C90bd9A7F6725BD2202a88564EB80';

// Claim contract ABI
const CLAIM_CONTRACT_ABI = [
  'function allocationPerToken() view returns (uint256)',
  'function init_unlock() view returns (uint256)',
  'function partPercentage() view returns (uint256)',
  {
    name: 'claimData',
    type: 'function',
    inputs: [{ name: 'credential', type: 'uint256' }],
    outputs: [
      { name: 'consumed', type: 'uint256' },
      { name: 'claimed', type: 'uint256' }
    ],
    stateMutability: 'view'
  },
  {
    name: 'RewardClaimed',
    type: 'event',
    inputs: [
      { indexed: true, name: 'user', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'timestamp', type: 'uint256' }
    ]
  }
];

// NFT contract ABI (to get token IDs owned by address)
const NFT_CONTRACT_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)'
];

// Get all NFT token IDs owned by address
async function getOwnedTokenIds(address) {
  try {
    // Use https module for Node.js
    const https = await import('https');
    const url = `https://chainscan.0g.ai/open/api/nft/tokens?owner=${address}&limit=1000`;
    
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const jsonData = JSON.parse(data);
            if (jsonData.status === '1' && jsonData.result && jsonData.result.list) {
              const tokenIds = jsonData.result.list
                .filter(token => token.type === 'ERC721')
                .map(token => token.tokenId);
              
              console.log(`Found ${tokenIds.length} NFTs for address ${address}`);
              resolve(tokenIds);
            } else {
              resolve([]);
            }
          } catch (e) {
            // If JSON parse fails, return empty array (will use fallback)
            console.log('API response parse failed, will use fallback');
            resolve([]);
          }
        });
      }).on('error', reject);
    });
  } catch (error) {
    console.error('Error fetching NFT token IDs:', error);
    return [];
  }
}

// Calculate claimable amount for a token ID
async function getClaimableAmountForToken(tokenId, claimContract) {
  try {
    // Get claim data (handle both array and object responses)
    let claimDataResult;
    try {
      claimDataResult = await claimContract.claimData(parseInt(tokenId, 10));
    } catch (error) {
      console.warn(`claimData 조회 실패 (tokenId: ${tokenId}), 기본값 사용:`, error.message);
      claimDataResult = null;
    }
    
    let consumed, claimed;
    if (claimDataResult) {
      if (Array.isArray(claimDataResult)) {
        consumed = claimDataResult[0];
        claimed = claimDataResult[1];
      } else if (typeof claimDataResult === 'object') {
        consumed = claimDataResult.consumed || claimDataResult[0] || '0';
        claimed = claimDataResult.claimed || claimDataResult[1] || '0';
      } else {
        consumed = '0';
        claimed = '0';
      }
    } else {
      consumed = '0';
      claimed = '0';
    }
    
    // Get global parameters
    const allocationPerToken = await claimContract.allocationPerToken();
    const partPercentage = await claimContract.partPercentage();
    
    // Convert from wei
    const allocationPerTokenFloat = parseFloat(ethers.formatEther(allocationPerToken));
    const consumedFloat = parseFloat(ethers.formatEther(consumed));
    const claimedFloat = parseFloat(ethers.formatEther(claimed));
    const partPercentageFloat = parseFloat(ethers.formatEther(partPercentage));
    
    // Calculate Part 1 (initial unlock)
    const part1Total = allocationPerTokenFloat * partPercentageFloat;
    const part1Remaining = Math.max(0, part1Total - consumedFloat);
    
    // For Part 2, we need totalReward from GraphQL (this is earned from delegation)
    // For now, we'll calculate based on what's already claimed
    // Part 2 Total = allocationPerToken * (1 - partPercentage)
    const part2Total = allocationPerTokenFloat * (1 - partPercentageFloat);
    
    // Total remaining = Part 1 remaining + Part 2 remaining (we'll need totalReward for accurate Part 2)
    // For now, let's calculate what's claimable based on allocation and what's been consumed/claimed
    const totalAllocated = allocationPerTokenFloat;
    const totalClaimed = claimedFloat;
    const totalConsumed = consumedFloat;
    
    // Claimable = Total Allocated - Total Claimed - (Part 1 consumed but not yet claimed)
    // This is a simplified calculation
    const claimable = Math.max(0, totalAllocated - totalClaimed - (consumedFloat - claimedFloat));
    
    return {
      tokenId,
      allocationPerToken: allocationPerTokenFloat,
      consumed: consumedFloat,
      claimed: claimedFloat,
      part1Total,
      part1Remaining,
      part2Total,
      claimable: claimable
    };
  } catch (error) {
    console.error(`Error getting claimable amount for token ${tokenId}:`, error);
    return null;
  }
}

// Get total claimed amount from events
async function getTotalClaimedFromEvents(address, claimContract) {
  try {
    const network = new ethers.Network('0G Mainnet', 16661);
    const provider = new ethers.JsonRpcProvider(ZERO_G_RPC, network, {
      polling: false,
      batchMaxCount: 1,
    });
    
    console.log(`\nQuerying RewardClaimed events for address ${address}...`);
    
    // Get current block number
    const currentBlock = await provider.getBlockNumber();
    console.log(`Current block: ${currentBlock}`);
    
    // Query events from block 0 to current
    const fromBlock = 0;
    const toBlock = currentBlock;
    
    console.log(`Querying events from block ${fromBlock} to ${toBlock}...`);
    
    // Get RewardClaimed events for this address
    const filter = claimContract.filters.RewardClaimed(address);
    const events = await claimContract.queryFilter(filter, fromBlock, toBlock);
    
    console.log(`Found ${events.length} RewardClaimed events`);
    
    let totalClaimed = BigInt(0);
    events.forEach((event, index) => {
      if (event.args && event.args.amount) {
        const amount = BigInt(event.args.amount.toString());
        totalClaimed += amount;
        const amountFloat = parseFloat(ethers.formatEther(amount));
        const timestamp = event.args.timestamp ? new Date(Number(event.args.timestamp) * 1000).toISOString() : 'N/A';
        console.log(`  Event ${index + 1}: ${amountFloat.toFixed(2)} 0G at ${timestamp}`);
      }
    });
    
    const totalClaimedFloat = parseFloat(ethers.formatEther(totalClaimed));
    return totalClaimedFloat;
  } catch (error) {
    console.error('Error getting total claimed from events:', error);
    return 0;
  }
}

// Main function
async function checkClaimableAmount() {
  try {
    console.log(`\n=== Checking Claimable Amount ===`);
    console.log(`Address: ${TARGET_ADDRESS}`);
    console.log(`Claim Contract: ${CLAIM_CONTRACT_ADDRESS}\n`);
    
    const network = new ethers.Network('0G Mainnet', 16661);
    const provider = new ethers.JsonRpcProvider(ZERO_G_RPC, network, {
      polling: false,
      batchMaxCount: 1,
    });
    const claimContract = new ethers.Contract(CLAIM_CONTRACT_ADDRESS, CLAIM_CONTRACT_ABI, provider);
    
    // Get owned token IDs
    console.log('Fetching owned NFT token IDs...');
    let tokenIds = await getOwnedTokenIds(TARGET_ADDRESS);
    
    // Fallback: use known token ID if API fails
    if (tokenIds.length === 0) {
      console.log('API failed, trying known token ID...');
      // Based on previous information, this address has token ID 593
      tokenIds = ['593'];
      console.log(`Using token ID: ${tokenIds[0]}`);
    }
    
    console.log(`\nFound ${tokenIds.length} NFTs. Calculating claimable amounts...\n`);
    
    // Get claimable amount for each token
    const results = [];
    for (const tokenId of tokenIds) {
      const result = await getClaimableAmountForToken(tokenId, claimContract);
      if (result) {
        results.push(result);
        console.log(`Token #${tokenId}:`);
        console.log(`  Allocation: ${result.allocationPerToken.toFixed(2)} 0G`);
        console.log(`  Consumed: ${result.consumed.toFixed(2)} 0G`);
        console.log(`  Claimed: ${result.claimed.toFixed(2)} 0G`);
        console.log(`  Part 1 Remaining: ${result.part1Remaining.toFixed(2)} 0G`);
        console.log(`  Estimated Claimable: ${result.claimable.toFixed(2)} 0G\n`);
      }
    }
    
    // Calculate totals
    const totalAllocation = results.reduce((sum, r) => sum + r.allocationPerToken, 0);
    const totalConsumed = results.reduce((sum, r) => sum + r.consumed, 0);
    const totalClaimed = results.reduce((sum, r) => sum + r.claimed, 0);
    const totalClaimable = results.reduce((sum, r) => sum + r.claimable, 0);
    
    console.log(`\n=== Summary ===`);
    console.log(`Total NFTs: ${results.length}`);
    console.log(`Total Allocation: ${totalAllocation.toFixed(2)} 0G`);
    console.log(`Total Consumed: ${totalConsumed.toFixed(2)} 0G`);
    console.log(`Total Claimed: ${totalClaimed.toFixed(2)} 0G`);
    console.log(`Estimated Total Claimable: ${totalClaimable.toFixed(2)} 0G`);
    
    // Get total claimed from events (this is the most reliable method)
    console.log(`\n=== Checking RewardClaimed Events ===`);
    const totalClaimedFromEvents = await getTotalClaimedFromEvents(TARGET_ADDRESS, claimContract);
    console.log(`\n=== Final Summary ===`);
    console.log(`Total Claimed (from RewardClaimed events): ${totalClaimedFromEvents.toFixed(2)} 0G`);
    
    // Note: To get claimable amount, we need to know:
    // 1. Total allocation per NFT (from contract)
    // 2. Number of NFTs owned
    // 3. Total claimed (from events - we have this)
    // Claimable = (Total Allocation * Number of NFTs) - Total Claimed
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run
checkClaimableAmount();

