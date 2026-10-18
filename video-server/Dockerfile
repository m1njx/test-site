FROM node:20-alpine

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./

# 영상 저장 경로 (배포 시 영구 볼륨을 여기에 마운트)
ENV VIDEO_DIR=/data/videos
VOLUME ["/data/videos"]

EXPOSE 8080
CMD ["node", "server.js"]
