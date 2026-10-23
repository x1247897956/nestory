# 阶段 1 实施报告

日期：2026-10-24。范围以 stage-1-brief 和两份已确认设计为准。阶段 1 源码已实现并完成本机/浏览器/容器运行与持久化验证；正式多阶段 Docker build 的基础镜像下载仍在后台，故路线图该项保留未勾选，由后续最终交付检查补验。

## 实现

- Go 标准库 net/http，普通构造函数依赖注入；project/task 服务、平台 config/database/httpx/clock/id、随机128位ID、UTC毫秒元数据。
- SQLite 001迁移，版本记录与事务；外键/WAL/busy_timeout/单连接；任务项目与父级复合外键。
- `/api/v1` 存活、就绪、配置、项目CRUD中的新建读取修改与归档、任务新建读取修改与move。没有删除接口和按钮，也没有阶段2以后的产品入口。
- 标题、日期、五阶段、优先级校验；同项目一层父子、父子独立阶段、顶层含子任务不能降为子任务；版本条件更新与事务内归档写保护。归档项目仅允许明确取消归档。
- React/TypeScript/Vite、React Router、TanStack Query，项目侧栏、新建/修改、归档切换、任务分组筛选、详情、优先级日期、一层子任务创建展开；受控Markdown源码，显式保存、失败重试/复制/载入、离开确认。正文共享预览和自动保存留待阶段2。
- 编辑草稿与缓存分离：项目弹窗绑定打开时version；任务409保留草稿；后台project/task刷新500有缓存时不卸载编辑器；手动重新载入失败不重挂载草稿。
- 完整多阶段Dockerfile、固定镜像digest、Compose命名卷、非root运行、健康检查、配置示例、开发及停机备份恢复说明、Go与npm锁和许可元数据。

## 实际验证

| 检查 | 实际结果 |
| --- | --- |
| `go test ./...` | 通过；app业务集成3组、database迁移/pragma/重开持久化1组 |
| `go vet ./...` | 通过 |
| `go test -race ./...` | 通过（后续仅增加归档空PATCH检查，同步逻辑无变化） |
| `npm run typecheck` | 通过 |
| `npm test -- --run` | 2文件、5测试通过；冲突保稿、归档禁写、手动重载失败、项目version快照、后台刷新失败 |
| `npm run build` | 通过，静态产物由Go内嵌 |
| `npm audit` / `npm audit --omit=dev` | 更新修复版后均0漏洞 |
| `tasks.spec.ts` | Playwright 1/1通过，实际Brave Chromium、2个标签页、真实Go和SQLite，8.3秒总运行 |
| 页面视觉检查 | `/tmp/noteapp-stage1.png` 实际截图，项目/列表/详情可读，布局无裁切 |
| 正式 `docker build -t noteapp:local .` | 已实际执行，三镜像成功解析；基础层慢下载仍进行中，未宣称通过 |
| 替代Linux runtime镜像构建 | 通过，`noteapp:stage1-runtime` |
| 替代运行镜像删除/重建与命名卷 | 通过，UID10001，项目/正文/父子/Done父Todo子保留 |

Go 命令实际使用：

```sh
env -u GOROOT GOPATH=/tmp/noteapp-go GOMODCACHE=/tmp/noteapp-go/pkg/mod GOCACHE=/tmp/noteapp-go-cache go test ./...
env -u GOROOT GOPATH=/tmp/noteapp-go GOMODCACHE=/tmp/noteapp-go/pkg/mod GOCACHE=/tmp/noteapp-go-cache go vet ./...
env -u GOROOT GOPATH=/tmp/noteapp-go GOMODCACHE=/tmp/noteapp-go/pkg/mod GOCACHE=/tmp/noteapp-go-cache PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' npm run e2e --prefix web -- tasks.spec.ts
```

浏览器验收实际创建“毕业设计”带时间戳项目、读论文父任务、读摘要子任务；完成父任务后API确认子任务Todo；刷新正文保存；第三层409；双标签先后写入第二次409且草稿仍可见；归档只读、取消归档可写、无删除按钮。Go另覆盖跨项目父级409、非法阶段日期、所有五阶段自由切换、过期版本409、move层级约束、异常Origin403、DB关闭后ready503但health200。

容器替代验证命令：本机 `GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -trimpath -o /tmp/noteapp-linux ./cmd/noteapp`，用临时Dockerfile把同一个二进制放入正式相同digest的Alpine并创建UID10001；`docker run -p 127.0.0.1:18081:8080 -v noteapp-stage1-check:/data ...` 后API创建数据，`docker rm -f`，再次运行同卷并断言正文和父子阶段。生成project ID `0532d549c933e400ed0d624edcc4f358`、parent `7c1b6e78f3435e95c39d4f622361c0be`、child `c66b25e8c67e2bea5e0479281ece31ba`。测试容器已移除，测试卷保留。此为开发验证，不代替正式多阶段构建检查。

## 问题定位与限制

- 环境Go报告1.27.1但遗留GOROOT指向1.25.12，首次编译版本错配；去掉该进程环境变量后通过，未更改全局设置。
- 默认npm/Go缓存不可写，改/tmp缓存。npm首次registry idle timeout，限时重试成功。
- 初始API回退路由method与GET静态路由冲突导致ServeMux panic，已修并通过测试。
- 初始Vitest没有cleanup导致测试间DOM残留，显式afterEach cleanup修复；浏览器精确label选择失败，显式aria-label修复。
- Chromium下载速度慢，改用已有Brave；沙箱禁止浏览器进程启动，使用经批准的提权执行后通过。
- 初始依赖audit有公告，已固定到Router7.18.4、Vite7.3.7、Vitest4.1.12修复版，锁文件与许可表同步。
- 先落盘业务测试再实现，初始红灯受缺少go.sum/环境工具链影响；后续审查修复的version/reload/归档空PATCH均观察到实际行为红灯后修复。
- 当前为单人单实例免登录应用；普通部署使用README正式Compose命令。附件、页面、日程、关联、回收站、工作台均不在本阶段。
- 正式完整Docker构建尚需后台下载完成后重建最新源码并验证；不可将替代runtime检查描述为该构建已通过。
