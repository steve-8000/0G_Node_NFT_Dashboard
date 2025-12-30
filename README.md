# 0G Node NFT Dashboard

A comprehensive dashboard for viewing and managing 0G Network Node NFTs. Built with React, TypeScript, and Material-UI.

## Features

### Dashboard Overview
- **Wallet Search**: Enter any wallet address to view NFT portfolio and node information
- **Price Information**: Real-time 0G token prices in USD/KRW with market cap
- **Price Chart**: Interactive chart with 1D, 7D, 1M, 1Y periods
- **Portfolio Summary**: Complete overview of owned and delegated NFTs with allocation details
- **NFT List**: Browse all NFTs with pagination and detailed information

### NFT Management
- **MetaMask Integration**: Connect wallet and transfer NFTs
- **Transfer History**: View complete transfer records for each NFT
- **NFT Details**: Comprehensive NFT information including token ID, contract address, and claim status
- **Delegated NFT Support**: View NFTs delegated to contracts

### Technical Features
- **Server-side Database**: SQLite database for caching price data and claim information
- **Real-time Updates**: Price information updates every 5 minutes
- **Responsive Design**: Optimized for desktop and mobile devices
- **Currency Toggle**: Switch between USD and KRW for all price displays

## Tech Stack

### Frontend
- React 18
- TypeScript
- Material-UI (MUI)
- Vite
- React Router

### Backend
- Express.js
- SQLite (better-sqlite3)
- Node.js

### Blockchain
- Ethers.js
- 0G Network Mainnet

## Installation

```bash
# Install dependencies
npm install

# Install server dependencies
cd server
npm install
cd ..
```

## Development

```bash
# Start frontend dev server
npm run dev

# Start backend server (in another terminal)
cd server
node server.js
```

## Build

```bash
# Build for production
npm run build

# Output will be in dist/ directory
```

## API Endpoints

The server provides REST API endpoints for:
- Price information (`/api/price`)
- Chart data (`/api/chart`)
- Claim data (`/api/claim-data/:tokenId`)
- Batch claim data (`/api/claim-data/batch`)

## Environment

- **Network**: 0G Mainnet (Chain ID: 16661)
- **RPC**: https://evmrpc.0g.ai
- **Block Explorer**: https://chainscan.0g.ai

## License

MIT

