// 누락된 토큰 수집 진행 상태 확인 스크립트
import { readFileSync } from 'fs';
import { getGlobalClaimDataStats } from './db.js';

try {
  const progress = JSON.parse(readFileSync('./fillMissingTokens_progress.json', 'utf8'));
  const stats = getGlobalClaimDataStats();
  
  console.log('\n=== 누락된 토큰 수집 진행 상태 ===');
  console.log(`상태: ${progress.status}`);
  console.log(`현재 토큰 ID: ${progress.currentTokenId}`);
  console.log(`타임스탬프: ${new Date(progress.timestamp).toLocaleString()}`);
  
  if (progress.stats) {
    console.log('\n[통계]');
    if (progress.stats.totalMissing !== undefined) {
      console.log(`  - 누락된 토큰: ${progress.stats.totalMissing}개`);
      console.log(`  - 처리 완료: ${progress.stats.processed || 0}개`);
      if (progress.stats.progressPercent) {
        console.log(`  - 진행률: ${progress.stats.progressPercent}%`);
      }
    }
    console.log(`  - 성공: ${progress.stats.successCount || 0}개`);
    console.log(`  - 실패: ${progress.stats.failCount || 0}개`);
    console.log(`  - 스킵: ${progress.stats.skipCount || 0}개`);
    if (progress.stats.elapsed) {
      console.log(`  - 경과 시간: ${progress.stats.elapsed}초`);
    }
    if (progress.stats.rate) {
      console.log(`  - 속도: ${progress.stats.rate}개/분`);
    }
  }
  
  console.log('\n[DB 통계]');
  console.log(`  - 총 저장된 토큰: ${stats.total_count}개`);
  console.log(`  - 최소 토큰 ID: ${stats.min_token_id || 'N/A'}`);
  console.log(`  - 최대 토큰 ID: ${stats.max_token_id || 'N/A'}`);
  if (stats.last_updated_at) {
    console.log(`  - 마지막 업데이트: ${new Date(stats.last_updated_at).toLocaleString()}`);
  }
  
  console.log('');
} catch (error) {
  if (error.code === 'ENOENT') {
    console.log('진행 상태 파일이 없습니다. 스크립트가 아직 실행되지 않았거나 진행 상태가 저장되지 않았습니다.');
  } else {
    console.error('진행 상태 확인 중 오류:', error.message);
  }
  process.exit(1);
}


