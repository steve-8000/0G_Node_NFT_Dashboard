import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// SQLite 데이터베이스 초기화
// 환경 변수 DB_PATH가 있으면 사용, 없으면 기본 경로 사용
const dbPath = process.env.DB_PATH || join(__dirname, 'nft_data.db');
const db = new Database(dbPath);

// 테이블 생성
db.exec(`
  CREATE TABLE IF NOT EXISTS nft_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT NOT NULL,
    contract_address TEXT NOT NULL,
    token_id TEXT NOT NULL,
    token_uri TEXT,
    name TEXT,
    symbol TEXT,
    image TEXT,
    balance TEXT,
    type TEXT,
    page_number INTEGER,
    updated_at INTEGER NOT NULL,
    UNIQUE(wallet_address, contract_address, token_id)
  );

  CREATE TABLE IF NOT EXISTS wallet_last_update (
    wallet_address TEXT PRIMARY KEY,
    last_updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS node_info (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT NOT NULL,
    contract_address TEXT NOT NULL,
    token_id TEXT NOT NULL,
    total_reward TEXT,
    delegated_time INTEGER,
    approved_time INTEGER,
    undelegated_time INTEGER,
    last_updated_time INTEGER,
    allocation_per_token TEXT,
    consumed TEXT,
    claimed TEXT,
    part_percentage TEXT,
    init_unlock TEXT,
    total_allocated TEXT,
    total_remaining TEXT,
    total_claimed TEXT,
    part1_claimed TEXT,
    part1_remaining TEXT,
    part1_total TEXT,
    part2_earned TEXT,
    part2_remaining TEXT,
    part2_total TEXT,
    updated_at INTEGER NOT NULL,
    UNIQUE(wallet_address, contract_address, token_id)
  );

  CREATE TABLE IF NOT EXISTS claim_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT NOT NULL,
    token_id TEXT NOT NULL,
    allocation_per_token TEXT,
    consumed TEXT,
    claimed TEXT,
    part_percentage TEXT,
    init_unlock TEXT,
    updated_at INTEGER NOT NULL,
    UNIQUE(wallet_address, token_id)
  );

  CREATE TABLE IF NOT EXISTS global_claim_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_id TEXT NOT NULL UNIQUE,
    allocation_per_token TEXT,
    consumed TEXT,
    claimed TEXT,
    part_percentage TEXT,
    init_unlock TEXT,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS global_claim_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_id TEXT NOT NULL UNIQUE,
    allocation_per_token TEXT,
    consumed TEXT,
    claimed TEXT,
    part_percentage TEXT,
    init_unlock TEXT,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS price_info (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usd REAL NOT NULL,
    krw REAL NOT NULL,
    change24h REAL,
    market_cap_usd REAL,
    market_cap_krw REAL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS portfolio_summary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT NOT NULL,
    total_allocated TEXT,
    total_remaining TEXT,
    total_claimed TEXT,
    total_earned TEXT,
    token_balance TEXT,
    balance_value TEXT,
    updated_at INTEGER NOT NULL,
    UNIQUE(wallet_address)
  );

  CREATE TABLE IF NOT EXISTS chart_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(period)
  );

  CREATE INDEX IF NOT EXISTS idx_wallet_page ON nft_cache(wallet_address, page_number);
  CREATE INDEX IF NOT EXISTS idx_wallet ON nft_cache(wallet_address);
  CREATE INDEX IF NOT EXISTS idx_updated ON nft_cache(updated_at);
  CREATE INDEX IF NOT EXISTS idx_node_wallet ON node_info(wallet_address);
  CREATE INDEX IF NOT EXISTS idx_claim_wallet ON claim_data(wallet_address);
  CREATE INDEX IF NOT EXISTS idx_price_updated ON price_info(updated_at);
  CREATE INDEX IF NOT EXISTS idx_portfolio_wallet ON portfolio_summary(wallet_address);
  CREATE INDEX IF NOT EXISTS idx_chart_period ON chart_data(period);
`);

