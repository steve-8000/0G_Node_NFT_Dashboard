import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const db = new Database(join(__dirname, 'nft_data.db'));

try {
  // 컬럼 추가 (이미 존재하면 무시)
  const columns = [
    'total_allocated',
    'total_remaining',
    'total_claimed',
    'part1_claimed',
    'part1_remaining',
    'part1_total',
    'part2_earned',
    'part2_remaining',
    'part2_total'
  ];
  
  for (const col of columns) {
    try {
      db.exec(`ALTER TABLE node_info ADD COLUMN ${col} TEXT;`);
      console.log(`컬럼 ${col} 추가 성공`);
    } catch (e) {
      if (e.message.includes('duplicate column')) {
        console.log(`컬럼 ${col}는 이미 존재합니다.`);
      } else {
        console.error(`컬럼 ${col} 추가 실패:`, e.message);
      }
    }
  }
  
  console.log('DB 스키마 업데이트 완료');
} catch (e) {
  console.error('오류:', e.message);
} finally {
  db.close();
}










