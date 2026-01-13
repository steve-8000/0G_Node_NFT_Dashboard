# 클라이언트 Dex 로그인 가이드

이 가이드는 클라이언트 컴퓨터(Mac, Linux 등)에서 Kubernetes 클러스터에 Dex OIDC를 통해 로그인하는 방법을 설명합니다.

## 📋 사전 요구사항

1. **kubectl** 설치되어 있어야 합니다
2. **인터넷 연결**이 필요합니다 (Dex 서버 접근용)
3. **브라우저**가 설치되어 있어야 합니다 (Google 로그인용)

## 🚀 빠른 시작

### 방법 1: 자동 설정 스크립트 사용 (권장)

클라이언트 컴퓨터에서 다음 명령을 실행하세요:

```bash
# 서버에서 클라이언트로 스크립트 복사 후 실행
# 또는 스크립트를 클라이언트로 다운로드

# 환경 변수 설정 (필요시 수정)
export CLUSTER_SERVER="https://219.255.103.189:6443"
export DEX_HOST="dex.zstake.xyz"
export KUBERNETES_CLIENT_SECRET="1f8bf5822301ecce04ffc40062aa32a64e81821ce532551a"

# 스크립트 실행
bash setup-client-dex-login.sh
```

### 방법 2: 수동 설정

#### 1단계: kubectl 설치 (미설치 시)

**Linux:**
```bash
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
```

**macOS:**
```bash
brew install kubectl
```

**Windows:**
```powershell
# Chocolatey 사용
choco install kubernetes-cli

# 또는 직접 다운로드
# https://kubernetes.io/docs/tasks/tools/install-kubectl-windows/
```

#### 2단계: krew 설치

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

# PATH에 krew 추가
export PATH="${KREW_ROOT:-$HOME/.krew}/bin:$PATH"

# 영구적으로 PATH에 추가 (선택사항)
# Bash 사용자
echo 'export PATH="${KREW_ROOT:-$HOME/.krew}/bin:$PATH"' >> ~/.bashrc

# Zsh 사용자
echo 'export PATH="${KREW_ROOT:-$HOME/.krew}/bin:$PATH"' >> ~/.zshrc

# 새 터미널을 열거나 설정 적용
source ~/.bashrc  # 또는 source ~/.zshrc
```

#### 3단계: oidc-login 플러그인 설치

```bash
# krew PATH 확인
export PATH="${KREW_ROOT:-$HOME/.krew}/bin:$PATH"

# oidc-login 설치
kubectl krew install oidc-login

# 설치 확인
kubectl krew list | grep oidc-login
```

#### 4단계: kubeconfig 설정

**환경 변수 설정:**

```bash
# 클러스터 정보
export CLUSTER_SERVER="https://219.255.103.189:6443"
export DEX_HOST="dex.zstake.xyz"
export KUBERNETES_CLIENT_SECRET="1f8bf5822301ecce04ffc40062aa32a64e81821ce532551a"
export LISTEN_PORT="8000"  # 기본값: 8000
```

**클러스터 설정:**

```bash
kubectl config set-cluster k8s-prod \
  --server="${CLUSTER_SERVER}" \
  --insecure-skip-tls-verify
```

**OIDC 사용자 설정:**

```bash
export PATH="${KREW_ROOT:-$HOME/.krew}/bin:$PATH"

kubectl config set-credentials oidc-google \
  --exec-api-version=client.authentication.k8s.io/v1beta1 \
  --exec-command=kubectl \
  --exec-arg=oidc-login \
  --exec-arg=get-token \
  --exec-arg=--oidc-issuer-url="https://${DEX_HOST}" \
  --exec-arg=--oidc-client-id="kubernetes" \
  --exec-arg=--oidc-client-secret="${KUBERNETES_CLIENT_SECRET}" \
  --exec-arg=--listen-address="127.0.0.1:${LISTEN_PORT}"
```

**컨텍스트 설정 및 활성화:**

```bash
kubectl config set-context k8s-prod \
  --cluster=k8s-prod \
  --user=oidc-google \
  --namespace=default

