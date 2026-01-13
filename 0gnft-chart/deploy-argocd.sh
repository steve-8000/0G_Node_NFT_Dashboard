#!/bin/bash
set -e

echo "=== ArgoCD를 통한 0gainode 배포 ==="

# SSL 인증서 Secret 생성 (이미 존재하면 스킵)
echo "1. SSL 인증서 Secret 생성 중..."
kubectl create secret tls 0gainode-tls \
  --cert=/etc/letsencrypt/live/0gainode.zstake.xyz/fullchain.pem \
  --key=/etc/letsencrypt/live/0gainode.zstake.xyz/privkey.pem \
  --dry-run=client -o yaml | kubectl apply -f - || echo "Secret이 이미 존재하거나 생성 실패 (무시)"

# k8s 매니페스트 파일 배포
echo "2. Kubernetes 리소스 배포 중..."
kubectl apply -f /root/0gnft/k8s/deployment.yaml
kubectl apply -f /root/0gnft/k8s/ingress.yaml

# ArgoCD Application 생성
echo "3. ArgoCD Application 생성 중..."
kubectl apply -f /root/0gnft/argocd-application-direct.yaml || {
  echo "ArgoCD Application 생성 실패, 직접 배포로 진행..."
  echo "ArgoCD UI에서 수동으로 Application을 생성하거나 다음 명령을 사용하세요:"
  echo "kubectl apply -f /root/0gnft/argocd-application-direct.yaml"
}

echo ""
echo "=== 배포 완료 ==="
echo "상태 확인:"
echo "  kubectl get pods -n default | grep 0gnft"
echo "  kubectl get svc -n default | grep 0gnft"
echo "  kubectl get ingress -n default | grep 0gainode"
echo ""
echo "ArgoCD UI에서 확인:"
echo "  https://argocd.zstake.xyz"
