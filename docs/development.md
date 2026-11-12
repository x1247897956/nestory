# Nestory 开发指南

[产品首页](../README.md) · [技术架构](architecture.md)

## 本地开发

仓库锁定工具链：Go **1.27.3**、Node **26.9.0**、npm **11.19.1**。依赖由 `go.mod`、`go.sum` 和 `web/package-lock.json` 锁定。

先构建前端，再启动内嵌静态文件的 Go 服务：

```sh
npm ci --prefix web
npm run build --prefix web
go run ./cmd/noteapp
```

热更新开发使用两个终端：

```sh
# 终端一：后端
APP_DEV_ORIGIN=http://127.0.0.1:5173 go run ./cmd/noteapp
```

```sh
# 终端二：前端，/api 代理至本机 8080
npm run dev --prefix web
```

打开 [http://127.0.0.1:5173](http://127.0.0.1:5173)。

## 测试

```sh
go test ./...
go test -race ./...
go vet ./...
npm run typecheck --prefix web
npm run test --prefix web -- --run
npm run build --prefix web
```

浏览器测试会创建、修改测试数据。推荐使用脚本启动的独立临时容器与数据卷：

```sh
npm exec --prefix web -- playwright install chromium
docker build -t noteapp:test .
sh scripts/audit/run_browser.sh noteapp:test
NOTEAPP_TEST_IMAGE=noteapp:test python3 -m unittest discover -s scripts/tests -p 'test_*.py'
```

也可通过 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 指定已有 Chromium。运维脚本要求 Python 3.9+，包含标准库 `sqlite3`。

## 源码提交与镜像打包

测试代码保留在 Git 仓库中，便于开发者和 CI 复现验证。`.env`、`.env.local`、`.env.production` 等真实配置由 `.gitignore` 排除，`.env.example` 等示例模板保留。

Docker 构建使用 `.dockerignore` 允许列表，只传入编译需要的 Go 源码、迁移 SQL、前端源码、公共静态资源和构建配置。Python 运维脚本、Go/前端测试、测试夹具、文档、设计稿、本机配置、`node_modules` 和旧 `dist` 不进入构建上下文。Dockerfile 同时显式复制这些必要路径，避免整仓库复制。新增生产源码目录或构建配置文件时，需要相应更新允许列表和 COPY 路径。

最终镜像包含编译后的 Go 程序（内嵌前端）与运行依赖，不包含 Python、Node、项目源码或测试脚本。上传源码与发布镜像使用不同范围；本机环境配置不参与镜像构建。

## 构建版本信息

应用版本由构建参数 `APP_VERSION` 写入 Go 程序，镜像标签、`/api/v1/config` 和设置页使用同一个发布标识。普通 `go run` / `go build` 或未指定版本的镜像构建显示 `development`。

发布命令可以在宿主机自动读取 Git 标签或提交号，不需要将 `.git` 目录发送到 Docker：

```sh
build_version=$(git describe --tags --always --dirty)
docker build --build-arg APP_VERSION="$build_version" -t noteapp:local .
```

也可显式传入 `APP_VERSION=v0.1.1`。标签／版本编号由发布时确定，应用不自动递增版本号。已跟踪文件存在未提交修改时，以上 Git 命令会追加 `-dirty`。修改 `.env` 中的 `APP_VERSION` 后，需要重新构建镜像才能生效；`docker compose up -d --no-build noteapp` 只启动已有镜像，其报告的版本保持为该镜像构建时的标识。

## 技术结构

Go 轻量模块化单体，普通构造函数组装依赖；React + TypeScript + Vite 前端，SQLite 保存业务数据，附件保存在同卷文件目录。一个非 root Docker 容器提供前端与 `/api/v1`。

```text
cmd/noteapp/          服务入口
internal/            业务模块、事务、HTTP适配与数据库
migrations/          SQLite迁移
web/src/             React界面与块编辑器
scripts/             备份、恢复、检查和性能探针
docs/                当前说明、架构、运维与历史验收证据
```

正文唯一存储格式为版本化块 JSON。HTTP 更新使用版本检查，跨对象关系与删除恢复有事务约束；创建请求支持幂等重试。编辑器按需加载，GET JSON 支持协商 gzip。完整技术说明见[架构文档](architecture.md)与[自定义属性 API](custom-properties-api.md)。


## 开发排错

Go工具链版本不匹配时检查 `go env GOROOT` 和 `go tool compile -V`；残留旧 `GOROOT` 时可尝试 `env -u GOROOT go test ./...`。
