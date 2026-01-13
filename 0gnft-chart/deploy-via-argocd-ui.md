# ArgoCD UI를 통한 배포 가이드

## 현재 상황
- ArgoCD는 Git 저장소를 사용해야 하므로 로컬 파일 경로를 직접 사용할 수 없습니다
- kubectl 인증 문제로 직접 배포가 어렵습니다

## 해결 방법: ArgoCD UI 사용

### 1. ArgoCD UI 접속
- URL: https://argocd.zstake.xyz
- 사용자명: admin
- 비밀번호: Tan8342!

### 2. Application 생성
1. "New App" 버튼 클릭
2. 다음 정보 입력:

**General:**
- Application Name: `0gainode`
- Project Name: `default`
- Sync Policy: `Automatic`

**Source:**
- Repository Type: `Directory`
- Repository URL: (Git 저장소가 있는 경우)
- 또는 **Helm** 또는 **Kustomize** 사용

**또는 직접 YAML 입력:**
- Source Type: `Raw`
- YAML 내용에 `/root/0gnft/k8s/` 디렉토리의 모든 파일 내용 입력

**Destination:**
- Cluster URL: `https://kubernetes.default.svc`
- Namespace: `default`

3. "Create" 클릭

### 3. 대안: ConfigMap으로 매니페스트 저장

ArgoCD가 ConfigMap을 읽을 수 있도록 설정하거나,
직접 Kubernetes 리소스를 생성하는 방법을 사용하세요.

## 준비된 파일
- `/root/0gnft/k8s/deployment.yaml`
- `/root/0gnft/k8s/ingress.yaml`
- `/root/0gnft/k8s/secret-tls.yaml`