kubectl config use-context k8s-prod
```

## 🔐 로그인 방법

### 첫 번째 로그인

**중요:** exec-command가 interactive 모드를 제대로 지원하지 않는 경우, 먼저 수동으로 로그인해야 합니다.

#### 방법 1: 로그인 스크립트 사용 (권장)

```bash
# 로그인 스크립트 실행
bash login.sh
```

이 스크립트를 실행하면:
1. 브라우저가 자동으로 열립니다
2. Dex 로그인 페이지로 리다이렉트됩니다
3. **"Log in with Google"** 버튼을 클릭합니다
4. Google 계정으로 로그인합니다
5. 권한 승인 화면에서 **"Allow"**를 클릭합니다
6. 로그인이 완료되면 토큰이 캐시에 저장됩니다
7. 이후 `kubectl` 명령을 정상적으로 사용할 수 있습니다

#### 방법 2: 직접 oidc-login 실행

```bash
export PATH="${KREW_ROOT:-$HOME/.krew}/bin:$PATH"

kubectl oidc-login get-token \
  --oidc-issuer-url="https://dex.zstake.xyz" \
  --oidc-client-id="kubernetes" \
  --oidc-client-secret="1f8bf5822301ecce04ffc40062aa32a64e81821ce532551a" \
  --listen-address="127.0.0.1:8000"
```

#### 방법 3: kubectl 명령 직접 실행 (자동 로그인)

일부 환경에서는 `kubectl` 명령을 직접 실행해도 자동으로 로그인 프로세스가 시작됩니다:

```bash
kubectl get ns
```

**로그인 프로세스:**

1. `kubectl`이 `oidc-login` 플러그인을 실행합니다
2. 브라우저가 자동으로 열립니다 (또는 URL이 터미널에 표시됩니다)
3. Dex 로그인 페이지로 리다이렉트됩니다
4. **"Log in with Google"** 버튼을 클릭합니다
5. Google 계정으로 로그인합니다
6. 권한 승인 화면에서 **"Allow"**를 클릭합니다
7. 로그인이 완료되면 브라우저가 자동으로 닫히거나 성공 메시지를 표시합니다
8. `kubectl` 명령이 정상적으로 실행됩니다

**예상 출력:**
```
Opening browser for authentication at:
https://dex.zstake.xyz/auth?client_id=kubernetes&redirect_uri=http%3A%2F%2F127.0.0.1%3A8000%2Fcallback&response_type=code&scope=openid+profile+email+groups&state=...
```

### 이후 로그인

- **토큰이 유효한 경우**: 자동으로 재사용됩니다 (24시간 유효)
- **토큰이 만료된 경우**: 자동으로 새로 로그인합니다

### 토큰 확인

현재 저장된 토큰을 확인하려면:

```bash
# kubeconfig 파일에서 토큰 확인 (직접 확인 불가 - exec 방식이므로)

# 대신 연결 테스트로 확인
kubectl get ns  # 성공하면 토큰이 유효함
```

## ✅ 연결 테스트

다음 명령으로 연결을 테스트하세요:

```bash
# 1. 클러스터 정보 확인
kubectl cluster-info

# 2. 노드 목록 확인
kubectl get nodes

# 3. 네임스페이스 목록 확인
kubectl get ns

# 4. 현재 사용자 확인
kubectl config view --minify --output 'jsonpath={..user}'

# 5. 모든 리소스 확인 (권한이 있는 경우)
kubectl get all -A
```

## 🔧 문제 해결

### 문제 1: "kubectl: command not found"

**해결 방법:**
```bash
# kubectl 설치 확인
which kubectl

# 설치되지 않은 경우 위의 "kubectl 설치" 섹션 참조
```

### 문제 2: "kubectl: error: exec: "kubectl": executable file not found in $PATH"

**원인:** `oidc-login` 플러그인이 kubectl을 찾을 수 없습니다.

**해결 방법:**
```bash
# kubectl 경로 확인
which kubectl

# kubeconfig에서 exec-command를 절대 경로로 수정
kubectl config set-credentials oidc-google \
  --exec-command=/usr/local/bin/kubectl \  # 실제 kubectl 경로로 변경
  --exec-arg=oidc-login \
  --exec-arg=get-token \
  # ... 나머지 인자들
