FROM node:26.9.0-alpine@sha256:dbaa92e5758cbbcf85d65d5403fdb530fe3442cbe8c6dbfb7ef23365450d5070 AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY index.html tsconfig.json vite.config.ts ./
COPY src/ ./src/
COPY public/ ./public/
ARG APP_VERSION=development
RUN test -n "$APP_VERSION" && APP_VERSION="$APP_VERSION" npm run build && node -e 'require("fs").writeFileSync("dist/version.json",JSON.stringify({version:process.env.APP_VERSION}))'

FROM nginx:1.30.6-alpine@sha256:583b7f2fce1cdb8da5ad5c39ebd3c33b98b87d493190e548bdee1fa8c619c311
COPY --from=build /src/dist/ /usr/share/nginx/html/
COPY nginx.conf.template /etc/nginx/templates/nginx.conf.template
COPY allowed-hosts.sh /docker-entrypoint.d/15-allowed-hosts.sh
RUN rm -f /etc/nginx/conf.d/default.conf && chmod +x /docker-entrypoint.d/15-allowed-hosts.sh
ARG APP_VERSION=development
LABEL org.opencontainers.image.title="Nestory frontend" org.opencontainers.image.revision=$APP_VERSION
ENV BACKEND_UPSTREAM=noteapp:8080 APP_ALLOWED_HOSTS=localhost,127.0.0.1,::1 NGINX_ENVSUBST_FILTER=^BACKEND_UPSTREAM$ NGINX_ENVSUBST_OUTPUT_DIR=/tmp
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8081/healthz || exit 1
CMD ["nginx", "-c", "/tmp/nginx.conf", "-g", "daemon off;"]
