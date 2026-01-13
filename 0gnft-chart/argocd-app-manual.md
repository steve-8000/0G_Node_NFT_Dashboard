# ArgoCD를 통한 0gainode 배포 가이드

## 방법 1: ArgoCD UI를 통한 배포

1. ArgoCD UI 접속: https://argocd.zstake.xyz
2. 로그인 (admin 계정 사용)
3. "New App" 클릭
4. 다음 정보 입력:
   - Application Name: `0gainode`
   - Project Name: `default`
   - Sync Policy: `Automatic`
   - Repository URL: (Git 저장소가 있는 경우) 또는 로컬 경로 사용
   - Path: `/root/0gnft/k8s`
   - Cluster URL: `https://kubernetes.default.svc`
   - Namespace: `default`
5. "Create" 클릭

## 방법 2: kubectl을 사용할 수 있는 경우

```bash
# 1. SSL 인증서 Secret 생성
kubectl create secret tls 0gainode-tls \
  --cert=/etc/letsencrypt/live/0gainode.zstake.xyz/fullchain.pem \
  --key=/etc/letsencrypt/live/0gainode.zstake.xyz/privkey.pem

# 2. ArgoCD Application 생성
kubectl apply -f /root/0gnft/argocd-application-direct.yaml

# 3. 상태 확인
kubectl get application -n argocd
kubectl get pods -n default | grep 0gnft
```

## 방법 3: ArgoCD CLI 사용

```bash
# ArgoCD CLI 설치 (없는 경우)
curl -sSL -o /usr/local/bin/argocd https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64
chmod +x /usr/local/bin/argocd

# ArgoCD 로그인
argocd login argocd.zstake.xyz

# Application 생성
argocd app create 0gainode \
  --repo https://github.com/your-org/0gnft \
  --path k8s \
  --dest-server https://kubernetes.default.svc \
  --dest-namespace default \
  --sync-policy automated \
  --self-heal

# 또는 로컬 디렉토리 사용 (ArgoCD가 접근 가능한 경우)
argocd app create 0gainode \
  --path /root/0gnft/k8s \
  --dest-server https://kubernetes.default.svc \
  --dest-namespace default \
  --sync-policy automated \
  --self-heal
```

## 생성된 파일

- `/root/0gnft/k8s/deployment.yaml` - Deployment 및 Service 정의
- `/root/0gnft/k8s/ingress.yaml` - Ingress 리소스 정의
- `/root/0gnft/argocd-application-direct.yaml` - ArgoCD Application 정의

## 참고사항

- SSL 인증서 Secret은 수동으로 생성해야 합니다
- ArgoCD가 로컬 파일 시스템에 접근할 수 없는 경우, Git 저장소를 사용해야 합니다
- 배포 후 ArgoCD UI에서 Application 상태를 확인할 수 있습니다
