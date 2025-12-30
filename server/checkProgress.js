// 진행 상태 확인 스크립트
import { readFileSync } from 'fs';
import { getGlobalClaimDataStats } from './db.js';

try {
  // 진행 상태 파일 읽기
  const progress = JSON.parse(readFileSync('./buildClaimData_progress.json', 'utf-8'));
  
  console.log('\n=== ClaimData 구축 진행 상태 ===');
  console.log(`상태: ${progress.status}`);
  console.log(`현재 토큰 ID: ${progress.currentTokenId}`);
  console.log(`타임스탬프: ${new Date(progress.timestamp).toLocaleString()}`);
  
  if (progress.stats) {
    console.log('\n[통계]');
    console.log(`  - 성공: ${progress.stats.successCount || 0}개`);
    console.log(`  - 실패: ${progress.stats.failCount || 0}개`);
    console.log(`  - 스킵: ${progress.stats.skipCount || 0}개`);
    
    if (progress.stats.maxTokenId) {
      const progressPercent = progress.stats.progressPercent || 
        ((progress.currentTokenId / progress.stats.maxTokenId) * 100).toFixed(1);
      console.log(`  - 진행률: ${progressPercent}%`);
    }
    
    if (progress.stats.elapsed) {
      console.log(`  - 경과 시간: ${progress.stats.elapsed}초`);
    }
    
    if (progress.stats.rate) {
      console.log(`  - 속도: ${progress.stats.rate}개/분`);
    }
  }
  
  // DB 통계
  const dbStats = getGlobalClaimDataStats();
  console.log('\n[DB 통계]');
  console.log(`  - 총 저장된 토큰: ${dbStats.total_count}개`);
  if (dbStats.min_token_id) {
    console.log(`  - 최소 토큰 ID: ${dbStats.min_token_id}`);
  }
  if (dbStats.max_token_id) {
    console.log(`  - 최대 토큰 ID: ${dbStats.max_token_id}`);
  }
  if (dbStats.last_updated_at) {
    console.log(`  - 마지막 업데이트: ${new Date(dbStats.last_updated_at).toLocaleString()}`);
  }
  
  console.log('\n');
} catch (error) {
  if (error.code === 'ENOENT') {
    console.log('진행 상태 파일이 없습니다. 아직 구축이 시작되지 않았거나 완료되었습니다.');
    
    // DB 통계만 표시
    try {
      const dbStats = getGlobalClaimDataStats();
      console.log('\n[DB 통계]');
      console.log(`  - 총 저장된 토큰: ${dbStats.total_count}개`);
      if (dbStats.min_token_id) {
        console.log(`  - 최소 토큰 ID: ${dbStats.min_token_id}`);
      }
      if (dbStats.max_token_id) {
        console.log(`  - 최대 토큰 ID: ${dbStats.max_token_id}`);
      }
    } catch (e) {
      console.error('DB 통계 조회 실패:', e.message);
    }
  } else {
    console.error('진행 상태 확인 실패:', error.message);
  }
}


