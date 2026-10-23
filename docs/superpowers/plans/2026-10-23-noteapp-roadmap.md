# Noteapp 分阶段开发计划

> **For agentic workers:** 后续实施使用 executing-plans 按阶段执行；需要并行工作时再选择 subagent-driven-development。阶段使用 checkbox 跟踪。

**Goal:** 交付可在本机或局域网自部署的个人项目、任务、Markdown 笔记和日程软件。

**Architecture:** Go 轻量模块化单体，普通构造函数组装依赖。React 单页前端与 API 同源部署，SQLite 和本地附件共用持久化卷。

**Tech Stack:** Go net/http、database/sql、modernc.org/sqlite；React、TypeScript、Vite、CodeMirror、react-markdown、FullCalendar；Docker Compose。

**Spec:** [产品设计](../specs/2026-10-23-noteapp-design.md)；[技术设计](../specs/2026-10-23-noteapp-technical-design.md)。

## Global Constraints

- 单人、本机或受信任局域网、免登录；一个 Go 服务实例。
- 一个项目只有一个任务列表；Task、Page、Event 均且仅属于一个项目。
- 固定五阶段，一层子任务，父子阶段独立；Page 无产品层级上限，禁止循环。
- 三组关系仅限项目内，多对多、双向一致；不提供跨项目移动。
- 三类对象共用 Markdown；Event 独立存在，时间不自动同步到 Task。
- 归档项目只读；软删除按批次恢复，不永久删除、不自动回收附件。
- 默认 Asia/Shanghai；截止日期为日期，日程为明确时间区间。
- 数据库与附件持久化，交付经过实际恢复验证的备份说明。

本文件是用户要求的分阶段交付路线图，定义范围、依赖和验收门槛；不是整套软件的逐行代码脚本。每阶段开工时按其接口与验收用例细化为实施任务，代码和实际命令结果写入阶段记录。当前没有应用代码，各项均未完成。

## 阶段依赖与检查方式

依次完成 1 → 2 → 3 → 4 → 5。每阶段产出可操作页面，不只交付数据库或接口。阶段结束保留可重复的验收数据和命令；只有验收通过才勾选完成。耗时取决于实际编辑器和日历集成结果，不把估时作为验收条件。

代码目录以技术设计第 2 节为准。业务测试使用临时磁盘 SQLite，不用 mock 替代数据库事务。浏览器测试使用独立临时数据目录，不污染日常数据。

## 阶段 1：项目与任务闭环

**文件范围：** cmd/noteapp/main.go、internal/app/app.go、internal/platform/{config,database,httpx,clock,id}/、internal/project/、internal/task/、migrations/001_core.sql、web/src/app/、web/src/features/{project,task}/、web/e2e/tasks.spec.ts、Dockerfile、compose.yaml、.env.example、README.md。

**接口：** /healthz、/readyz、/config；/projects、/projects/{id}；/projects/{id}/tasks、/tasks/{id}、/tasks/{id}/move。定义错误响应、version 和归档写保护，后续模块复用。

- [x] 记录 Go/Node 版本、依赖版本与许可证，生成 go.mod/go.sum 和前端锁文件；创建本地 Git 仓库并提交文档与骨架，不配置远程或发布。
- [x] 写迁移、连接配置和临时数据库测试；健康检查区分进程存活与数据库可用。
- [x] 用集成测试先覆盖：空标题拒绝、日期格式无效拒绝、五阶段自由切换、非法阶段拒绝、同项目父子、孙任务拒绝、父子阶段独立。
- [x] 完成项目侧栏、新建/修改项目、任务列表、分组/筛选、任务详情、一层子任务、优先级和截止日期。Task 正文先使用受控源码输入，阶段 2 替换为共享编辑器。
- [x] 实现乐观版本和事务内归档检查；两个标签页先后更新同一版本，后提交收到 409，草稿仍在。
- [ ] 完成单容器构建和持久化卷；提供 go run ./cmd/noteapp 与前端开发命令。
- [x] 执行 go test ./...、go vet ./...，前端 npm run typecheck、npm test -- --run、npm run build；执行 tasks.spec.ts。

**验收场景：** 创建“毕业设计”项目，添加“读论文”父任务和“读摘要”子任务；完成父任务后子任务仍为 Todo；刷新和重建容器后内容保留；第三层任务和跨项目父级被拒绝。项目归档后普通修改返回 409，取消归档后可以继续编辑。

