# ArgoCD 배포 가이드

## 현재 상황
- ✅ Git 저장소: https://github.com/steve-8000/k8s_playground.git
- ✅ Path: 0gnft-chart/k8s
- ✅ GitHub Personal Access Token: [YOUR_TOKEN_HERE]
- ⚠️  ArgoCD 서버에서 GitHub 접근 시 네트워크 타임아웃 발생

## ArgoCD UI를 통한 배포 (권장)

### 1. ArgoCD UI 접속
- URL: https://argocd.zstake.xyz
- 사용자명: `admin`
- 비밀번호: `[YOUR_PASSWORD]`

### 2. Git 저장소 등록
1. **Settings** → **Repositories** 클릭
2. **Connect Repo** 버튼 클릭
3. 다음 정보 입력:
   - **Type**: `git`
   - **Project**: `default`
   - **Repository URL**: `https://github.com/steve-8000/k8s_playground.git`
   - **Username**: `steve-8000`
   - **Password**: `[YOUR_GITHUB_TOKEN]`
4. **Connect** 클릭
5. 저장소가 성공적으로 등록되었는지 확인

### 3. Application 생성
1. **Applications** → **New App** 클릭
2. **General** 섹션:
   - **Application Name**: `0gainode`
   - **Project Name**: `default`
   - **Sync Policy**: `Automatic` 선택
3. **Source** 섹션:
   - **Repository URL**: `https://github.com/steve-8000/k8s_playground.git`
   - **Revision**: `main`
   - **Path**: `0gnft-chart/k8s`
4. **Destination** 섹션:
   - **Cluster URL**: `https://kubernetes.default.svc`
   - **Namespace**: `default`
5. **Create** 클릭

### 4. 동기화 및 확인
1. Application이 생성되면 자동으로 동기화가 시작됩니다
2. **Sync** 버튼을 클릭하여 수동 동기화도 가능합니다
3. Pod 상태 확인:
   - Application 상세 페이지에서 리소스 상태 확인
   - 또는 `kubectl get pods -n default | grep 0gnft`

## 배포된 리소스
- **Deployment**: `0gnft-backend`, `0gnft-frontend`
- **Service**: `0gnft-backend-service`, `0gnft-frontend-service`
- **Ingress**: `0gainode-ingress`
- **ConfigMap**: `0gnft-nginx-config`
- **Secret**: `0gainode-tls` (SSL 인증서)

## 문제 해결
- **저장소 접근 실패**: 네트워크 방화벽 확인 또는 ArgoCD 서버에서 GitHub 접근 가능 여부 확인
- **Pod가 시작되지 않음**: Application 상세 페이지에서 오류 메시지 확인
- **Ingress가 작동하지 않음**: SSL 인증서 Secret 확인
