import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const db = new Database(join(__dirname, 'nft_data.db'));

const walletAddress = '0x8dd8945dfd30216b85f8628a8a1e8d7ae5652106';
const count = db.prepare('SELECT COUNT(*) as count FROM nft_cache WHERE wallet_address = ?').get(walletAddress.toLowerCase());
console.log('DB에 저장된 NFT 개수:', count.count);

// 페이지별로 몇 개씩 저장되어 있는지 확인
const pageCounts = db.prepare('SELECT page_number, COUNT(*) as count FROM nft_cache WHERE wallet_address = ? GROUP BY page_number ORDER BY page_number').all(walletAddress.toLowerCase());
console.log('페이지별 NFT 개수:');
pageCounts.forEach((row) => {
  console.log(`  페이지 ${row.page_number}: ${row.count}개`);
});

// 실제로 getAllNFTs가 몇 개를 반환하는지 확인
const { getAllNFTs } = await import('./db.js');
const allNFTs = getAllNFTs(walletAddress);
console.log(`getAllNFTs 반환 개수: ${allNFTs.length}개`);

db.close();









