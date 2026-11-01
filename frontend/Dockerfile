# syntax=docker/dockerfile:1.7

# ---- build ---------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /src

COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ---- runtime -------------------------------------------------------------
FROM nginxinc/nginx-unprivileged:stable-alpine
USER root

# Copy built assets
COPY --from=build --chown=nginx:nginx /src/dist /usr/share/nginx/html
COPY --chown=nginx:nginx nginx.conf /etc/nginx/nginx.conf
COPY docker/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
RUN chmod 755 /docker-entrypoint.d/40-runtime-config.sh && chown nginx:nginx /docker-entrypoint.d/40-runtime-config.sh

USER nginx

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
