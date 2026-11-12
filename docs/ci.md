# 仓库持续集成

[CI 工作流](../.github/workflows/ci.yml) 在推送到 `main`、提交目标为 `main` 的 Pull Request，以及从 GitHub Actions 手动运行时执行。同一分支的新运行会取消旧运行。

## 检查内容

1. **Source checks**：按 `web/package.json` 和锁文件安装 Node、npm 与前端依赖，运行 TypeScript 检查、前端单元测试和生产构建；按 `go.mod` 安装 Go，检查 Go 格式，运行 `go vet`、带竞态检测与随机顺序的 Go 测试，以及迁移工具的 Node 测试。先生成前端产物，再测试依赖内嵌资源的 Go 程序。
2. **Image and Chromium checks**：源码检查通过后构建 Docker 镜像，将当前提交的完整 SHA 注入 `APP_VERSION`；运行 Python 镜像与部署工具测试，再使用现有 Chromium 用例验证应用。测试创建独立容器和数据卷，并在结束后清理。

工作流仅使用 Chromium，不进行跨浏览器矩阵验证。CI 的 `TZ=Asia/Shanghai` 用于固定测试日期，与用户部署电脑的时区配置无关。镜像在临时 runner 中使用，不推送镜像仓库、不连接本机应用、不更新现有数据，也没有定时任务或自动部署步骤。

Playwright 固定使用 1.60.0，包含 Node 26 下浏览器 ZIP 解压挂起的[上游修复](https://github.com/microsoft/playwright/pull/40747)。浏览器安装步骤限时 5 分钟，避免依赖安装异常时耗尽整项任务的时间。

GitHub Actions 使用只读仓库权限，第三方 Action 固定到完整提交 SHA。依赖缓存用于缩短后续运行时间。Chromium 失败时保留 HTML 报告、失败截图和追踪文件，保存 7 天，可从对应运行页面的 Artifacts 下载。

## 在本地复现

准备 `go.mod`、`web/package.json` 指定版本的 Go、Node、npm，以及 Docker 和 Compose 插件后，在仓库根目录执行：

```sh
npm ci --prefix web --no-audit --no-fund
npm run typecheck --prefix web
npm run test --prefix web -- --run
npm run build --prefix web
gofmt -l cmd internal migrations web/embed.go
go vet ./...
go test -race -shuffle=on -count=1 -cover ./...
node --test scripts/tests/prepare-block-migration.test.mjs

docker build --build-arg APP_VERSION="$(git rev-parse HEAD)" -t noteapp:ci .
NOTEAPP_TEST_IMAGE=noteapp:ci python3 -m unittest discover -s scripts/tests -p 'test_*.py'
npm exec --prefix web -- playwright install --with-deps chromium
TZ=Asia/Shanghai CI=true sh scripts/audit/run_browser.sh noteapp:ci
```

`gofmt -l` 应没有输出。浏览器检查使用本机 `18187` 端口，请先确保该端口空闲。测试镜像标签与真实部署镜像应分开，测试期间不需要启动部署目录中的 Compose 服务。
