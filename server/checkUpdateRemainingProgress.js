// updateRemaining85470.js 진행 상황 확인 스크립트
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, 'nft_data.db');
const db = new Database(dbPath);

try {
  // DB에서 Remaining이 854.70인 NFT 개수 확인
  const result = db.prepare(`
    SELECT COUNT(*) as count
    FROM global_claim_data
    WHERE CAST(allocation_per_token AS REAL) = 854.70 
      AND CAST(consumed AS REAL) < 0.01
  `).get();
  
  console.log('\n=== Remaining 854.70 업데이트 진행 상황 ===\n');
  console.log(`현재 Remaining이 854.70인 NFT: ${result.count}개`);
  console.log('\n프로세스 확인:');
  console.log('  ps aux | grep updateRemaining85470 | grep -v grep');
  console.log('');
  
} catch (error) {
  console.error('오류:', error.message);
} finally {
  db.close();
}


