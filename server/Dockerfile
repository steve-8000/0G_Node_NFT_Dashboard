FROM node:18-alpine

WORKDIR /app

# 의존성 파일 복사
COPY package*.json ./

# 의존성 설치
RUN npm ci --only=production

# 소스 코드 복사
COPY . .

# 데이터베이스 파일을 위한 볼륨 마운트 포인트 생성
VOLUME ["/app/nft_data.db"]

# 포트 노출
EXPOSE 3001

# 환경 변수
ENV PORT=3001
ENV NODE_ENV=production

# 서버 실행
CMD ["node", "server.js"]
