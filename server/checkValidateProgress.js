// 검증 및 업데이트 진행 상황 확인 스크립트
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const progressPath = join(__dirname, 'validateAndUpdateDB_progress.json');

try {
  const progress = JSON.parse(readFileSync(progressPath, 'utf-8'));
  
  console.log('\n=== DB 검증 및 업데이트 진행 상황 ===\n');
  console.log(`현재 토큰 ID: ${progress.currentTokenId}`);
  console.log(`상태: ${progress.status}`);
  console.log(`\n통계:`);
  console.log(`  - 총 검증: ${progress.stats?.total || 0}개`);
  console.log(`  - 유효 데이터: ${progress.stats?.valid || 0}개`);
  console.log(`  - 무효 데이터: ${progress.stats?.invalid || 0}개`);
  console.log(`  - 누락 데이터: ${progress.stats?.missing || 0}개`);
  console.log(`  - 업데이트 성공: ${progress.stats?.updated || 0}개`);
  console.log(`  - 업데이트 실패: ${progress.stats?.failed || 0}개`);
  
  if (progress.timestamp) {
    const elapsed = ((Date.now() - progress.timestamp) / 1000).toFixed(0);
    console.log(`\n경과 시간: ${elapsed}초`);
  }
  
  if (progress.stats?.error) {
    console.log(`\n오류: ${progress.stats.error}`);
  }
  
  console.log('');
} catch (error) {
  if (error.code === 'ENOENT') {
    console.log('진행 상황 파일이 없습니다. 스크립트가 아직 시작되지 않았거나 완료되었을 수 있습니다.');
  } else {
    console.error('진행 상황 파일 읽기 오류:', error.message);
  }
}


