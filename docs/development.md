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
