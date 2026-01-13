#!/bin/bash
set -e

echo "=== ArgoCD API를 통한 Application 생성 ==="

ARGOCD_SERVER="argocd.zstake.xyz"
APP_NAME="0gainode"

# ArgoCD 비밀번호 확인 시도
PASSWORD=$(kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" 2>/dev/null | base64 -d 2>/dev/null || echo "admin")

echo "ArgoCD 서버에 로그인 중..."
TOKEN=$(curl -k -s -X POST "https://${ARGOCD_SERVER}/api/v1/session" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin\",\"password\":\"${PASSWORD}\"}" | \
  grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "로그인 실패. 수동으로 비밀번호를 입력하세요."
  read -sp "ArgoCD admin 비밀번호: " PASSWORD
  TOKEN=$(curl -k -s -X POST "https://${ARGOCD_SERVER}/api/v1/session" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"admin\",\"password\":\"${PASSWORD}\"}" | \
    grep -o '"token":"[^"]*"' | cut -d'"' -f4)
fi

if [ -z "$TOKEN" ]; then
  echo "❌ ArgoCD 로그인 실패"
  exit 1
fi

echo "✅ ArgoCD 로그인 성공"

# Application 생성
echo "Application 생성 중..."
cat > /tmp/app-payload.json << 'PAYLOAD'
{
  "metadata": {
    "name": "0gainode",
    "namespace": "argocd",
    "finalizers": ["resources-finalizer.argocd.argoproj.io"]
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
      "syncOptions": ["CreateNamespace=true"],
      "retry": {
        "limit": 5,
        "backoff": {
          "duration": "5s",
          "factor": 2,
          "maxDuration": "3m"
        }
      }
    }
  }
}
PAYLOAD

RESPONSE=$(curl -k -s -X POST "https://${ARGOCD_SERVER}/api/v1/applications" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d @/tmp/app-payload.json)

if echo "$RESPONSE" | grep -q "already exists"; then
  echo "⚠️  Application이 이미 존재합니다. 업데이트합니다..."
  curl -k -s -X PUT "https://${ARGOCD_SERVER}/api/v1/applications/${APP_NAME}" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${TOKEN}" \
    -d @/tmp/app-payload.json
  echo "✅ Application 업데이트 완료"
elif echo "$RESPONSE" | grep -q "name\|metadata"; then
  echo "✅ Application 생성 성공!"
  echo "$RESPONSE" | head -20
else
  echo "❌ Application 생성 실패"
  echo "$RESPONSE"
  exit 1
fi

echo ""
echo "=== 배포 완료 ==="
echo "ArgoCD UI에서 확인: https://${ARGOCD_SERVER}"
