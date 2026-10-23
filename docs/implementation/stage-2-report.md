# 阶段 2 实施报告

日期：2026-10-24。依据 stage-2-brief、产品设计与技术设计；从 e973ada 延续，保持阶段 1 项目/任务流程与无删除入口。

## 完成内容

- 事务迁移 002：pages、assets 与索引、页面同项目父级复合外键。稳定随机 ID；页面新建、读取、正文快照 PATCH、移动接口。迭代沿祖先检查自身/后代环，返回平铺节点；前端用显式栈构树，无递归调用栈依赖。移动事务重排新旧同级 position，相关版本递增。
- 项目页增加页面入口、树与编辑区，支持任意层子页、新建父级选择、标题改名、稳定路由、选择父级和数字顺序移动。归档只读同时覆盖服务端与界面。
- Task/Page 共用 CodeMirror 6、react-markdown、remark-gfm、rehype-highlight，提供源码/预览/分屏。默认跳过原始 HTML，危险协议由 Markdown URL 转换器阻断；图片只显示本应用资源地址。预览检查项按 AST 源码 offset 修改对应标记；代码围栏中的清单不生成可勾选项，勾选不改任务阶段。
- 共享 800ms 防抖队列：每个对象最多一个在途请求，捕获内容快照/version；成功只推进基线与版本，不覆盖新草稿。失败停止自动请求，显式重试；409 保留全文、复制和确认重新载入。应用内离开及 beforeunload 检查未保存内容。
- 附件按流限额写临时文件，检测内容类型，随机存储 key、原子改名与事务元数据；失败清理，原名不拼接路径。默认 20 MiB，可由 APP_UPLOAD_LIMIT 字节数配置，Compose/.env/README 已同步。稳定 `/api/v1/assets/{id}`；仅 PNG/JPEG/GIF/WebP 内联，其他文件 attachment，nosniff 和 CSP sandbox。上传按钮插入 Markdown；失败可见。
- 新依赖固定版本、lock 与许可/integrity 清单同步；不新增 Go 依赖。

## 实际验证

| 检查 | 结果 |
| --- | --- |
| `go test ./...` | 通过；新增真实临时 SQLite 页面与附件测试 |
| `go vet ./...` | 通过 |
| `npm run typecheck` | 通过 |
| `npm test -- --run` | 4 文件、13 测试通过 |
| `npm run build` | 通过；Vite 提示主 bundle 较大（约 1.30 MB，gzip 423 KB） |
| `tasks.spec.ts notes.spec.ts` | 真实 Brave Chromium/Go/SQLite 合跑 2/2 通过（9.1 秒）；后续新增离开保护/上传 413 场景的 notes 单跑通过（9.7 秒） |
| npm install audit | 0 vulnerabilities |
| Go 进程停止/重新启动附件验证 | 同数据目录重新启动，PNG/中文文本下载逐字节一致 |
| 视觉检查 | 实际查看 `/tmp/noteapp-stage2.png`，树、标题、正文预览和移动表单可见 |

测试先落盘再实现：页面/附件服务缺失时编译红灯；重复检查项/HTML 与 autosave hook 缺失时前端红灯；移动旧同级重排测试实际发现位置空档，修复后绿灯；围栏高亮测试实际失败后接入高亮插件。

SQLite 用例覆盖三层、自身/后代/跨项目拒绝、旧同级重新排序、2000 层祖先循环检测、同名不同存储 key、路径穿越拒绝、流式超限、HTML/SVG attachment、PNG inline、数据库重开下载、归档上传拒绝。前端用例覆盖同名第二项定位、围栏不勾选、危险协议/HTML、串行延迟、旧响应保新输入、500/断网/409保全文与关闭保护。既有任务冲突、归档、重新载入失败和后台刷新失败回归全部保留；逻辑单测为 CodeMirror 使用受控 textarea 测试替身，真实 CodeMirror 输入由 Playwright 覆盖。

浏览器场景实际创建 A→B→C，拒绝 A 移到 C；中文、围栏、重复清单分屏只勾选第二项；自动保存刷新、模拟500重试、拒绝离开保稿、413上传失败提示、图片预览、HTML安全下载、无删除按钮。任务双标签409及父子独立阶段回归通过。

进程重启验证使用 `/tmp/noteapp-stage2` 二进制与临时数据目录，上传后 SIGTERM 并等待退出，再启动同目录读取稳定 URL。PNG SHA256 `d126d616641d42ac8b0a07ec302c9fa1ec049f86200931a0a60c8f3080284b77`；中文文本 SHA256 `7660e5346a97046619ccd0e320941ae46b57a4fd323a090820436215e7689748`。验证脚本 `/tmp/noteapp-stage2-restart.py`，进程均已停止。

命令环境沿用阶段1：`env -u GOROOT GOPATH=/tmp/noteapp-go GOCACHE=/tmp/noteapp-go-cache GOMODCACHE=/tmp/noteapp-go/pkg/mod`；npm cache `/tmp/noteapp-npm`；Playwright 设置 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'` 并按已授权方式在沙箱外启动。

## 边界与限制

本阶段没有删除、日程、关系、回收站；409 不自动覆盖服务器，需用户复制/重新载入处理。图片预览仅限本应用上传的安全位图；外站图片不加载。附件不自动回收孤立文件。主 bundle 大小为当前明确性能限制，可后续按编辑器/高亮拆包。

正式 Docker build 由主线程维护；本报告只声明本阶段已完成的本机进程重启持久化，不将其作为容器重建检查。路线图仅勾选阶段2已实际通过项目，阶段1待验的正式容器构建项未改动。
