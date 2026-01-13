#!/bin/bash
set -e

echo "=== ArgoCD Application 생성 ==="

# ArgoCD CLI가 설치되어 있는지 확인
if ! command -v argocd &> /dev/null; then
    echo "ArgoCD CLI를 설치합니다..."
    cd /tmp
    curl -sSL -o argocd-linux-amd64 https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64
    chmod +x argocd-linux-amd64
    sudo mv argocd-linux-amd64 /usr/local/bin/argocd
fi

ARGOCD_SERVER="argocd.zstake.xyz"
echo "ArgoCD 서버: $ARGOCD_SERVER"

# ArgoCD 로그인 시도 (비밀번호는 수동 입력 필요)
echo ""
echo "ArgoCD에 로그인합니다..."
echo "비밀번호를 입력하세요 (기본: admin 또는 kubectl로 확인 가능)"
argocd login $ARGOCD_SERVER --insecure || {
    echo "로그인 실패. 다음 명령으로 수동 로그인하세요:"
    echo "  argocd login $ARGOCD_SERVER --insecure"
    exit 1
}

# Application 생성
echo ""
echo "Application을 생성합니다..."
argocd app create 0gainode \
  --repo https://github.com/your-org/0gnft \
  --path k8s \
  --dest-server https://kubernetes.default.svc \
  --dest-namespace default \
  --sync-policy automated \
  --self-heal \
  --upsert || {
    echo ""
    echo "Git 저장소가 없는 경우, 로컬 파일을 사용하려면:"
    echo "1. ArgoCD UI에서 수동으로 Application 생성"
    echo "2. 또는 kubectl을 사용: kubectl apply -f /root/0gnft/argocd-application-direct.yaml"
    exit 1
}

echo ""
echo "Application이 생성되었습니다!"
echo "상태 확인: argocd app get 0gainode"
echo "동기화: argocd app sync 0gainode"
