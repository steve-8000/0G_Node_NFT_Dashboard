#!/bin/bash

# 배포 스크립트
# 사용법: ./deploy.sh

set -e

echo "=== 0G NFT Wallet 빌드 및 배포 ==="

# 프로젝트 빌드
echo "프로젝트 빌드 중..."
npm install
npm run build

# 빌드 결과 확인
if [ ! -d "dist" ]; then
    echo "빌드 실패: dist 디렉토리가 생성되지 않았습니다."
    exit 1
fi

echo "빌드 완료!"

# 배포 디렉토리 생성
DEPLOY_DIR="/var/www/0gnft"
echo "배포 디렉토리 생성: $DEPLOY_DIR"
sudo mkdir -p $DEPLOY_DIR

# 빌드된 파일 복사
echo "빌드된 파일 복사 중..."
sudo cp -r dist/* $DEPLOY_DIR/

# 권한 설정
echo "권한 설정 중..."
sudo chown -R www-data:www-data $DEPLOY_DIR
sudo chmod -R 755 $DEPLOY_DIR

# nginx 재시작
echo "nginx 재시작 중..."
sudo systemctl reload nginx

echo "=== 배포 완료 ==="
echo "사이트가 https://0gwallet.zstake.xyz 에서 실행 중입니다."











