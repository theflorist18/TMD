# Production-style static server (mirrors typical Hostinger VPS: Nginx + dist + /output/)
FROM node:22-alpine AS builder
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/web/dist /usr/share/nginx/html
RUN mkdir -p /usr/share/nginx/html/output
EXPOSE 80
