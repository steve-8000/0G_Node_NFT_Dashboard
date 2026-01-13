#!/bin/bash
# Kubernetes OIDC 로그인 및 k9s 설치 통합 스크립트
# 설치부터 접속까지 자동화

set -e

echo "🚀 Kubernetes OIDC 로그인 및 k9s 설치 스크립트"
echo "=========================================="
echo ""

# 색상 정의
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 변수 설정
KREW_ROOT="${KREW_ROOT:-$HOME/.krew}"
K9S_INSTALL_DIR="$HOME/.local/bin"

# ============================================
# 1단계: kubectl 설치 확인
# ============================================

echo "1️⃣ kubectl 설치 확인..."
if command -v kubectl >/dev/null 2>&1; then
    KUBECTL_VERSION=$(kubectl version --client --short 2>&1 | head -1)
    echo -e "${GREEN}✅ kubectl 설치됨: $KUBECTL_VERSION${NC}"
else
    echo -e "${RED}❌ kubectl이 설치되어 있지 않습니다.${NC}"
    echo "다음 명령으로 설치하세요:"
    echo "  brew install kubectl"
    echo "  또는 https://kubernetes.io/docs/tasks/tools/"
    exit 1
fi

# ============================================
# 2단계: krew 설치
# ============================================

echo ""
echo "2️⃣ krew 설치 확인..."
if [ -f "$KREW_ROOT/bin/kubectl-krew" ]; then
    echo -e "${GREEN}✅ krew 설치됨${NC}"
else
    echo -e "${YELLOW}⚠️  krew 미설치 - 설치 중...${NC}"
    (
        set -e
        cd "$(mktemp -d)"
        OS="$(uname | tr '[:upper:]' '[:lower:]')"
        ARCH="$(uname -m | sed -e 's/x86_64/amd64/' -e 's/aarch64/arm64/')"
        curl -fsSLO "https://github.com/kubernetes-sigs/krew/releases/latest/download/krew-${OS}_${ARCH}.tar.gz"
        tar zxvf "krew-${OS}_${ARCH}.tar.gz"
        "./krew-${OS}_${ARCH}" install krew
    )
    
    # PATH에 추가
    export PATH="$KREW_ROOT/bin:$PATH"
    
    # 영구 설정
    if ! echo "$PATH" | grep -q krew; then
        if [ -f "$HOME/.zshrc" ]; then
            echo 'export PATH="${KREW_ROOT:-$HOME/.krew}/bin:$PATH"' >> "$HOME/.zshrc"
        elif [ -f "$HOME/.bashrc" ]; then
            echo 'export PATH="${KREW_ROOT:-$HOME/.krew}/bin:$PATH"' >> "$HOME/.bashrc"
        fi
    fi
    
    echo -e "${GREEN}✅ krew 설치 완료${NC}"
fi

# PATH에 krew 추가 (현재 세션)
export PATH="${KREW_ROOT:-$HOME/.krew}/bin:$PATH"

# ============================================
# 3단계: oidc-login 플러그인 설치
# ============================================

echo ""
echo "3️⃣ oidc-login 플러그인 설치 확인..."
if kubectl oidc-login --version >/dev/null 2>&1; then
    OIDC_VERSION=$(kubectl oidc-login --version 2>&1 | head -1)
    echo -e "${GREEN}✅ oidc-login 설치됨: $OIDC_VERSION${NC}"
else
    echo -e "${YELLOW}⚠️  oidc-login 미설치 - 설치 중...${NC}"
    kubectl krew install oidc-login
    echo -e "${GREEN}✅ oidc-login 설치 완료${NC}"
fi

# ============================================
# 4단계: kubeconfig OIDC 설정
# ============================================

echo ""
echo "4️⃣ kubeconfig OIDC 설정..."

# OIDC 설정
OIDC_ISSUER_URL="https://dex.zstake.xyz"
OIDC_CLIENT_ID="kubernetes"
OIDC_CLIENT_SECRET="1f8bf5822301ecce04ffc40062aa32a64e81821ce532551a"

# 현재 컨텍스트 확인
CURRENT_CONTEXT=$(kubectl config current-context 2>/dev/null || echo "")
if [ -z "$CURRENT_CONTEXT" ]; then
    echo -e "${YELLOW}⚠️  현재 컨텍스트가 없습니다.${NC}"
    echo "먼저 kubeconfig를 설정하세요."
    exit 1
fi

echo "현재 컨텍스트: $CURRENT_CONTEXT"

# OIDC 사용자 설정
kubectl config set-credentials oidc-google \
    --exec-api-version=client.authentication.k8s.io/v1beta1 \
    --exec-command="$KREW_ROOT/bin/kubectl-oidc_login" \
    --exec-arg=get-token \
    --exec-arg=--oidc-issuer-url="$OIDC_ISSUER_URL" \
    --exec-arg=--oidc-client-id="$OIDC_CLIENT_ID" \
    --exec-arg=--oidc-client-secret="$OIDC_CLIENT_SECRET" \
    --exec-arg=--listen-address="127.0.0.1:8000" \
    --exec-arg=--oidc-extra-scope=email \
    --exec-arg=--oidc-extra-scope=profile \
    --exec-arg=--oidc-extra-scope=groups

# 컨텍스트에 사용자 연결
kubectl config set-context "$CURRENT_CONTEXT" --user=oidc-google

echo -e "${GREEN}✅ kubeconfig OIDC 설정 완료${NC}"

