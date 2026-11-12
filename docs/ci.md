# 仓库持续集成

[CI 工作流](../.github/workflows/ci.yml) 在推送到 `main`、提交目标为 `main` 的 Pull Request，以及从 GitHub Actions 手动运行时执行。同一分支的新运行会取消旧运行。

## 检查内容

1. **Select checks**：比较 PR 的 base、push 的 before 与当前代码，选择受影响组件；手动运行、无法取得 base、共享配置或未知文件变化时执行完整检查。删除和重命名也纳入比较。
2. **Frontend checks**：只安装 Node/npm 与锁定依赖，运行类型检查、前端单元测试和构建，不需要 Go。
3. **Backend checks**：只安装 Go，检查格式、vet、竞态与随机顺序测试，不需要 Node、前端 dist 或先构建页面。
4. **Tooling checks**：检查 CI 选择逻辑和迁移工具。
5. **Image and Chromium checks**：相关基础检查通过后，分别构建两个测试镜像并注入提交版本，执行 Python 运行时、双服务 Compose 测试和现有 Chromium 回归。
6. **CI result**：汇总所选检查，允许未受影响任务跳过；任何必选任务失败、取消或意外跳过都不能报告成功。分支保护可选择此项作为统一必需检查。

| 改动 | 前端基础检查 | 后端基础检查 | 双服务联调 |
| --- | --- | --- | --- |
| web/ 源码、依赖或镜像配置 | 运行 | 跳过 | 运行 |
| Go、SQL、后端 Dockerfile | 跳过 | 运行 | 运行 |
| Compose、环境模板、CI 或未知构建文件 | 运行 | 运行 | 运行 |
| scripts/ 维护与测试工具 | 跳过 | 跳过 | 运行，另执行工具检查 |
| README、docs/、设计素材 | 跳过 | 跳过 | 跳过 |

前端 `package.json` 或锁文件变动还会运行工具检查，因为旧库迁移解析器依赖其中锁定的 BlockNote 与 jsdom。

联调需要前后端两个镜像，由各自 Docker 构建缓存减少重复编译；这与另一侧单元测试是否运行是两件事。前端镜像构建上下文为 web/，后端上下文排除前端，两个构建均可独立执行。

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
gofmt -l cmd internal migrations
go vet ./...
go test -race -shuffle=on -count=1 -cover ./...
node --test scripts/tests/prepare-block-migration.test.mjs

docker build --build-arg APP_VERSION="$(git rev-parse HEAD)" -t noteapp:ci .
docker build --build-arg APP_VERSION="$(git rev-parse HEAD)" -t noteapp-web:ci web
NOTEAPP_TEST_IMAGE=noteapp:ci NOTEAPP_TEST_FRONTEND_IMAGE=noteapp-web:ci python3 -m unittest discover -s scripts/tests -p 'test_*.py'
npm exec --prefix web -- playwright install --with-deps chromium
TZ=Asia/Shanghai CI=true sh scripts/audit/run_browser.sh noteapp:ci noteapp-web:ci
```

`gofmt -l` 应没有输出。浏览器检查使用本机 `18187` 端口，请先确保该端口空闲。测试镜像标签与真实部署镜像应分开，测试期间不需要启动部署目录中的 Compose 服务。
