FROM node:26.9.0-alpine@sha256:dbaa92e5758cbbcf85d65d5403fdb530fe3442cbe8c6dbfb7ef23365450d5070 AS frontend
WORKDIR /src/web
COPY web/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund --fetch-timeout=30000 --fetch-retries=1 --foreground-scripts
COPY web/ ./
RUN npm run build

FROM golang:1.27.1-alpine@sha256:8a5910f31396cd4d89662f56c68b3ae31d374308270a1c3bd96672ee5ed43414 AS backend
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /src/web/dist ./web/dist
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /noteapp ./cmd/noteapp

FROM alpine:3.22.2@sha256:4b7ce07002c69e8f3d704a9c5d6fd3053be500b7f1c69fc0d80990c2ad8dd412
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
