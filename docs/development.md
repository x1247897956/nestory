# Nestory 开发指南

[产品首页](../README.md) · [技术架构](architecture.md)

## 本地开发

仓库锁定工具链：Go **1.27.3**、Node **26.9.0**、npm **11.19.1**。依赖由 `go.mod`、`go.sum` 和 `web/package-lock.json` 锁定。

前后端独立开发。两个终端分别运行：

```sh
# 终端一：纯 Go API，不依赖 Node 或 web/dist
APP_ADDR=127.0.0.1:8080 go run ./cmd/noteapp
```

```sh
# 终端二：React/Vite，/api 代理到本机 8080
npm ci --prefix web
npm run dev --prefix web
```

打开 [http://127.0.0.1:5173](http://127.0.0.1:5173)。独立镜像分别构建：

```sh
docker build -t noteapp:test .
docker build -t noteapp-web:test web
```

已有 `.env` 后，一条 `docker compose up -d --build` 命令可以构建并启动两个服务；首次安装与旧单容器切换见[部署说明](operations.md)。

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
docker build -t noteapp-web:test web
sh scripts/audit/run_browser.sh noteapp:test noteapp-web:test
NOTEAPP_TEST_IMAGE=noteapp:test NOTEAPP_TEST_FRONTEND_IMAGE=noteapp-web:test python3 -m unittest discover -s scripts/tests -p 'test_*.py'
```

也可通过 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 指定已有 Chromium。运维脚本要求 Python 3.9+，包含标准库 `sqlite3`。

## 源码提交与镜像打包

测试代码、可复用验证工具和 CI 保留在 Git 仓库中，便于开发者复现验证。`.env`、`.env.local`、`.env.production` 等真实配置由 `.gitignore` 排除，`.env.example` 等示例模板保留。完整目录职责与提交范围见[仓库结构与提交规则](repository.md)。

Docker 构建使用 `.dockerignore` 允许列表，只传入编译需要的 Go 源码、迁移 SQL、前端源码、公共静态资源和构建配置。Python 运维脚本、Go/前端测试、测试夹具、文档、设计稿、本机配置、`node_modules` 和旧 `dist` 不进入构建上下文。Dockerfile 同时显式复制这些必要路径，避免整仓库复制。新增生产源码目录或构建配置文件时，需要相应更新允许列表和 COPY 路径。

后端镜像仅包含编译后的 Go API 与运行依赖；前端镜像包含 Nginx 与构建后的页面资源。运行镜像均不包含 Python、Node 或测试脚本。上传源码与发布镜像使用不同范围；本机环境配置不参与镜像构建。

## 构建版本信息

前后端分别通过构建参数 `APP_VERSION` 记录各自发布标识。后端版本写入 Go 程序并通过 `/api/v1/config` 返回；前端版本写入页面与 `/version.json`；设置页分别展示两者。Compose 中 `APP_FRONTEND_VERSION` 可单独指定前端版本，未指定时沿用 `APP_VERSION`。普通 `go run` / `go build` 或未指定版本的镜像构建显示 `development`。

发布命令可以在宿主机自动读取 Git 标签或提交号，不需要将 `.git` 目录发送到 Docker：

```sh
build_version=$(git describe --tags --always --dirty)
docker build --build-arg APP_VERSION="$build_version" -t noteapp:local .
docker build --build-arg APP_VERSION="$build_version" -t noteapp-web:local web
```

也可显式传入 `APP_VERSION=v0.1.1`。标签／版本编号由发布时确定，应用不自动递增版本号。已跟踪文件存在未提交修改时，以上 Git 命令会追加 `-dirty`。修改 `.env` 中的 `APP_VERSION` 后，需要重新构建镜像才能生效；`docker compose up -d --no-build noteapp` 只启动已有镜像，其报告的版本保持为该镜像构建时的标识。

## 技术结构

Go 轻量模块化单体，普通构造函数组装依赖；React + TypeScript + Vite 前端，SQLite 保存业务数据，附件保存在同卷文件目录。前端与后端各自运行在非 root 容器中；前端 Nginx 托管页面并代理 `/api`，后端仅提供 API。SQLite 与附件仅挂载到后端。

```text
cmd/noteapp/          服务入口
internal/            业务模块、事务、HTTP适配与数据库
migrations/          SQLite迁移
web/src/             React界面与块编辑器
scripts/             备份、恢复、检查和性能探针
docs/                当前使用、架构、运维、开发文档和产品素材
.local/              按需生成的本机报告，不提交 Git
```

正文唯一存储格式为版本化块 JSON。HTTP 更新使用版本检查，跨对象关系与删除恢复有事务约束；创建请求支持幂等重试。编辑器按需加载，GET JSON 支持协商 gzip。完整技术说明见[架构文档](architecture.md)与[自定义属性 API](custom-properties-api.md)。


## 开发排错

Go工具链版本不匹配时检查 `go env GOROOT` 和 `go tool compile -V`；残留旧 `GOROOT` 时可尝试 `env -u GOROOT go test ./...`。

## 界面语言

设置页支持 `zh-CN`（默认）和 `en`，偏好仍使用浏览器的 `noteapp:settings:v1`，旧偏好缺少语言时回退到中文。界面组件通过 `web/src/i18n` 的 `useI18n()` 订阅语言；纯展示函数通过 `t()` 翻译系统文案，命名占位参数用于保留用户输入。新增系统文案需要同时加入对应英文 catalog。错误在显示边界用 `translateError()` 转换，后端 API、阶段、选项 ID 与筛选存储值保持原有协议。

仅系统标签和新建时的默认名称跟随语言；已有标题、正文、自定义属性及选项保持原文。FullCalendar、日期格式和排序使用当前界面语言，工作空间时区、周起始日和小时制仍由原有设置控制。BlockNote 切换词典、占位样式和节点展示时保留同一原生编辑器及文档状态，不重新创建正文、撤销历史或上传任务；输入法组合期间延后节点展示刷新。

英文 README 的实景截图、GIF 和 MP4 放在 `docs/assets/en/`，中文素材保留原目录。双语隔离演示数据及复现命令见[产品素材说明](assets/README.md)。
