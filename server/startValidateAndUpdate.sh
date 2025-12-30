#!/bin/bash
# DB 검증 및 업데이트 스크립트를 백그라운드로 실행

cd /root/0gnft/server

echo "DB 검증 및 업데이트를 백그라운드로 시작합니다..."
echo "로그 파일: validateAndUpdateDB.log"
echo "진행 상황 파일: validateAndUpdateDB_progress.json"
echo ""
echo "진행 상황 확인:"
echo "  cat validateAndUpdateDB_progress.json"
echo ""
echo "로그 확인:"
echo "  tail -f validateAndUpdateDB.log"
echo ""

nohup node validateAndUpdateDB.js > validateAndUpdateDB.log 2>&1 &

echo "프로세스 ID: $!"
echo "백그라운드 실행 중..."


