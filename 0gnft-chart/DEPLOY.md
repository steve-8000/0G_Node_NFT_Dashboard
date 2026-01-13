# 0gainode ArgoCD 배포 가이드

## 준비된 파일

- `k8s/deployment.yaml` - 백엔드/프론트엔드 Deployment 및 Service
- `k8s/ingress.yaml` - Ingress 리소스
- `k8s/secret-tls.yaml` - SSL 인증서 Secret (자동 생성됨)
- `argocd-application-direct.yaml` - ArgoCD Application 정의

## 배포 단계

### 1. SSL 인증서 Secret 생성 (이미 생성된 경우 스킵)

```bash
kubectl apply -f /root/0gnft/k8s/secret-tls.yaml
```

또는 수동으로:
```bash
kubectl create secret tls 0gainode-tls \
  --cert=/etc/letsencrypt/live/0gainode.zstake.xyz/fullchain.pem \
  --key=/etc/letsencrypt/live/0gainode.zstake.xyz/privkey.pem
```

### 2. ArgoCD Application 생성

**방법 A: kubectl 사용 (권장)**
```bash
kubectl apply -f /root/0gnft/argocd-application-direct.yaml
```

**방법 B: ArgoCD UI 사용**
1. https://argocd.zstake.xyz 접속
2. "New App" 클릭
3. 다음 정보 입력:
   - Name: `0gainode`
   - Project: `default`
   - Sync Policy: `Automatic`
   - Repository URL: (Git 저장소가 있는 경우)
   - Path: `k8s` (또는 `/root/0gnft/k8s` 로컬 경로)
   - Cluster: `https://kubernetes.default.svc`
   - Namespace: `default`
4. "Create" 클릭

**방법 C: ArgoCD CLI 사용**
```bash
argocd login argocd.zstake.xyz --insecure
argocd app create 0gainode \
  --path k8s \
  --dest-server https://kubernetes.default.svc \
  --dest-namespace default \
  --sync-policy automated \
  --self-heal \
  --upsert
```

### 3. 상태 확인

```bash
# ArgoCD Application 상태
kubectl get application -n argocd 0gainode

# Pod 상태
kubectl get pods -n default | grep 0gnft

# Service 상태
kubectl get svc -n default | grep 0gnft

# Ingress 상태
kubectl get ingress -n default 0gainode-ingress
```

### 4. 동기화 (필요한 경우)

```bash
argocd app sync 0gainode
```

## 문제 해결

1. **Application이 생성되지 않는 경우**
   - ArgoCD UI에서 직접 생성
   - kubectl 권한 확인

2. **Pod가 시작되지 않는 경우**
   - 로그 확인: `kubectl logs -n default -l app=0gnft-backend`
   - 호스트 경로 권한 확인

3. **Ingress가 작동하지 않는 경우**
   - SSL 인증서 Secret 확인
   - Ingress Controller 로그 확인
