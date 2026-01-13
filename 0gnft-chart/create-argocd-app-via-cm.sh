#!/bin/bash
set -e

echo "=== ConfigMap을 통한 ArgoCD 배포 ==="

# 1. ConfigMap으로 매니페스트 저장
echo "1. ConfigMap 생성 중..."
kubectl create configmap 0gnft-manifests \
  --from-file=/root/0gnft/k8s \
  --namespace=argocd \
  --dry-run=client -o yaml | kubectl apply -f - 2>&1 || {
    echo "ConfigMap 생성 실패 (kubectl 인증 문제)"
    exit 1
}

# 2. ArgoCD Application 생성 (ConfigMap 참조)
echo "2. ArgoCD Application 생성 중..."
cat > /tmp/app-cm.yaml << 'YAML'
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: 0gainode
  namespace: argocd
spec:
  project: default
  source:
    configMap:
      name: 0gnft-manifests
      namespace: argocd
  destination:
    server: https://kubernetes.default.svc
    namespace: default
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
YAML

kubectl apply -f /tmp/app-cm.yaml 2>&1 || {
    echo "Application 생성 실패"
    exit 1
}

echo "✅ 배포 완료!"
