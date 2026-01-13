# 쿠버네티스 배포 가이드

현재 쿠버네티스 ingress-nginx 컨트롤러가 포트 80/443을 사용하고 있습니다.
일반 nginx 설정 파일이 아닌 쿠버네티스 Ingress 리소스를 사용해야 합니다.

## 배포 방법

1. 백엔드 서비스 배포:
```bash
kubectl apply -f k8s-deployment.yaml
```

2. Ingress 리소스 배포:
```bash
kubectl apply -f k8s-ingress.yaml
```

3. 상태 확인:
```bash
kubectl get ingress -A
kubectl get svc -A | grep 0gnft
kubectl get pods -A | grep 0gnft
```

## 주의사항

- 백엔드 서비스는 현재 호스트의 `/root/0gnft/server` 디렉토리를 마운트합니다
- 프론트엔드는 `/var/www/0gnft` 디렉토리를 사용합니다
- SSL 인증서는 cert-manager를 사용하거나 수동으로 Secret을 생성해야 합니다

## SSL 인증서 수동 생성 (cert-manager 없이)

```bash
kubectl create secret tls 0gainode-tls \
  --cert=/etc/letsencrypt/live/0gainode.zstake.xyz/fullchain.pem \
  --key=/etc/letsencrypt/live/0gainode.zstake.xyz/privkey.pem
```

## 문제 해결

1. Ingress가 생성되지 않는 경우:
```bash
kubectl describe ingress 0gainode-ingress
```

2. 서비스가 연결되지 않는 경우:
```bash
kubectl logs -l app=0gnft-backend
kubectl logs -l app=0gnft-frontend
```

3. 포트 충돌 확인:
```bash
kubectl get svc -A | grep -E "(80|443|3001)"
```