**阶段门槛：** 页面可独立使用，数据通过真实数据库持久化；本阶段不暴露尚未实现的删除按钮。


## 阶段 2：页面树、Markdown 与附件

**文件范围：** internal/page/、internal/asset/、migrations/002_pages_assets.sql、web/src/features/page/、web/src/components/markdown/{MarkdownEditor,MarkdownPreview,useAutosave}.tsx（hook 使用 .ts）、web/src/components/markdown/markdown.css、web/e2e/notes.spec.ts。

**接口：** /projects/{id}/pages、/pages/{id}、/pages/{id}/move；/projects/{id}/assets、/assets/{id}。PATCH 使用正文快照和 version，附件返回稳定 URL。

- [x] 先写真实数据库测试：多层页面、同级排序、移入自身/后代拒绝、跨项目父级拒绝；深层遍历不依赖调用栈。
- [x] 完成页面树和稳定 ID 路由，支持新建子页面、改名、选择父页面和调整顺序；不要求首版实现拖拽。
- [x] 实现源码、预览、分屏，共用 CodeMirror 与 Markdown 预览；将 Task 描述切到同一组件。
- [x] 先写编辑器行为测试：重复检查项只改指定项；代码围栏内的 - [x] 不作为可勾选任务；禁用脚本与危险协议。
- [x] 实现 800ms 防抖和串行保存队列。模拟请求延迟、500、断网与 409，确认旧响应不覆盖新输入；离开编辑页提示未保存。
- [x] 完成限额流式上传、随机存储名、图片展示与附件下载；测试同名文件、超限、路径穿越文件名、HTML/SVG 下载响应。
- [x] 执行 go test ./...、前端类型检查/单元测试/构建和 notes.spec.ts，验证重启后图片及下载链接有效。

**验收场景：** 创建 A → B → C 页面树，尝试将 A 放到 C 下应失败。输入中文、代码块、两个同名检查项和图片，切换分屏不丢稿；只勾选第二项。保存失败后保留全文，重试成功。上传失败有明确反馈。

**阶段门槛：** 笔记和任务正文可日常使用；本阶段仍不暴露删除入口。

## 阶段 3：独立日程与项目内关联

**文件范围：** internal/event/、internal/relation/、migrations/003_events_relations.sql、web/src/features/{event,relation}/、web/e2e/calendar-relations.spec.ts。

**接口：** /projects/{id}/events?from=...&to=...、/events/{id}；三类详情的 /relations；/relations/{kind}/{left_id}/{right_id}。from/to 为带偏移的 RFC3339 半开区间，限制单次查询不超过 366 天。

- [ ] 先做日历小验证：周视图、月视图、中文、跨日事件、浏览器时区与部署时区不同时的输入展示；固定同主版本插件与时区适配依赖。
- [ ] 写日程区间测试：结束不晚于开始拒绝、相邻区间不相交、跨日命中、允许重叠。创建 Event 不要求关联 Task。
- [ ] 完成点选时间段新建、日程详情与 Markdown 描述；第一版通过表单改时间，拖拽调整不作为验收要求。
- [ ] 创建三张关联表与正反向索引，编写复合外键与服务校验测试；重复 PUT 幂等，跨项目与已删除端点拒绝。
- [ ] 完成共享关联选择器，展示 Page 路径、Task 阶段、Event 时间；任一端增删后刷新另一端缓存。
- [ ] 执行 go test ./...、前端类型检查/单元测试/构建和 calendar-relations.spec.ts。

**验收场景：** 在“毕业设计”创建“讨论方案”Event，关联“实验方案”Page 和“执行实验”Task；从三端都能看到关系，任一端移除后另一端一致。修改日程时间不改任务截止日期；尝试关联其他项目失败。

**阶段门槛：** 时间判断与三组关系经过数据库和浏览器双重验证。

## 阶段 4：今日工作台、搜索、回收站与归档体验

**文件范围：** internal/workspace/、internal/trash/、migrations/004_workspace_trash.sql、web/src/features/{workspace,search,trash}/、web/e2e/workspace-trash.spec.ts；补齐所有已有模块的软删除与只读展示。

