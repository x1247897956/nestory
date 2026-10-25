FROM node:26.9.0-alpine@sha256:dbaa92e5758cbbcf85d65d5403fdb530fe3442cbe8c6dbfb7ef23365450d5070 AS frontend
WORKDIR /src/web
COPY web/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund --fetch-timeout=30000 --fetch-retries=1 --foreground-scripts --loglevel=verbose
COPY web/ ./
RUN npm run build

FROM golang:1.27.3-alpine3.24@sha256:b8c9b82affbbb82a020bbcf998dad2ba9516944ac7e883524642a481a9505e9c AS backend
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /src/web/dist ./web/dist
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /noteapp ./cmd/noteapp

FROM alpine:3.22.7@sha256:2e0b81d60597f449baa56dc25d355367869d2dca4cd57e866f1e2b52af3eb55f
RUN apk add --no-cache ca-certificates tzdata && addgroup -g 10001 noteapp && adduser -D -u 10001 -G noteapp noteapp && mkdir -p /data/assets && chown -R noteapp:noteapp /data
COPY --from=backend /noteapp /usr/local/bin/noteapp
ARG APP_VERSION=development
LABEL org.opencontainers.image.title="Noteapp" org.opencontainers.image.revision=$APP_VERSION
USER noteapp
ENV APP_ADDR=:8080 APP_DATA_DIR=/data APP_TIMEZONE=Asia/Shanghai
EXPOSE 8080
VOLUME /data
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/api/v1/readyz || exit 1
ENTRYPOINT ["noteapp"]