```

### 문제 3: "Unregistered redirect_uri"

**원인:** Dex 서버에서 클라이언트의 redirect_uri가 등록되지 않았습니다.

**해결 방법:**
- 서버 관리자에게 문의하여 Dex 설정에 해당 redirect_uri 추가 요청
- 또는 다른 포트 사용:
  ```bash
  export LISTEN_PORT="8001"
  # kubeconfig 재설정
  ```

### 문제 4: 브라우저가 열리지 않음

**해결 방법:**
1. 터미널에 표시된 URL을 수동으로 브라우저에 복사하여 열기
2. 또는 환경 변수 설정:
   ```bash
   export KUBECTL_OIDC_LOGIN_BROWSER="firefox"  # 또는 chrome, safari 등
   ```

### 문제 5: "x509: certificate signed by unknown authority"

**원인:** API 서버 인증서 검증 실패

**해결 방법:**
- 이미 `--insecure-skip-tls-verify` 옵션이 설정되어 있어야 합니다
- 확인:
  ```bash
  kubectl config view | grep insecure-skip-tls-verify
  ```

### 문제 6: "You must be logged in to the server" 또는 exec-command가 실행되지 않음

**원인:** exec-command가 interactive 모드를 제대로 지원하지 않거나, 브라우저가 자동으로 열리지 않습니다.

**증상:**
- `kubectl get ns` 실행 시 "You must be logged in to the server" 에러 발생
- `exec plugin cannot support interactive mode: standard input is not a terminal` 에러 발생
- 토큰은 생성되었지만 kubectl이 이를 사용하지 못함

**해결 방법:**

1. **먼저 수동으로 로그인하여 토큰 캐시 생성:**
   ```bash
   bash login.sh
   ```
   
   또는 직접 실행:
   ```bash
   export PATH="${KREW_ROOT:-$HOME/.krew}/bin:$PATH"
   kubectl oidc-login get-token \
     --oidc-issuer-url="https://dex.zstake.xyz" \
     --oidc-client-id="kubernetes" \
     --oidc-client-secret="1f8bf5822301ecce04ffc40062aa32a64e81821ce532551a" \
     --listen-address="127.0.0.1:8000"
   ```

2. **토큰 캐시 확인:**
   ```bash
   ls -la ~/.kube/cache/oidc-login/
   ```
   
   캐시 파일이 있어야 합니다 (확장자 없음).

3. **kubeconfig 설정 재확인 및 수정:**
   ```bash
   bash fix-kubeconfig.sh
   ```
   
   또는 수동으로:
   ```bash
   kubectl config set-credentials oidc-google \
     --exec-api-version=client.authentication.k8s.io/v1beta1 \
     --exec-command="/Users/steve/.krew/bin/kubectl-oidc_login" \
     --exec-arg=get-token \
     --exec-arg=--oidc-issuer-url="https://dex.zstake.xyz" \
     --exec-arg=--oidc-client-id="kubernetes" \
     --exec-arg=--oidc-client-secret="1f8bf5822301ecce04ffc40062aa32a64e81821ce532551a" \
     --exec-arg=--listen-address="127.0.0.1:8000"
   ```

4. **interactiveMode 확인:**
   ```bash
   kubectl config view --minify --raw | grep interactiveMode
   ```
   
   `interactiveMode: IfAvailable`로 설정되어 있어야 합니다. `Always`로 되어 있으면 에러가 발생할 수 있습니다.

5. **캐시 삭제 후 재로그인:**
   ```bash
   kubectl oidc-login clean
   rm -rf ~/.kube/cache/oidc-login
   bash login.sh
   ```

6. **API 버전 변경 시도:**
   ```bash
   bash try-fix-first.sh
   ```
   
   이 스크립트는 API 버전을 v1으로 변경합니다.

7. **최종 테스트:**
   ```bash
   kubectl get ns
   ```

**참고:** 
- kubectl v1.35.0과 oidc-login v1.35.0 조합에서 exec-credential이 interactive 모드를 제대로 지원하지 않을 수 있습니다.
- 이 경우, 먼저 `login.sh`를 실행하여 토큰을 캐시에 저장한 후 `kubectl` 명령을 실행해야 합니다.
- 토큰은 24시간 동안 유효하며, 만료되면 다시 `login.sh`를 실행하세요.

### 문제 6-1: 버전 호환성 문제로 인한 해결 불가

**증상:**
- 위의 모든 방법을 시도했지만 여전히 "You must be logged in to the server" 에러 발생
- `exec plugin cannot support interactive mode` 에러가 계속 발생
- kubectl v1.35.0과 oidc-login v1.35.0 조합에서 발생

**해결 방법: kubectl 버전 다운그레이드**

버전 호환성 문제가 의심되는 경우, kubectl을 이전 버전으로 다운그레이드하는 것을 권장합니다:

#### 방법 1: 자동 다운그레이드 스크립트 사용 (권장)

```bash
bash downgrade-kubectl.sh
```

이 스크립트는:
1. 현재 kubectl 버전을 확인합니다
2. kubectl v1.34.0으로 다운그레이드합니다
3. 기존 kubectl을 백업합니다
4. 새 버전을 설치합니다

#### 방법 2: 수동 다운그레이드 (macOS - Homebrew)

```bash
# Homebrew를 사용하여 특정 버전 설치
brew unlink kubectl
brew install kubectl@1.34
brew link kubectl@1.34

