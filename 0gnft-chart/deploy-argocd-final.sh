#!/bin/bash
set -e

echo "=== ArgoCD를 통한 0gainode 배포 ==="
echo ""

ARGOCD_SERVER="argocd.zstake.xyz"
APP_NAME="0gainode"

# ArgoCD CLI 확인
if ! command -v argocd &> /dev/null; then
    echo "ArgoCD CLI 설치 중..."
    cd /tmp
    curl -sSL -o argocd-linux-amd64 https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64
    chmod +x argocd-linux-amd64
    sudo mv argocd-linux-amd64 /usr/local/bin/argocd
fi

echo "ArgoCD 서버: $ARGOCD_SERVER"
echo ""

# ArgoCD 로그인 (비밀번호는 환경변수 또는 수동 입력)
if [ -n "$ARGOCD_PASSWORD" ]; then
    echo "환경변수에서 비밀번호 사용"
    echo "$ARGOCD_PASSWORD" | argocd login $ARGOCD_SERVER --insecure --username admin --password-stdin
else
    echo "ArgoCD에 로그인합니다..."
    echo "비밀번호를 입력하세요 (기본: admin 또는 kubectl로 확인 가능)"
    argocd login $ARGOCD_SERVER --insecure --username admin
fi

# Application 생성 또는 업데이트
echo ""
echo "Application 생성/업데이트 중..."
argocd app create $APP_NAME \
  --repo https://github.com/your-org/0gnft \
  --path k8s \
  --dest-server https://kubernetes.default.svc \
  --dest-namespace default \
  --sync-policy automated \
  --self-heal \
  --upsert 2>&1 || {
    echo ""
    echo "Git 저장소가 없는 경우, 로컬 파일을 사용하려면:"
    echo "ArgoCD UI에서 수동으로 Application을 생성하세요"
    echo ""
    echo "또는 kubectl을 사용:"
    echo "  kubectl apply -f /root/0gnft/argocd-application-direct.yaml"
    exit 1
}

echo ""
echo "✅ Application 생성 완료!"
echo ""
echo "상태 확인:"
argocd app get $APP_NAME
echo ""
echo "동기화:"
argocd app sync $APP_NAME
