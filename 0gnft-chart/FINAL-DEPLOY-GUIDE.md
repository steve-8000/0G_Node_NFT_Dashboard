# 0gainode 배포 최종 가이드

## 현재 상황
- ✅ Kubernetes 매니페스트 파일 준비 완료: `/root/0gnft/k8s/`
- ✅ ArgoCD 로그인 성공 (admin / Tan8342!)
- ⚠️  ArgoCD는 Git 저장소가 필수 (로컬 파일 경로 사용 불가)
- ⚠️  kubectl 인증 문제 (oidc-login)

## 배포 방법

### 방법 1: ArgoCD UI 사용 (가장 권장)

1. **ArgoCD UI 접속**
   - URL: https://argocd.zstake.xyz
   - 사용자명: `admin`
   - 비밀번호: `Tan8342!`

2. **Application 생성**
   - "New App" 클릭
   - **General:**
     - Application Name: `0gainode`
     - Project Name: `default`
     - Sync Policy: `Automatic`
   
   - **Source:**
     - Repository Type: `Directory` 또는 `Helm`
     - Repository URL: (Git 저장소 URL)
     - Path: `k8s` (Git 저장소 내 경로)
     - 또는 **직접 YAML 입력** (일부 ArgoCD 버전 지원)
   
   - **Destination:**
     - Cluster URL: `https://kubernetes.default.svc`
     - Namespace: `default`
   
   - "Create" 클릭

3. **매니페스트 직접 입력 (Git 저장소 없이)**
   - Source Type을 `Raw` 또는 `Directory`로 선택
   - 매니페스트 파일 내용을 직접 입력하거나
   - `/root/0gnft/k8s/` 디렉토리의 파일들을 복사하여 입력

### 방법 2: kubectl 직접 사용 (인증 문제 해결 후)

```bash
# SSL Secret 생성
kubectl create secret tls 0gainode-tls \
  --cert=/etc/letsencrypt/live/0gainode.zstake.xyz/fullchain.pem \
  --key=/etc/letsencrypt/live/0gainode.zstake.xyz/privkey.pem

# 리소스 배포
kubectl apply -f /root/0gnft/k8s/deployment.yaml
kubectl apply -f /root/0gnft/k8s/ingress.yaml
kubectl apply -f /root/0gnft/k8s/secret-tls.yaml
```

### 방법 3: Git 저장소 사용

1. Git 저장소 생성 (GitHub, GitLab 등)
2. `/root/0gnft/k8s/` 파일들을 Git 저장소에 푸시
3. ArgoCD에서 해당 Git 저장소를 사용하여 Application 생성

## 준비된 파일

- `/root/0gnft/k8s/deployment.yaml` - Deployment 및 Service
- `/root/0gnft/k8s/ingress.yaml` - Ingress 리소스
- `/root/0gnft/k8s/secret-tls.yaml` - SSL 인증서 Secret
- `/root/0gnft/k8s/kustomization.yaml` - Kustomize 설정

## 상태 확인

배포 후:
```bash
kubectl get pods -n default | grep 0gnft
kubectl get svc -n default | grep 0gnft
kubectl get ingress -n default | grep 0gainode
```

또는 ArgoCD UI에서 Application 상태 확인