# ============================================
# 5단계: 로그인 테스트
# ============================================

echo ""
echo "5️⃣ OIDC 로그인 테스트..."
echo "   브라우저가 열리면 Google 로그인을 진행하세요."
echo ""

# 기존 캐시 삭제
kubectl oidc-login clean 2>/dev/null || rm -rf ~/.kube/cache/oidc-login ~/.kube/cache/exec 2>/dev/null

# 새 토큰 발급
export BROWSER=open
if kubectl oidc-login get-token \
    --oidc-issuer-url="$OIDC_ISSUER_URL" \
    --oidc-client-id="$OIDC_CLIENT_ID" \
    --oidc-client-secret="$OIDC_CLIENT_SECRET" \
    --listen-address="127.0.0.1:8000" \
    --oidc-extra-scope=email \
    --oidc-extra-scope=profile \
    --oidc-extra-scope=groups >/dev/null 2>&1; then
    echo -e "${GREEN}✅ 로그인 성공${NC}"
else
    echo -e "${RED}❌ 로그인 실패${NC}"
    echo "수동으로 로그인을 시도하세요:"
    echo "  kubectl oidc-login get-token --oidc-issuer-url=$OIDC_ISSUER_URL --oidc-client-id=$OIDC_CLIENT_ID"
    exit 1
fi

# ============================================
# 6단계: kubectl 연결 테스트
# ============================================

echo ""
echo "6️⃣ kubectl 연결 테스트..."
if kubectl get ns >/dev/null 2>&1; then
    echo -e "${GREEN}✅ kubectl 연결 성공${NC}"
    echo ""
    echo "네임스페이스 목록:"
    kubectl get ns --no-headers | awk '{print "  - " $1}'
else
    echo -e "${RED}❌ kubectl 연결 실패${NC}"
    echo "서버 측 설정을 확인하세요."
    exit 1
fi

# ============================================
# 7단계: k9s 설치
# ============================================

echo ""
echo "7️⃣ k9s 설치 확인..."

# k9s 설치 디렉토리 생성
mkdir -p "$K9S_INSTALL_DIR"

if command -v k9s >/dev/null 2>&1 || [ -f "$K9S_INSTALL_DIR/k9s" ]; then
    if [ -f "$K9S_INSTALL_DIR/k9s" ]; then
        K9S_VERSION=$("$K9S_INSTALL_DIR/k9s" version 2>&1 | grep "Version:" | awk '{print $2}')
        echo -e "${GREEN}✅ k9s 설치됨: $K9S_VERSION${NC}"
    else
        K9S_VERSION=$(k9s version 2>&1 | grep "Version:" | awk '{print $2}')
        echo -e "${GREEN}✅ k9s 설치됨: $K9S_VERSION${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  k9s 미설치 - 설치 중...${NC}"
    
    # 시스템 아키텍처 확인
    ARCH=$(uname -m)
    if [ "$ARCH" = "arm64" ] || [ "$ARCH" = "aarch64" ]; then
        K9S_ARCH="arm64"
    else
        K9S_ARCH="amd64"
    fi
    
    # 최신 버전 확인 및 다운로드
    LATEST_VERSION=$(curl -sS https://api.github.com/repos/derailed/k9s/releases/latest | \
        python3 -c "import sys, json; print(json.load(sys.stdin).get('tag_name', 'v0.50.16'))" 2>/dev/null || echo "v0.50.16")
    
    DOWNLOAD_URL="https://github.com/derailed/k9s/releases/download/${LATEST_VERSION}/k9s_Darwin_${K9S_ARCH}.tar.gz"
    
    echo "다운로드 중: $LATEST_VERSION"
    cd /tmp
    curl -L -o k9s.tar.gz "$DOWNLOAD_URL"
    tar -xzf k9s.tar.gz k9s
    mv k9s "$K9S_INSTALL_DIR/k9s"
    chmod +x "$K9S_INSTALL_DIR/k9s"
    rm -f k9s.tar.gz
    
    # PATH에 추가 (영구 설정)
    if ! echo "$PATH" | grep -q ".local/bin"; then
        if [ -f "$HOME/.zshrc" ]; then
            echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.zshrc"
        elif [ -f "$HOME/.bashrc" ]; then
            echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc"
        fi
    fi
    
    # 현재 세션에 추가
    export PATH="$HOME/.local/bin:$PATH"
    
    echo -e "${GREEN}✅ k9s 설치 완료${NC}"
fi

# PATH에 k9s 추가 (현재 세션)
export PATH="$HOME/.local/bin:$PATH"

# ============================================
# 완료
# ============================================

echo ""
echo "=========================================="
echo -e "${GREEN}✅ 설치 및 설정 완료!${NC}"
echo "=========================================="
echo ""
echo "설치된 도구:"
echo "  ✅ kubectl"
echo "  ✅ krew"
echo "  ✅ oidc-login 플러그인"
echo "  ✅ kubeconfig OIDC 설정"
echo "  ✅ k9s"
echo ""
echo "사용 방법:"
echo "  kubectl get ns          # 네임스페이스 조회"
echo "  kubectl get pods -A     # 모든 Pod 조회"
echo "  k9s                     # k9s 실행"
echo ""
echo "참고:"
echo "  - 새 터미널에서는 PATH가 자동으로 설정됩니다"
echo "  - PATH 설정이 적용되지 않으면: source ~/.zshrc"
echo "  - 토큰 만료 시: kubectl oidc-login clean 후 재로그인"
echo ""
