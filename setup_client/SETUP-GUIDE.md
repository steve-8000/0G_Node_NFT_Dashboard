# Kubernetes OIDC 로그인 및 k9s 설치 가이드

## 개요

이 가이드는 Kubernetes 클러스터에 Dex OIDC를 통해 로그인하고, k9s를 설치하여 클러스터를 관리하는 방법을 설명합니다.

## 전제 조건

- macOS (이 가이드는 macOS 기준)
- 인터넷 연결
- Kubernetes 클러스터 접근 권한
- Dex OIDC 서버 설정 완료 (서버 측)

## 빠른 시작

### 자동 설치 (권장)

```bash
bash INSTALL-AND-SETUP.sh
```

이 스크립트는 다음을 자동으로 수행합니다:
1. kubectl 설치 확인
2. krew 설치
3. oidc-login 플러그인 설치
4. kubeconfig OIDC 설정
5. 로그인 테스트
6. k9s 설치

### 수동 설치

자동 설치 스크립트를 사용하지 않는 경우, 아래 단계를 따르세요.

## 상세 설치 단계

### 1. kubectl 설치

```bash
# Homebrew 사용 (권장)
brew install kubectl

# 또는 직접 다운로드
# https://kubernetes.io/docs/tasks/tools/
```

설치 확인:
```bash
kubectl version --client
```

### 2. krew 설치

krew는 kubectl 플러그인 관리자입니다.

```bash
(
  set -e
  cd "$(mktemp -d)"
  OS="$(uname | tr '[:upper:]' '[:lower:]')"
  ARCH="$(uname -m | sed -e 's/x86_64/amd64/' -e 's/aarch64/arm64/')"
  curl -fsSLO "https://github.com/kubernetes-sigs/krew/releases/latest/download/krew-${OS}_${ARCH}.tar.gz"
  tar zxvf "krew-${OS}_${ARCH}.tar.gz"
  "./krew-${OS}_${ARCH}" install krew
)
```

PATH 설정 (zsh):
```bash
echo 'export PATH="${KREW_ROOT:-$HOME/.krew}/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

설치 확인:
```bash
kubectl krew version
```

### 3. oidc-login 플러그인 설치

```bash
export PATH="${KREW_ROOT:-$HOME/.krew}/bin:$PATH"
kubectl krew install oidc-login
```

설치 확인:
```bash
kubectl oidc-login --version
```

### 4. kubeconfig OIDC 설정

```bash
export PATH="${KREW_ROOT:-$HOME/.krew}/bin:$PATH"

# 현재 컨텍스트 확인
kubectl config current-context

# OIDC 사용자 설정
kubectl config set-credentials oidc-google \
  --exec-api-version=client.authentication.k8s.io/v1beta1 \
  --exec-command="$HOME/.krew/bin/kubectl-oidc_login" \
  --exec-arg=get-token \
  --exec-arg=--oidc-issuer-url="https://dex.zstake.xyz" \
  --exec-arg=--oidc-client-id="kubernetes" \
  --exec-arg=--oidc-client-secret="1f8bf5822301ecce04ffc40062aa32a64e81821ce532551a" \
  --exec-arg=--listen-address="127.0.0.1:8000" \
  --exec-arg=--oidc-extra-scope=email \
  --exec-arg=--oidc-extra-scope=profile \
  --exec-arg=--oidc-extra-scope=groups

# 컨텍스트에 사용자 연결
CONTEXT=$(kubectl config current-context)
kubectl config set-context "$CONTEXT" --user=oidc-google
```

### 5. 로그인

```bash
export PATH="${KREW_ROOT:-$HOME/.krew}/bin:$PATH"
export BROWSER=open

# 캐시 클린
kubectl oidc-login clean

# 로그인
kubectl oidc-login get-token \
  --oidc-issuer-url="https://dex.zstake.xyz" \
  --oidc-client-id="kubernetes" \
  --oidc-client-secret="1f8bf5822301ecce04ffc40062aa32a64e81821ce532551a" \
  --listen-address="127.0.0.1:8000" \
  --oidc-extra-scope=email \
  --oidc-extra-scope=profile \
  --oidc-extra-scope=groups
```

브라우저가 열리면 Google 로그인을 진행하세요.

### 6. 연결 테스트

```bash
kubectl get ns
kubectl get nodes
kubectl get pods -A
```

### 7. k9s 설치

#### 방법 1: Homebrew (권장)

```bash
brew install k9s
```

#### 방법 2: 직접 다운로드

```bash
# 아키텍처 확인
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ] || [ "$ARCH" = "aarch64" ]; then
  K9S_ARCH="arm64"
else
  K9S_ARCH="amd64"
fi

