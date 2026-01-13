#!/bin/bash
set -e

echo "=== 직접 Kubernetes 리소스 배포 ==="

# SSL Secret 생성
echo "1. SSL 인증서 Secret 생성..."
kubectl create secret tls 0gainode-tls \
  --cert=/etc/letsencrypt/live/0gainode.zstake.xyz/fullchain.pem \
  --key=/etc/letsencrypt/live/0gainode.zstake.xyz/privkey.pem \
  --dry-run=client -o yaml | kubectl apply -f - 2>&1 || {
    echo "⚠️  Secret 생성 실패 (이미 존재하거나 kubectl 인증 문제)"
}

# Deployment 및 Service 배포
echo "2. Deployment 및 Service 배포..."
kubectl apply -f /root/0gnft/k8s/deployment.yaml 2>&1 || {
    echo "⚠️  배포 실패 (kubectl 인증 문제)"
    exit 1
}

# Ingress 배포
echo "3. Ingress 배포..."
kubectl apply -f /root/0gnft/k8s/ingress.yaml 2>&1 || {
    echo "⚠️  Ingress 배포 실패"
    exit 1
}

echo ""
echo "✅ 배포 완료!"
echo ""
echo "상태 확인:"
kubectl get pods -n default | grep 0gnft
kubectl get svc -n default | grep 0gnft
kubectl get ingress -n default | grep 0gainode