# 또는 직접 다운로드
curl -LO "https://dl.k8s.io/release/v1.34.0/bin/darwin/arm64/kubectl"
chmod +x kubectl
sudo mv kubectl /usr/local/bin/kubectl
```

#### 방법 3: 수동 다운그레이드 (Linux)

```bash
# 특정 버전 다운로드
curl -LO "https://dl.k8s.io/release/v1.34.0/bin/linux/amd64/kubectl"
chmod +x kubectl
sudo mv kubectl /usr/local/bin/kubectl

# 또는 기존 kubectl 백업 후 교체
sudo mv /usr/local/bin/kubectl /usr/local/bin/kubectl.backup
sudo mv kubectl /usr/local/bin/kubectl
```

#### 버전 확인 및 테스트

다운그레이드 후:

```bash
# 버전 확인
kubectl version --client

# 로그인 재시도
bash login.sh

# 테스트
kubectl get ns
```

#### 원래 버전으로 되돌리기

필요한 경우 원래 버전으로 되돌릴 수 있습니다:

```bash
# 백업에서 복원
sudo mv /usr/local/bin/kubectl.backup.* /usr/local/bin/kubectl

# 또는 Homebrew 사용
brew unlink kubectl@1.34
brew link kubectl
```

**권장 버전:**
- kubectl: v1.34.0 또는 v1.33.0
- oidc-login: v1.35.0 (현재 버전 유지 가능)

**중요: 테스트 결과**

실제 테스트 결과, **kubectl 버전 다운그레이드만으로는 문제가 해결되지 않습니다:**
- kubectl v1.34.0으로 다운그레이드해도 동일한 문제 발생
- API 버전 변경 (v1/v1beta1)으로도 해결 안 됨
- 근본 원인: exec-command가 실행될 때 interactive 모드를 지원하지 않음

**실제 해결 방법:**

버전을 바꾸지 않고 다음 방법을 사용하세요:

1. **먼저 로그인 스크립트 실행 (필수):**
   ```bash
   bash login.sh
   ```
   
   이 스크립트를 실행하여 브라우저에서 로그인하고 토큰을 캐시에 저장합니다.

2. **그 다음 kubectl 명령 실행:**
   ```bash
   kubectl get ns
   ```
   
   캐시된 토큰을 사용하여 명령이 실행됩니다.

**참고:**
- 버전 다운그레이드는 권장하지 않습니다 (문제 해결되지 않음)
- 먼저 `login.sh`를 실행하여 토큰을 캐시에 저장하는 것이 가장 확실한 방법입니다
- 토큰은 24시간 동안 유효하며, 만료되면 다시 `login.sh`를 실행하세요

### 문제 7: "access denied" 또는 "Forbidden"

**원인:** RBAC 권한이 없습니다.

**해결 방법:**
- 서버 관리자에게 문의하여 사용자에게 권한 부여 요청
- 현재 사용자 확인:
  ```bash
  kubectl auth can-i --list
  ```

### 문제 8: Dex 서버에 접근할 수 없음

**테스트:**
```bash
# Dex 서버 접근 확인
curl -k https://dex.zstake.xyz/.well-known/openid-configuration

# 또는 IP로 확인
curl -k https://219.255.103.189:8443/.well-known/openid-configuration
```

**해결 방법:**
- 네트워크 연결 확인
- 방화벽 설정 확인
- 서버 관리자에게 문의

## 📚 자주 사용하는 명령어

```bash
# 컨텍스트 확인
kubectl config get-contexts

