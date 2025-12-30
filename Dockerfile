# 빌드 스테이지
FROM node:18-alpine AS builder

WORKDIR /app

# 의존성 파일 복사
COPY package*.json ./
RUN npm ci

# 소스 코드 복사 및 빌드
COPY . .
RUN npm run build

# 프로덕션 스테이지
FROM nginx:alpine

# 빌드된 파일 복사
COPY --from=builder /app/dist /usr/share/nginx/html

# nginx 설정 복사
COPY nginx.conf /etc/nginx/templates/default.conf.template

# 포트 노출
EXPOSE 80 443

# nginx 실행
CMD ["nginx", "-g", "daemon off;"]











