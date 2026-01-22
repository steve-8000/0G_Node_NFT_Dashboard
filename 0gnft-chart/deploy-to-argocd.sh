#!/bin/bash

# 0gnft 애플리케이션을 ArgoCD에 배포하는 스크립트
set -e

echo "=== 0gnft ArgoCD 배포 스크립트 ==="

# 1. Docker 이미지 빌드 (로컬에서)
echo "1. Docker 이미지 빌드 중..."
cd /root/0gnft

# 프론트엔드 이미지 빌드
echo "   - 프론트엔드 이미지 빌드..."
docker build -t 0gnft-frontend:latest -f Dockerfile .

# 백엔드 이미지 빌드
echo "   - 백엔드 이미지 빌드..."
docker build -t 0gnft-backend:latest -f server/Dockerfile ./server

# 2. 이미지를 클러스터에 로드 (또는 레지스트리에 푸시)
echo "2. 이미지를 클러스터에 로드 중..."
# kind 클러스터를 사용하는 경우
if command -v kind &> /dev/null; then
    kind load docker-image 0gnft-frontend:latest || echo "kind가 없거나 이미지 로드 실패"
    kind load docker-image 0gnft-backend:latest || echo "kind가 없거나 이미지 로드 실패"
fi

# 또는 Docker 레지스트리에 푸시하는 경우
# docker tag 0gnft-frontend:latest registry.example.com/0gnft-frontend:latest
# docker push registry.example.com/0gnft-frontend:latest
# docker tag 0gnft-backend:latest registry.example.com/0gnft-backend:latest
# docker push registry.example.com/0gnft-backend:latest

# 3. PersistentVolumeClaim 생성 (이미 존재하면 스킵)
echo "3. PersistentVolumeClaim 확인 중..."
kubectl apply -f 0gnft-chart/k8s/deployment.yaml --dry-run=client -o yaml | grep -A 10 "kind: PersistentVolumeClaim" | kubectl apply -f - || echo "PVC는 deployment.yaml에 포함되어 있습니다"

# 4. ArgoCD Application 생성
echo "4. ArgoCD Application 생성 중..."
echo "   주의: Git 저장소 URL을 먼저 설정해야 합니다!"
echo "   파일: 0gnft-chart/k8s/argocd-application.yaml"
echo ""
echo "   Git 저장소를 사용하지 않는 경우, 다음 명령으로 직접 배포할 수 있습니다:"
echo "   kubectl apply -f 0gnft-chart/k8s/deployment.yaml"
echo "   kubectl apply -f 0gnft-chart/k8s/ingress.yaml"
echo ""

# Git 저장소가 설정되어 있는지 확인
if grep -q "your-username" 0gnft-chart/k8s/argocd-application.yaml; then
    echo "   ⚠️  Git 저장소 URL을 먼저 설정하세요!"
    echo "   또는 다음 명령으로 직접 배포:"
    echo "   kubectl apply -f 0gnft-chart/k8s/"
else
    kubectl apply -f 0gnft-chart/k8s/argocd-application.yaml
    echo "   ✅ ArgoCD Application이 생성되었습니다!"
fi

echo ""
echo "=== 배포 완료 ==="
echo ""
echo "상태 확인:"
echo "  kubectl get application -n argocd 0gnft-app"
echo "  kubectl get pods -n default | grep 0gnft"
echo "  kubectl get svc -n default | grep 0gnft"
echo "  kubectl get ingress -n default 0gainode-ingress"
echo ""
echo "ArgoCD UI에서 확인:"
echo "  https://argocd.zstake.xyz (또는 클러스터의 ArgoCD URL)"
