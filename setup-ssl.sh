#!/bin/bash

# SSL 인증서 설정 스크립트
# 사용법: sudo ./setup-ssl.sh

set -e

DOMAIN="0gwallet.zstake.xyz"
EMAIL="admin@zstake.xyz"  # Let's Encrypt 알림을 받을 이메일 주소로 변경하세요
WEBROOT="/var/www/certbot"

echo "=== 0G Wallet SSL 인증서 설정 ==="

# certbot 설치 확인
if ! command -v certbot &> /dev/null; then
    echo "certbot이 설치되어 있지 않습니다. 설치 중..."
    apt-get update
    apt-get install -y certbot python3-certbot-nginx
fi

# 웹루트 디렉토리 생성
mkdir -p $WEBROOT

# nginx 설치 확인
if ! command -v nginx &> /dev/null; then
    echo "nginx가 설치되어 있지 않습니다. 설치 중..."
    apt-get update
    apt-get install -y nginx
fi

# nginx 설정 파일 복사
echo "nginx 설정 파일 복사 중..."
cp nginx.conf /etc/nginx/sites-available/0gwallet
ln -sf /etc/nginx/sites-available/0gwallet /etc/nginx/sites-enabled/

# 기본 nginx 설정 비활성화 (선택사항)
if [ -f /etc/nginx/sites-enabled/default ]; then
    rm /etc/nginx/sites-enabled/default
fi

# nginx 테스트 및 재시작
echo "nginx 설정 테스트 중..."
nginx -t

echo "nginx 재시작 중..."
systemctl restart nginx

# SSL 인증서 발급
echo "SSL 인증서 발급 중..."
certbot certonly \
    --webroot \
    --webroot-path=$WEBROOT \
    --email $EMAIL \
    --agree-tos \
    --no-eff-email \
    -d $DOMAIN

# nginx 설정 업데이트 (SSL 인증서 경로 확인)
if [ -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem ]; then
    echo "SSL 인증서가 성공적으로 발급되었습니다."
    
    # nginx 재시작
    systemctl restart nginx
    
    # 자동 갱신 설정
    echo "SSL 인증서 자동 갱신 설정 중..."
    (crontab -l 2>/dev/null; echo "0 0 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") | crontab -
    
    echo "=== SSL 인증서 설정 완료 ==="
    echo "도메인: $DOMAIN"
    echo "인증서 경로: /etc/letsencrypt/live/$DOMAIN/"
    echo ""
    echo "다음 단계:"
    echo "1. 빌드된 파일을 /var/www/0gnft/dist/ 에 배포하세요"
    echo "2. npm run build 명령으로 빌드하세요"
    echo "3. 빌드된 파일을 서버에 업로드하세요"
else
    echo "SSL 인증서 발급에 실패했습니다."
    exit 1
fi











