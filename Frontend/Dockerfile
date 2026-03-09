# Build context must be repo root (docker-compose: context: ., dockerfile: Frontend/Dockerfile)
# Stage 1: Build the React app
FROM node:18-alpine AS builder
WORKDIR /app
COPY Frontend/package.json Frontend/package-lock.json* ./
RUN npm ci --silent
COPY Frontend/ .
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
