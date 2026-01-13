#!/bin/bash
set -e

echo "=== ArgoCD Application 직접 생성 ==="

ARGOCD_SERVER="argocd.zstake.xyz"

# ArgoCD 비밀번호 시도
echo "ArgoCD 비밀번호 확인 중..."
PASSWORD=""
for method in "kubectl-secret" "pod-exec" "default"; do
  case $method in
    "kubectl-secret")
      PASSWORD=$(kubectl get secret -n argocd argocd-initial-admin-secret -o jsonpath="{.data.password}" 2>/dev/null | base64 -d 2>/dev/null)
      ;;
    "pod-exec")
      POD=$(kubectl get pods -n argocd -l app.kubernetes.io/name=argocd-server -o jsonpath="{.items[0].metadata.name}" 2>/dev/null)
      if [ -n "$POD" ]; then
        PASSWORD=$(kubectl exec -n argocd $POD -- argocd admin initial-password 2>/dev/null | head -1)
      fi
      ;;
    "default")
      PASSWORD="admin"
      ;;
  esac
  
  if [ -n "$PASSWORD" ]; then
    echo "비밀번호 확인 방법: $method"
    break
  fi
done

echo "ArgoCD 로그인 시도..."
TOKEN=$(curl -k -s -X POST "https://${ARGOCD_SERVER}/api/v1/session" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin\",\"password\":\"${PASSWORD}\"}" 2>/dev/null | \
  grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ 자동 로그인 실패"
  echo "ArgoCD UI (https://${ARGOCD_SERVER})에서 직접 Application을 생성하세요:"
  echo ""
  echo "Application 정보:"
  echo "  Name: 0gainode"
  echo "  Project: default"
  echo "  Source Path: /root/0gnft/k8s"
  echo "  Destination: https://kubernetes.default.svc / default"
  echo "  Sync Policy: Automatic"
  exit 1
fi

echo "✅ ArgoCD 로그인 성공"

# Application 생성
cat > /tmp/app.json << 'JSON'
{
  "metadata": {
    "name": "0gainode",
    "namespace": "argocd"
  },
  "spec": {
    "project": "default",
    "source": {
      "path": "/root/0gnft/k8s",
      "directory": {
        "recurse": true
      }
    },
    "destination": {
      "server": "https://kubernetes.default.svc",
      "namespace": "default"
    },
    "syncPolicy": {
      "automated": {
        "prune": true,
        "selfHeal": true
      },
      "syncOptions": ["CreateNamespace=true"]
    }
  }
}
JSON

echo "Application 생성 중..."
RESPONSE=$(curl -k -s -w "\n%{http_code}" -X POST "https://${ARGOCD_SERVER}/api/v1/applications" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d @/tmp/app.json)

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
  echo "✅ Application 생성 성공!"
  echo "$BODY" | head -10
elif echo "$BODY" | grep -q "already exists"; then
  echo "⚠️  Application이 이미 존재합니다. 업데이트합니다..."
  curl -k -s -X PUT "https://${ARGOCD_SERVER}/api/v1/applications/0gainode" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${TOKEN}" \
    -d @/tmp/app.json
  echo "✅ Application 업데이트 완료"
else
  echo "❌ Application 생성 실패 (HTTP $HTTP_CODE)"
  echo "$BODY"
  exit 1
fi

echo ""
echo "=== 배포 완료 ==="
echo "ArgoCD UI: https://${ARGOCD_SERVER}"