**接口：** /workspace/today、/search、/recent、/trash、三类对象 /delete-preview、DELETE 对象、/trash/{batch_id}/restore。归档入口复用阶段 1 接口。

- [ ] 注入 Clock，固定部署时区计算日界线；测试今日截止、逾期、终结阶段排除、已完成父任务下的未完成子任务、跨日 Event、归档排除。
- [ ] 完成今日工作台，展示项目与父任务来源；记录最近访问项目/Page，过滤删除和默认隐藏的归档对象。
- [ ] 完成标题与正文参数化子串搜索、类型标识、Page 路径、分页与 include_archived；测试中文、%、_ 和空查询。
- [ ] 先写删除批次事务测试：先删除 C，再删除祖先 A，恢复 A 不恢复 C；关系保留；被删祖先未恢复时拒绝恢复子对象；归档项目拒绝恢复。
- [ ] 完成删除范围预览、数量变化后的再次确认、批次回收站和恢复操作；已删除关联显示占位。
- [ ] 检查归档只读覆盖任务、页面移动、正文检查项、日程、关联、附件与恢复；界面禁用与服务拒绝保持一致。
- [ ] 执行 go test ./...、前端类型检查/单元测试/构建及 workspace-trash.spec.ts；复跑与新增删除逻辑直接相关的前三阶段浏览器场景。

**验收场景：** 固定今天为 2026-10-23 Asia/Shanghai，创建 10-22、10-23、10-24 截止任务和跨越零点的日程；工作台分类正确。归档项目后内容隐藏且直接调用写 API 被拒绝。按先删后代、再删祖先的顺序恢复，确认恢复范围严格按批次。

**阶段门槛：** 产品设计的功能性范围全部具备，危险边界由事务保证。

## 阶段 5：备份恢复与第一版交付

**文件范围：** scripts/backup.sh、scripts/restore.sh、scripts/smoke.sh、docs/operations.md、docs/acceptance-v1.md、README.md；完善 Dockerfile、compose.yaml、.env.example。

**接口：** 不增加产品业务 API。脚本接收明确的数据卷、备份路径和镜像版本；恢复目标必须为空，禁止覆盖现有数据。

- [ ] 完成停机备份脚本，失败也应尝试恢复原服务运行状态；生成版本清单和 SHA-256 校验和。不要将运行中复制单个数据库文件作为备份方案。
- [ ] 在全新卷恢复真实验收数据，检查 PRAGMA integrity_check、foreign_key_check，核对项目/对象/关系数量及每个附件校验和。
- [ ] 验证重建容器、优雅退出、数据卷权限、无写权限错误、上传限额、异常 JSON、迁移失败时停止启动。
- [ ] 从新的浏览器上下文跑完整流程：项目 → 笔记 → 子任务 → 日程关联 → 工作台 → 归档 → 删除恢复 → 重建 → 备份恢复。
- [ ] 执行 go test ./...、go test -race ./...、go vet ./...，前端 npm run typecheck、npm test -- --run、npm run build、npx playwright test，及 docker compose config、docker compose build。
- [ ] 在 acceptance-v1.md 逐条记录产品设计第 11 节的操作、实际结果、应用版本和证据路径；记录限制与安装/升级/恢复步骤。

**交付门槛：** 在干净环境仅按 README 能启动；容器重建不丢数据；备份恢复后的正文、双向关联和附件可用。测试命令未执行或工具不可用时明确记录，不标记验收通过。

## 需求覆盖核对

| 产品设计内容 | 实施阶段 |
| --- | --- |
| 项目、单任务列表、五阶段、一层子任务 | 1 |
| Markdown 三模式、检查清单、Page 树、上传与保存错误 | 2 |
| 独立 Event、周/月视图、跨日与三组双向关联 | 3 |
| 今日/逾期、最近访问、搜索 | 4 |
| 归档只读、删除占位、按批次恢复 | 1 建立写保护，4 完成全对象与界面 |
| 容器持久化、备份恢复、干净环境验收 | 1 建立部署，5 完成恢复演练 |
| 自定义阶段/字段扩展边界 | 技术设计集中记录，不纳入第一版功能 |

## 当前交接点

产品设计与技术设计可作为阶段 1 输入。下一项实际工作是建立项目骨架并完成项目与任务闭环。开发时先核对安装工具链和依赖兼容性，再写代码；本路线图未执行任何应用测试，也未声称功能已经实现。