# 현재 컨텍스트 확인
kubectl config current-context

# 컨텍스트 변경
kubectl config use-context k8s-prod

# kubeconfig 설정 확인
kubectl config view

# 사용자 정보 확인
kubectl config view --minify

# 네임스페이스 목록
kubectl get ns

# Pod 목록
kubectl get pods -A

# 노드 목록
kubectl get nodes

# 클러스터 정보
kubectl cluster-info
```

## 🎯 k9s 사용

k9s는 kubectl의 터미널 UI입니다. k9s를 사용하면 더 편리하게 클러스터를 관리할 수 있습니다.

### k9s 설치

**Linux:**
```bash
wget https://github.com/derailed/k9s/releases/latest/download/k9s_Linux_amd64.tar.gz
tar xzf k9s_Linux_amd64.tar.gz
sudo install k9s /usr/local/bin/
```

**macOS:**
```bash
brew install k9s
```

**Windows:**
```powershell
choco install k9s
```

### k9s 사용

```bash
# k9s 실행 (현재 kubeconfig 사용)
k9s

# 특정 네임스페이스에서 실행
k9s -n default

# 특정 컨텍스트 사용
k9s --context k8s-prod
```

k9s는 자동으로 현재 kubeconfig의 OIDC 설정을 사용합니다.

## 🔄 토큰 갱신

토큰은 자동으로 갱신됩니다:
- **ID 토큰**: 24시간 유효
- **리프레시 토큰**: 720시간(30일) 유효

토큰 만료 시 다음 `kubectl` 명령 실행 시 자동으로 재로그인됩니다.

## 📝 참고사항

1. **보안:**
   - `KUBERNETES_CLIENT_SECRET`은 안전하게 보관하세요
   - kubeconfig 파일(`~/.kube/config`)의 권한을 제한하세요: `chmod 600 ~/.kube/config`

2. **다중 클러스터:**
   - 여러 클러스터를 관리하는 경우 컨텍스트를 적절히 전환하세요
   - 각 클러스터마다 별도의 사용자(oidc-google)를 만들 수 있습니다

3. **네트워크 요구사항:**
   - 클라이언트가 `dex.zstake.xyz`에 접근할 수 있어야 합니다
   - 클라이언트가 `219.255.103.189:6443`에 접근할 수 있어야 합니다

## 🆘 문제 해결 (CTO 관점)

### 현재 알려진 문제: API 서버가 토큰을 인증하지 못함 (401)

**증상:**
- Dex 로그인 성공, 토큰 발급 성공
- `email` 클레임 있음, `groups` 클레임 없음
- Bearer 토큰으로 API 호출 시 401 (Unauthorized)

**원인:** Kubernetes API 서버의 OIDC 설정과 토큰 불일치

**해결 방법:**

1. **진단 리포트 확인:**
   ```bash
   cat CTO-DIAGNOSIS.md
   ```

2. **디버깅 스크립트 실행:**
   ```bash
   bash debug-auth.sh
   ```

3. **클러스터 관리자에게 전달:**
   - `CTO-DIAGNOSIS.md` 파일 공유
   - API 서버 OIDC 설정 확인 요청
   - 체크리스트 확인 요청

4. **서버 설정 수정 후 최종 테스트:**
   ```bash
   bash fix-and-test-rbac.sh
   ```

### 진단 스크립트

- `debug-auth.sh`: 현재 인증 상태 진단 (401 vs 403)
- `run-e2e-auth-test.sh`: E2E 테스트 (로그인 → 인증 → Pod 조회)
- `test-token-direct.sh`: 토큰 직접 사용 테스트
- `fix-and-test-rbac.sh`: 서버 설정 수정 후 RBAC 포함 최종 테스트

## 🆘 지원

문제가 발생하면 다음 정보와 함께 서버 관리자에게 문의하세요:

1. OS 및 버전
2. kubectl 버전 (`kubectl version --client`)
3. 에러 메시지 전체
4. kubeconfig 설정 (민감 정보 제외):
   ```bash
   kubectl config view --minify | grep -v secret
   ```
5. 진단 리포트:
   ```bash
   bash debug-auth.sh > diagnosis-report.txt
   cat CTO-DIAGNOSIS.md
   ```