# 최신 버전 다운로드
LATEST_VERSION=$(curl -sS https://api.github.com/repos/derailed/k9s/releases/latest | \
  python3 -c "import sys, json; print(json.load(sys.stdin).get('tag_name', 'v0.50.16'))")

DOWNLOAD_URL="https://github.com/derailed/k9s/releases/download/${LATEST_VERSION}/k9s_Darwin_${K9S_ARCH}.tar.gz"

# 다운로드 및 설치
cd /tmp
curl -L -o k9s.tar.gz "$DOWNLOAD_URL"
tar -xzf k9s.tar.gz k9s
mkdir -p ~/.local/bin
mv k9s ~/.local/bin/k9s
chmod +x ~/.local/bin/k9s
rm -f k9s.tar.gz

# PATH 설정
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

## 사용 방법

### kubectl 명령

```bash
# 네임스페이스 조회
kubectl get ns

# Pod 조회
kubectl get pods -A

# 특정 네임스페이스의 Pod 조회
kubectl get pods -n default

# Pod 상세 정보
kubectl describe pod <pod-name> -n <namespace>

# Pod 로그
kubectl logs <pod-name> -n <namespace>
```

### k9s 사용

```bash
# 기본 실행
k9s

# 특정 네임스페이스로 시작
k9s -n default

# 도움말
k9s --help
```

#### k9s 주요 단축키

- `?` - 도움말
- `q` - 종료
- `0-9` - 리소스 전환 (0=Pods, 1=Deployments, 7=Namespaces, 8=Nodes)
- `d` - Describe (상세 정보)
- `e` - Edit (편집)
- `l` - Logs (로그 보기)
- `s` - Shell (Pod 내부 쉘)
- `y` - YAML 보기
- `/` - 검색/필터

## 문제 해결

### k9s 명령을 찾을 수 없는 경우

PATH에 `~/.local/bin`이 포함되어 있는지 확인:

```bash
echo $PATH | grep .local/bin
```

포함되어 있지 않다면:

```bash
export PATH="$HOME/.local/bin:$PATH"
source ~/.zshrc
```

### kubectl oidc-login 명령을 찾을 수 없는 경우

PATH에 krew가 포함되어 있는지 확인:

```bash
export PATH="${KREW_ROOT:-$HOME/.krew}/bin:$PATH"
source ~/.zshrc
```

### 로그인 실패 (401 에러)

1. **캐시 클린 및 재로그인:**
   ```bash
   kubectl oidc-login clean
   kubectl oidc-login get-token --oidc-issuer-url=... --oidc-client-id=...
   ```

2. **토큰 클레임 확인:**
   - Issuer URL이 서버 설정과 일치하는지 확인
   - Client ID가 서버 설정과 일치하는지 확인

3. **서버 측 확인:**
   - API 서버 OIDC 설정 확인
   - Dex 접근성 확인
   - API 서버 로그 확인

### 토큰 만료

토큰은 24시간 동안 유효합니다. 만료 시:

```bash
kubectl oidc-login clean
kubectl oidc-login get-token --oidc-issuer-url=... --oidc-client-id=...
```

또는 `kubectl get ns` 실행 시 자동으로 재로그인됩니다.

## 주요 오류 및 해결 방법

### 오류: "command not found: kubectl oidc-login"

**원인:** krew PATH가 설정되지 않음

**해결:**
```bash
export PATH="${KREW_ROOT:-$HOME/.krew}/bin:$PATH"
echo 'export PATH="${KREW_ROOT:-$HOME/.krew}/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### 오류: "401 Unauthorized"

**원인:** 서버 측 OIDC 설정 문제 또는 토큰 검증 실패

**해결:**
1. 캐시 클린 및 재로그인
2. 서버 측 API 서버 로그 확인
3. 서버 측 OIDC 설정 확인 (issuer, client-id)

### 오류: "k9s: command not found"

**원인:** `~/.local/bin`이 PATH에 없음

**해결:**
```bash
export PATH="$HOME/.local/bin:$PATH"
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

## 설정 정보

- **OIDC Issuer URL**: https://dex.zstake.xyz
- **Client ID**: kubernetes
- **Username Claim**: email
- **토큰 만료 시간**: 24시간

## 참고 자료

- kubectl: https://kubernetes.io/docs/reference/kubectl/
- krew: https://krew.sigs.k8s.io/
- oidc-login: https://github.com/int128/kubelogin
- k9s: https://k9scli.io/

## 결론

이 가이드를 따라하면 Kubernetes 클러스터에 Dex OIDC를 통해 로그인하고, k9s를 사용하여 클러스터를 관리할 수 있습니다.

자동 설치 스크립트(`INSTALL-AND-SETUP.sh`)를 사용하면 모든 과정이 자동화됩니다.
