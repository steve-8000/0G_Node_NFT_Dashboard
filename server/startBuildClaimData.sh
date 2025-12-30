#!/bin/bash

# ClaimData DB 구축 스크립트를 백그라운드로 실행

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

MAX_TOKEN_ID=${1:-126100}

echo "=== ClaimData DB 구축 시작 ==="
echo "최대 토큰 ID: $MAX_TOKEN_ID"
echo "백그라운드로 실행합니다..."
echo ""

# 기존 프로세스 확인 및 종료 (선택적)
# pkill -f "node buildClaimData.js" 2>/dev/null

# 백그라운드 실행
nohup node buildClaimData.js $MAX_TOKEN_ID > buildClaimData.log 2>&1 &

PID=$!
echo "프로세스 ID: $PID"
echo "로그 파일: $SCRIPT_DIR/buildClaimData.log"
echo ""
echo "진행 상태 확인:"
echo "  tail -f $SCRIPT_DIR/buildClaimData.log"
echo "  또는"
echo "  node $SCRIPT_DIR/checkProgress.js"
echo ""
echo "프로세스 확인:"
echo "  ps aux | grep buildClaimData"
echo ""
echo "프로세스 종료:"
echo "  kill $PID"


