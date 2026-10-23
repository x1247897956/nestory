# Noteapp

单人、本地或受信任局域网使用的项目与任务软件。阶段 1 已提供项目新建/编辑/归档、五阶段任务、一层子任务、优先级、日期、分组筛选、Markdown 源码输入与版本冲突保护。未实现的笔记、日历、关联、删除和回收站没有操作入口。

## 开发

固定工具链：Go **1.27.1**、Node **26.9.0**、npm **11.19.1**。依赖版本见 `go.mod` / `web/package-lock.json`，许可证见 [依赖记录](docs/implementation/dependencies.md)。

```sh
cd web
npm ci
npm run build
cd ..
go run ./cmd/noteapp
```

打开 [本地应用](http://localhost:8080)。Go 编译时内嵌 `web/dist`，首次运行必须先构建前端。

前端热更新：另开终端执行 `cd web && npm run dev`；后端用 `APP_DEV_ORIGIN=http://127.0.0.1:5173 go run ./cmd/noteapp`。浏览器打开 [Vite](http://127.0.0.1:5173)，`/api` 同源代理至 8080。前端不会向任意来源开放 CORS。

| 环境变量 | 默认值 | 含义 |
| --- | --- | --- |
| APP_ADDR | :8080 | Go 服务监听地址 |
| APP_DATA_DIR | ./data | SQLite 与附件存储目录 |
| APP_TIMEZONE | Asia/Shanghai | 部署时区，启动校验 |
| APP_DEV_ORIGIN | 空 | 额外允许的开发浏览器 Origin |
| APP_BIND | 127.0.0.1 | Compose 端口绑定 |
| APP_PORT | 8080 | Compose 主机端口 |

若安装多个 Go 版本后出现 `compile: version ... does not match go tool version ...`，检查 `go env GOROOT` 和 `go tool compile -V`；本次环境残留 goenv 的 GOROOT，使用 `env -u GOROOT go test ./...` 可恢复工具链一致性，无需修改用户全局配置。受限环境可把 `GOPATH`、`GOCACHE`、`GOMODCACHE` 和 `npm_config_cache` 指向可写目录。

## Docker

```sh
cp .env.example .env
docker compose up -d --build
```

单容器提供 API 和静态前端，非 root UID/GID 10001 运行；命名卷 `noteapp-data` 持久化整个 `/data`。固定镜像标签与 digest 见 Dockerfile。默认仅本机可访问；受信任局域网部署可显式修改 APP_BIND。当前没有身份验证。

更新/重建：`docker compose up -d --build --force-recreate`。停止：`docker compose down`。不要执行 `docker compose down -v`，那会删除数据卷。

## 检查

```sh
go test ./...
go vet ./...
cd web
npm run typecheck
npm test -- --run
npm run build
npx playwright install chromium
# 或使用现有 Chromium：
# PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="/path/to/chromium" npm run e2e
npm run e2e -- tasks.spec.ts
```

Playwright 默认启动 Go 后端并使用 `/tmp/noteapp-e2e-data` 临时数据库和 18080 端口；可用 `E2E_BASE_URL=http://127.0.0.1:8080 npm run e2e` 对已运行实例验证。测试会创建带时间戳项目，建议使用测试实例。

所有 HTTP JSON 接口位于 `/api/v1`：`/healthz` 检查进程、`/readyz` 检查数据库、`/config` 提供时区和阶段元数据；项目和任务接口见技术设计。PATCH 与 move 必须提交 version。400 为参数错误，404 为不存在，409 为版本/归档/父级冲突，500 不暴露数据库详情。任务保存是阶段 1 的显式保存按钮；失败和 409 会保留草稿，可复制、重试或确认后重新载入。关闭标签页和应用内路由离开会提示未保存内容。

## 停机一致性备份与恢复

先停止服务，再完整备份数据目录（包括存在的 WAL/SHM 和 assets）。不要运行中仅复制主数据库。

```sh
docker compose stop
docker run --rm --volumes-from "$(docker compose ps -aq noteapp)" -v "$PWD:/backup" alpine:3.22.2 tar czf /backup/noteapp-backup.tar.gz -C /data .
shasum -a 256 noteapp-backup.tar.gz > noteapp-backup.tar.gz.sha256
docker compose start
```

记录应用 commit、schema 版本（阶段 1 为 1）与校验和。恢复到空的命名卷：停止服务，用临时容器把归档解压至该卷的 `/data`，确认目录归属 UID/GID 10001，再以相同应用版本启动。检查 `/readyz`、项目与任务数量、正文和父子关系；后续阶段含附件时一同验证附件。升级迁移前采用同样备份，当前不承诺自动降级。

本次开发环境的正式多阶段镜像基础层下载较慢，阶段 1 另外通过了“本机交叉编译二进制 + 相同 Alpine 运行层”的容器重建持久化检查；该替代路径只用于开发验证，不是常规交付构建命令。正式 `docker build` 的最终结果以实施报告及后续交付检查为准。
