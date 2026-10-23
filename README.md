# Noteapp

单人、本地或受信任局域网使用的项目、任务与笔记软件。第一版提供五阶段任务与一层子任务、多层笔记、共享 Markdown 编辑与安全附件、独立日历、三组双向关联、今日工作台、搜索、项目归档和按批次删除恢复。SQLite与附件在同一数据卷持久化，无登录或团队协作。

实际验收与限制见 [第一版验收](docs/acceptance-v1.md)，安装、升级、备份恢复见 [运维手册](docs/operations.md)。

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
| APP_UPLOAD_LIMIT | 20971520 | 单附件最大字节数，20 MiB；正整数 |
| APP_DEV_ORIGIN | 空 | 额外允许的开发浏览器 Origin |
| APP_BIND | 127.0.0.1 | Compose 端口绑定 |
| APP_PORT | 8080 | Compose 主机端口 |
| APP_IMAGE | noteapp:local | 构建/启动的镜像引用 |
| APP_VERSION | development | 镜像中的源码版本标签，发布时设为commit |
| APP_VOLUME_NAME | noteapp_noteapp-data | 显式真实命名卷，升级须沿用旧卷 |

若安装多个 Go 版本后出现 `compile: version ... does not match go tool version ...`，检查 `go env GOROOT` 和 `go tool compile -V`；本次环境残留 goenv 的 GOROOT，使用 `env -u GOROOT go test ./...` 可恢复工具链一致性，无需修改用户全局配置。受限环境可把 `GOPATH`、`GOCACHE`、`GOMODCACHE` 和 `npm_config_cache` 指向可写目录。

## Docker

```sh
cp .env.example .env
APP_VERSION=$(git rev-parse HEAD) docker compose up -d --build
scripts/smoke.sh --url http://127.0.0.1:8080
```

单容器提供 API 和静态前端，非 root UID/GID 10001 运行；默认真实命名卷 `noteapp_noteapp-data`（APP_VOLUME_NAME） 持久化整个 `/data`。固定镜像标签与 digest 见 Dockerfile。默认仅本机可访问；受信任局域网部署可显式修改 APP_BIND。当前没有身份验证。

更新/重建：`docker compose up -d --build --force-recreate`。停止：`docker compose down`。不要执行 `docker compose down -v`，那会删除数据卷。

## 检查

```sh
go test ./...
go test -race ./...
go vet ./...
cd web
npm run typecheck
npm test -- --run
npm run build
npx playwright install chromium
# 或使用现有 Chromium：
# PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="/path/to/chromium" npm run e2e
npm run e2e
cd ..
python3 -m unittest scripts.tests.test_archive
# 本机已有最终Docker镜像时，另验证备份恢复与容器错误边界：
python3 -m unittest scripts.tests.test_backup_restore scripts.tests.test_runtime
```

Playwright 默认启动 Go 后端并使用 `/tmp/noteapp-e2e-data` 临时数据库和 18080 端口；可用 `E2E_BASE_URL=http://127.0.0.1:8080 npm run e2e` 对已运行实例验证。测试会创建带时间戳项目，建议使用测试实例。

所有 HTTP JSON 接口位于 `/api/v1`：`/healthz` 检查进程、`/readyz` 检查数据库、`/config` 提供时区和阶段元数据；项目、任务、页面、日程、双向关联、工作台、搜索及回收站接口见技术设计。PATCH 与 move 必须提交 version。400 为参数错误，404 为不存在，409 为版本/归档/父级冲突，500 不暴露数据库详情。任务和页面正文在停止输入 800ms 后自动保存，每个对象串行发送快照；保留显式保存按钮。失败和 409 会保留草稿，可复制、重试或确认后重新载入。关闭标签页和应用内路由离开会提示未保存内容。

## 停机一致性备份与恢复

运维脚本要求主机 Python 3.9+（含标准库sqlite3）和Docker。脚本只接受明确命名卷、容器及镜像；备份整个 `/data`，包括存在的WAL/SHM和附件，生成版本、SQL对象/关系计数、文件及附件SHA清单，最后自动尝试恢复原容器运行状态。不要运行中只复制数据库主文件。

```sh
mkdir -p backups
scripts/backup.sh --container noteapp-noteapp-1 \
  --volume noteapp_noteapp-data --image noteapp:local \
  --app-version "$(git rev-parse HEAD)" --output "$PWD/backups/noteapp-v1"

docker volume create noteapp-restored
scripts/restore.sh --volume noteapp-restored \
  --image <manifest.json中的image_id> --backup "$PWD/backups/noteapp-v1"
```

恢复只写预先创建的空卷，禁止覆盖；先使用清单里的同一image ID。脚本先核对SHA与只读SQLite完整性/外键/计数，再恢复并重新读取目标核对正文所在文件、所有关系计数和每个附件SHA。保留原卷，不要覆盖源数据。按 [运维手册](docs/operations.md) 启动恢复检查实例并验证浏览器，再切换正式卷。升级前备份；不承诺自动schema降级。

[最终验收记录](docs/acceptance-v1.md) 区分正式多阶段构建与早期开发替代验证，附实际命令、镜像版本和证据。当前前端大包约1.65MB（gzip526KB），首次加载性能仍可优化。