// NFT 데이터 저장/업데이트
export function saveNFTs(walletAddress, nfts, pageNumber) {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO nft_cache 
    (wallet_address, contract_address, token_id, token_uri, name, symbol, image, balance, type, page_number, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((nfts) => {
    const now = Date.now();
    for (const nft of nfts) {
      insert.run(
        walletAddress.toLowerCase(),
        nft.contractAddress,
        nft.tokenId,
        nft.tokenUri || null,
        nft.name || null,
        nft.symbol || null,
        nft.image || null,
        nft.balance || '1',
        nft.type || 'ERC721',
        pageNumber,
        now
      );
    }
  });

  insertMany(nfts);
}

// 특정 페이지의 NFT 데이터 조회
export function getNFTsByPage(walletAddress, pageNumber, itemsPerPage) {
  const offset = (pageNumber - 1) * itemsPerPage;
  const limit = itemsPerPage;

  const nfts = db.prepare(`
    SELECT contract_address as contractAddress,
           token_id as tokenId,
           token_uri as tokenUri,
           name,
           symbol,
           image,
           balance,
           type,
           updated_at as updatedAt
    FROM nft_cache
    WHERE wallet_address = ? AND page_number = ?
    ORDER BY token_id
    LIMIT ? OFFSET ?
  `).all(walletAddress.toLowerCase(), pageNumber, limit, offset);

  return nfts;
}

// 전체 NFT 목록 조회 (페이지네이션 없이)
export function getAllNFTs(walletAddress) {
  const nfts = db.prepare(`
    SELECT contract_address as contractAddress,
           token_id as tokenId,
           token_uri as tokenUri,
           name,
           symbol,
           image,
           balance,
           type,
           updated_at as updatedAt
    FROM nft_cache
    WHERE wallet_address = ?
    ORDER BY token_id
  `).all(walletAddress.toLowerCase());

  return nfts;
}

// 특정 지갑의 NFT 총 개수 조회
export function getNFTCount(walletAddress) {
  const result = db.prepare(`
    SELECT COUNT(*) as count
    FROM nft_cache
    WHERE wallet_address = ?
  `).get(walletAddress.toLowerCase());

  return result.count;
}

// 특정 페이지의 데이터가 최신인지 확인 (예: 5분 이내)
export function isPageDataFresh(walletAddress, pageNumber, maxAge = 5 * 60 * 1000) {
  const result = db.prepare(`
    SELECT MAX(updated_at) as lastUpdated
    FROM nft_cache
    WHERE wallet_address = ? AND page_number = ?
  `).get(walletAddress.toLowerCase(), pageNumber);

  if (!result || !result.lastUpdated) {
    return false;
  }

  const age = Date.now() - result.lastUpdated;
  return age < maxAge;
}

// 특정 지갑의 모든 데이터 삭제 (새로고침 시 사용)
export function clearWalletData(walletAddress) {
  db.prepare(`
    DELETE FROM nft_cache
    WHERE wallet_address = ?
  `).run(walletAddress.toLowerCase());
}

// 오래된 데이터 정리 (30일 이상 된 데이터)
export function cleanupOldData(maxAge = 30 * 24 * 60 * 60 * 1000) {
  const cutoff = Date.now() - maxAge;
  const result = db.prepare(`
    DELETE FROM nft_cache
    WHERE updated_at < ?
  `).run(cutoff);

  return result.changes;
}

// 지갑별 마지막 업데이트 시간 조회
export function getWalletLastUpdate(walletAddress) {
  const result = db.prepare(`
    SELECT last_updated_at
    FROM wallet_last_update
    WHERE wallet_address = ?
  `).get(walletAddress.toLowerCase());

  return result ? result.last_updated_at : null;
}

// 지갑별 마지막 업데이트 시간 설정
export function setWalletLastUpdate(walletAddress) {
  const now = Date.now();
  db.prepare(`
    INSERT OR REPLACE INTO wallet_last_update (wallet_address, last_updated_at)
    VALUES (?, ?)
  `).run(walletAddress.toLowerCase(), now);
  return now;
}

// 24시간 내 업데이트 여부 확인
export function isWalletDataFresh(walletAddress, maxAge = 24 * 60 * 60 * 1000) {
  const lastUpdate = getWalletLastUpdate(walletAddress);
  if (!lastUpdate) {
    return false;
  }
  const age = Date.now() - lastUpdate;
  return age < maxAge;
}

// 노드 정보 저장
export function saveNodeInfo(walletAddress, contractAddress, tokenId, nodeInfo) {
  const now = Date.now();
  // NodeNFTInfo의 모든 필드를 저장 (계산된 값들 포함)
  db.prepare(`
    INSERT OR REPLACE INTO node_info 
    (wallet_address, contract_address, token_id, total_reward, delegated_time, 
     approved_time, undelegated_time, last_updated_time, allocation_per_token, 
     consumed, claimed, part_percentage, init_unlock, 
     total_allocated, total_remaining, total_claimed,
     part1_claimed, part1_remaining, part1_total,
     part2_earned, part2_remaining, part2_total,
     updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    walletAddress.toLowerCase(),
    contractAddress,
    tokenId,
    nodeInfo.totalReward || null,
    nodeInfo.delegatedTime || null,
    nodeInfo.approvedTime || null,
    nodeInfo.undelegatedTime || null,
    nodeInfo.lastUpdatedTime || null,
    nodeInfo.allocationPerToken || nodeInfo.totalAllocated || null,
    nodeInfo.consumed || null,
    nodeInfo.claimed || nodeInfo.part1Claimed || null,
    nodeInfo.partPercentage || null,
    nodeInfo.initUnlock || null,
    nodeInfo.totalAllocated || null,
    nodeInfo.totalRemaining || null,
    nodeInfo.totalClaimed || null,
    nodeInfo.part1Claimed || null,
    nodeInfo.part1Remaining || null,
    nodeInfo.part1Total || null,
    nodeInfo.part2Earned || null,
    nodeInfo.part2Remaining || null,
    nodeInfo.part2Total || null,
    now
  );
}

// 노드 정보 조회
export function getNodeInfo(walletAddress, contractAddress, tokenId) {
  const result = db.prepare(`
    SELECT total_reward as totalReward,
           delegated_time as delegatedTime,
           approved_time as approvedTime,
           undelegated_time as undelegatedTime,
           last_updated_time as lastUpdatedTime,
           allocation_per_token as allocationPerToken,
           consumed,
           claimed,
           part_percentage as partPercentage,
           init_unlock as initUnlock,
           total_allocated as totalAllocated,
           total_remaining as totalRemaining,
           total_claimed as totalClaimed,
           part1_claimed as part1Claimed,
           part1_remaining as part1Remaining,
           part1_total as part1Total,
           part2_earned as part2Earned,
           part2_remaining as part2Remaining,
           part2_total as part2Total
    FROM node_info
    WHERE wallet_address = ? AND contract_address = ? AND token_id = ?
  `).get(walletAddress.toLowerCase(), contractAddress, tokenId);

  return result || null;
}

// 지갑의 모든 노드 정보 조회
export function getAllNodeInfo(walletAddress) {
  const results = db.prepare(`
    SELECT contract_address as contractAddress,
           token_id as tokenId,
           total_reward as totalReward,
           delegated_time as delegatedTime,
           approved_time as approvedTime,
           undelegated_time as undelegatedTime,
           last_updated_time as lastUpdatedTime,
           allocation_per_token as allocationPerToken,
           consumed,
           claimed,
           part_percentage as partPercentage,
           init_unlock as initUnlock,
           total_allocated as totalAllocated,
           total_remaining as totalRemaining,
           total_claimed as totalClaimed,
           part1_claimed as part1Claimed,
           part1_remaining as part1Remaining,
           part1_total as part1Total,
           part2_earned as part2Earned,
           part2_remaining as part2Remaining,
           part2_total as part2Total
    FROM node_info
    WHERE wallet_address = ?
  `).all(walletAddress.toLowerCase());

  return results;
}

// 클레임 데이터 저장
export function saveClaimData(walletAddress, tokenId, claimData) {
  const now = Date.now();
  db.prepare(`
    INSERT OR REPLACE INTO claim_data 
    (wallet_address, token_id, allocation_per_token, consumed, claimed, 
     part_percentage, init_unlock, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    walletAddress.toLowerCase(),
    tokenId,
    claimData.allocationPerToken || null,
    claimData.consumed || null,
    claimData.claimed || null,
    claimData.partPercentage || null,
    claimData.initUnlock || null,
    now
  );
}

// 클레임 데이터 조회
export function getClaimData(walletAddress, tokenId) {
  const result = db.prepare(`
    SELECT allocation_per_token as allocationPerToken,
           consumed,
           claimed,
           part_percentage as partPercentage,
           init_unlock as initUnlock
    FROM claim_data
    WHERE wallet_address = ? AND token_id = ?
  `).get(walletAddress.toLowerCase(), tokenId);

  return result || null;
}

// 지갑의 모든 클레임 데이터 조회
export function getAllClaimData(walletAddress) {
  const results = db.prepare(`
    SELECT token_id as tokenId,
           allocation_per_token as allocationPerToken,
           consumed,
           claimed,
           part_percentage as partPercentage,
           init_unlock as initUnlock
    FROM claim_data
    WHERE wallet_address = ?
  `).all(walletAddress.toLowerCase());

  return results;
}

// 지갑 데이터 전체 삭제 (Refresh 시 사용)
export function clearAllWalletData(walletAddress) {
  const wallet = walletAddress.toLowerCase();
  db.prepare(`DELETE FROM nft_cache WHERE wallet_address = ?`).run(wallet);
  db.prepare(`DELETE FROM node_info WHERE wallet_address = ?`).run(wallet);
  db.prepare(`DELETE FROM claim_data WHERE wallet_address = ?`).run(wallet);
  db.prepare(`DELETE FROM wallet_last_update WHERE wallet_address = ?`).run(wallet);
  db.prepare(`DELETE FROM portfolio_summary WHERE wallet_address = ?`).run(wallet);
}

// 가격 정보 저장
export function savePriceInfo(usd, krw, change24h, marketCapUsd, marketCapKrw) {
  const now = Date.now();
  db.prepare(`DELETE FROM price_info`).run();
  db.prepare(`
    INSERT INTO price_info (usd, krw, change24h, market_cap_usd, market_cap_krw, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(usd, krw, change24h || null, marketCapUsd || null, marketCapKrw || null, now);
  return now;
}

export function getPriceInfo() {
  const result = db.prepare(`
    SELECT usd, krw, change24h, market_cap_usd as marketCapUsd, market_cap_krw as marketCapKrw, updated_at as updatedAt
    FROM price_info
    ORDER BY updated_at DESC
    LIMIT 1
  `).get();

  return result || null;
}

// Portfolio Summary 저장
export function savePortfolioSummary(walletAddress, summary) {
  const now = Date.now();
  db.prepare(`
    INSERT OR REPLACE INTO portfolio_summary 
    (wallet_address, total_allocated, total_remaining, total_claimed, 
     total_earned, token_balance, balance_value, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    walletAddress.toLowerCase(),
    summary.totalAllocated || null,
    summary.totalRemaining || null,
    summary.totalClaimed || null,
    summary.totalEarned || null,
    summary.tokenBalance || null,
    summary.balanceValue || null,
    now
  );
  return now;
}

// Portfolio Summary 조회
export function getPortfolioSummary(walletAddress) {
  const result = db.prepare(`
    SELECT total_allocated as totalAllocated,
           total_remaining as totalRemaining,
           total_claimed as totalClaimed,
           total_earned as totalEarned,
           token_balance as tokenBalance,
           balance_value as balanceValue,
           updated_at as updatedAt
    FROM portfolio_summary
    WHERE wallet_address = ?
  `).get(walletAddress.toLowerCase());

  return result || null;
}

// 차트 데이터 저장
export function saveChartData(period, data) {
  const now = Date.now();
  const dataJson = JSON.stringify(data);
  db.prepare(`
    INSERT OR REPLACE INTO chart_data (period, data, updated_at)
    VALUES (?, ?, ?)
  `).run(period, dataJson, now);
  return now;
}

// 차트 데이터 조회
export function getChartData(period) {
  const result = db.prepare(`
    SELECT data, updated_at as updatedAt
    FROM chart_data
    WHERE period = ?
  `).get(period);

  if (result) {
    try {
      const data = JSON.parse(result.data);
      return {
        data,
        updatedAt: result.updatedAt
      };
    } catch (error) {
      console.error('Failed to parse chart data:', error);
      return null;
    }
  }

  return null;
}

// 전역 클레임 데이터 저장 (토큰 ID만 사용, 모든 NFT에 공통)
export function saveGlobalClaimData(tokenId, claimData) {
  const now = Date.now();
  db.prepare(`
    INSERT OR REPLACE INTO global_claim_data 
    (token_id, allocation_per_token, consumed, claimed, 
     part_percentage, init_unlock, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    tokenId,
    claimData.allocationPerToken || null,
    claimData.consumed || null,
    claimData.claimed || null,
    claimData.partPercentage || null,
    claimData.initUnlock || null,
    now
  );
}

// 전역 클레임 데이터 조회 (토큰 ID로 조회)
export function getGlobalClaimData(tokenId) {
  const result = db.prepare(`
    SELECT allocation_per_token as allocationPerToken,
           consumed,
           claimed,
           part_percentage as partPercentage,
           init_unlock as initUnlock
    FROM global_claim_data
    WHERE token_id = ?
  `).get(tokenId);

  return result || null;
}

// 여러 토큰 ID의 클레임 데이터 일괄 조회 (10배 속도 최적화)
export function getGlobalClaimDataBatch(tokenIds) {
  if (!tokenIds || tokenIds.length === 0) {
    return [];
  }
  
  // 최적화: Set을 사용한 중복 제거 (더 빠름)
  const uniqueTokenIds = Array.from(new Set(tokenIds.filter(id => id && typeof id === 'string')));
  
  if (uniqueTokenIds.length === 0) {
    return [];
  }
  
  // 최적화: SQLite의 최대 변수 개수 제한을 고려하되, 가능한 한 큰 배치 사용
  // SQLite는 최대 999개의 변수를 지원하지만, 실제로는 더 많이 처리 가능
  // 안전을 위해 999개로 유지하되, 쿼리 최적화
  const MAX_BATCH_SIZE = 999;
  const results = [];
  
  // 최적화: prepared statement 재사용
  const queryTemplate = db.prepare(`
    SELECT token_id as tokenId,
           allocation_per_token as allocationPerToken,
           consumed,
           claimed,
           part_percentage as partPercentage,
           init_unlock as initUnlock
    FROM global_claim_data
    WHERE token_id IN (${Array(MAX_BATCH_SIZE).fill('?').join(',')})
  `);
  
  for (let i = 0; i < uniqueTokenIds.length; i += MAX_BATCH_SIZE) {
    const batch = uniqueTokenIds.slice(i, i + MAX_BATCH_SIZE);
    
    // 배치 크기가 MAX_BATCH_SIZE보다 작으면 동적 쿼리 생성
    if (batch.length < MAX_BATCH_SIZE) {
      const placeholders = batch.map(() => '?').join(',');
      const dynamicQuery = db.prepare(`
        SELECT token_id as tokenId,
               allocation_per_token as allocationPerToken,
               consumed,
               claimed,
               part_percentage as partPercentage,
               init_unlock as initUnlock
        FROM global_claim_data
        WHERE token_id IN (${placeholders})
      `);
      const batchResults = dynamicQuery.all(...batch);
      results.push(...batchResults);
    } else {
      // 정확히 MAX_BATCH_SIZE인 경우 prepared statement 사용
      const batchResults = queryTemplate.all(...batch);
      results.push(...batchResults);
    }
  }

  return results;
}

// 전역 클레임 데이터 통계 조회
export function getGlobalClaimDataStats() {
  const result = db.prepare(`
    SELECT 
      COUNT(*) as total_count,
      MIN(CAST(token_id AS INTEGER)) as min_token_id,
      MAX(CAST(token_id AS INTEGER)) as max_token_id,
      MAX(updated_at) as last_updated_at
    FROM global_claim_data
  `).get();

  return result || { total_count: 0, min_token_id: null, max_token_id: null, last_updated_at: null };
}

export default db;


