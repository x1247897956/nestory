# Noteapp 第一版技术选型与架构

日期：2026-10-23。状态：开发建议；产品范围以 [产品设计](2026-10-23-noteapp-design.md) 为准。已确认 Go 后端、轻量模块化单体；以下具体库与实现细节为推荐方案。

## 1. 推荐组合

| 部分 | 选择 | 选择依据与边界 |
| --- | --- | --- |
| 后端 | Go、标准库 net/http、slog | 路由、JSON、日志采用标准库；使用普通构造函数传递依赖 |
| 数据访问 | database/sql + modernc.org/sqlite | 显式 SQL，避免引入 ORM；驱动不依赖 CGO |
| 数据库 | SQLite，本地持久化卷 | 单用户单实例；不把数据库放在网络共享文件系统 |
| 前端 | React + TypeScript + Vite | 浏览器单页应用，无 SEO、SSR 需求；构建产物由 Go 提供 |
| 导航与数据 | React Router + TanStack Query | URL 表示当前项目与对象；服务端数据缓存与编辑草稿分离 |
| 样式 | CSS Modules + CSS 变量 | 统一颜色、间距、字号；第一版不建设独立组件库 |
| Markdown 源码 | CodeMirror 6，React 包装 @uiw/react-codemirror | 支持编辑、选区和源码位置映射 |
| Markdown 预览 | react-markdown + remark-gfm + rehype-highlight | 支持检查清单、代码块；禁用原始 HTML，不启用 rehype-raw |
| 日历 | FullCalendar React，dayGrid/timeGrid/interaction | 周、月视图和选区创建；不采用资源排程等 Premium 功能 |
| 测试 | Go testing/httptest、Vitest、Testing Library、Playwright | 业务约束使用数据库集成测试；关键流程使用浏览器验收 |
| 交付 | 多阶段 Docker 构建 + Compose | Node 构建前端，Go 构建服务，运行时一个容器一个数据卷 |

版本策略：开发启动时选择彼此兼容的稳定版本，固定 Go/Node 工具链、容器镜像和依赖锁文件；本文不以浮动 latest 作为可重复构建方案。Go 需支持 1.22 引入的 ServeMux 路由能力，实际使用仍受支持且满足驱动要求的版本。依赖版本与许可清单在阶段 1 落盘。

选择 SQLite 是基于当前使用规模的工程判断。若未来出现多人高并发写入、多副本或独立数据库需求，再评估 PostgreSQL；显式 SQL 不意味着迁移数据库没有成本。

## 2. 运行与代码边界

浏览器 → 同源 /api/v1 → HTTP handler → 模块 service → SQL → SQLite。
静态前端和 /assets/{id} 也由同一个 Go 服务提供。附件内容位于数据卷，数据库仅存元数据。

```text
cmd/noteapp/main.go          读取配置、组装依赖、启动和优雅退出
internal/app/app.go         路由注册和模块组装
internal/platform/          config、database、httpx、clock、id
internal/project/           项目与归档
internal/task/              任务、子任务与阶段
internal/page/              页面树与移动
internal/event/             日程与时间区间
internal/relation/          三组双向关系
internal/asset/             附件上传与读取
internal/trash/             删除批次、预览和恢复事务
internal/workspace/         今日汇总、搜索与最近访问
migrations/                 按序执行的 SQL 迁移
web/src/app/                路由、布局与 API 客户端
web/src/features/           按 project/task/page/event 等组织页面
web/src/components/markdown/ 三类对象复用的编辑与预览
web/embed.go                内嵌 web/dist，构建前必须生成产物
web/e2e/                    关键流程浏览器测试
Dockerfile、compose.yaml、.env.example、README.md
```

每个业务模块按需设置 model.go、service.go、store.go、http.go；小模块不强制拆成四个文件。不建设通用 Repository、动态字段框架或事件总线。跨对象事务由 relation/trash 集中编排，使用同一事务连接完成校验和写入；模块不循环调用。

数据库打开时启用外键、WAL 和 busy timeout，初期限制单数据库连接，缩短写事务。一个事务内不再通过连接池发起查询，避免等待自身占用的连接。迁移记录版本并在事务内执行；失败退出启动，禁止半迁移继续运行。

## 3. 数据模型

ID 使用 crypto/rand 生成的 128 位随机值，以固定十六进制字符串存储，不依赖标题和路径。业务对象均含 id、created_at、updated_at、version；可删除对象含 deleted_at、delete_batch_id。时间戳统一 UTC，建议使用整数毫秒；截止日期使用 YYYY-MM-DD 字符串，不做 UTC 转换。

| 表 | 专属字段和约束 |
| --- | --- |
| projects | title、description、archived_at；标题去除首尾空白后非空 |
| tasks | project_id、parent_id、title、body、stage、priority、due_date、position |
| pages | project_id、parent_id、title、body、position |
| events | project_id、title、body、start_at、end_at；end_at > start_at |
| task_pages | project_id、task_id、page_id；主键 task_id/page_id |
| task_events | project_id、task_id、event_id；主键 task_id/event_id |
| page_events | project_id、page_id、event_id；主键 page_id/event_id |
| assets | id、project_id、original_name、storage_key、media_type、size、created_at |
| delete_batches | id、project_id、root_type、root_id、created_at |
| recent_visits | object_type、object_id、visited_at；类型仅 project/page |
| schema_migrations | version、applied_at |

Task 阶段存 todo/in_plan/in_process/done/cancelled，显示名称集中映射为 Todo/InPlan/InProcess/Done/Cancelled。priority 存 none/low/medium/high。没有 list 表：任务列表直接查询项目任务。

各业务表增加 UNIQUE(project_id,id)；父子和关联表使用带 project_id 的复合外键，防止跨项目引用。父任务必须无父任务、父对象必须存活、Page 不得形成环、归档只读等动态规则由服务在事务内检查。对象 project_id 创建后不可修改。

同级 position 使用整数；重排在事务内重写同级顺序，读取按 position、id 排序。Page 树遍历使用迭代方式或递归 CTE，不依赖 Go 调用栈深度。只返回平铺节点，由前端构建树。

索引：tasks(project_id,parent_id,position)、tasks(deleted_at,due_date,stage)、pages(project_id,parent_id,position)、events(project_id,start_at,end_at)，以及三组关系表的反向索引。

第一版搜索对标题和正文使用参数化 LIKE，转义用户输入中的 %、_ 与转义符，按更新时间和 ID 稳定排序、分页。中文按子串搜索，无分词依赖；数据量增长后再独立评估全文索引。

## 4. API 与写入规则

基础路径 /api/v1，JSON 使用 snake_case。错误统一为 {"error":{"code":"conflict","message":"内容已更新，请重新加载"}}；400 参数无效、404 对象不存在、409 版本/归档/父级冲突、413 上传过大、500 内部错误。内部错误不返回 SQL 或服务器路径。

| 接口 | 行为 |
| --- | --- |
| GET/POST /projects | 列表、新建；列表通过 archived 参数区分 |
| GET/PATCH /projects/{id} | 详情、修改，归档和取消归档经此入口 |
| GET/POST /projects/{id}/tasks、pages、events | 项目列表和新建；events 必须提供查询区间 |
| GET/PATCH/DELETE /tasks/{id}、/pages/{id}、/events/{id} | 对象详情、修改、软删除 |
| POST /pages/{id}/move | parent_id、position、version；校验循环和同项目 |
| POST /tasks/{id}/move | parent_id、position、version；最多一层子任务 |
| GET /{tasks,pages,events}/{id}/relations | 双向查询，包含已删除目标的占位信息 |
| PUT/DELETE /relations/{task-page,task-event,page-event}/{left_id}/{right_id} | 类型确定左右顺序；幂等增删关系 |
| POST /projects/{id}/assets | multipart 单文件上传，返回 id、url、名称、类型、大小 |
| GET /assets/{id} | 根据元数据读取持久化文件 |
| GET /workspace/today、/search、/recent | 全局汇总；搜索支持 include_archived 与分页 |
| POST /recent | 记录最近打开项目或 Page，服务校验对象存在 |
| GET /trash | 按删除批次列出，可查看批次成员 |
| GET /{tasks,pages,events}/{id}/delete-preview | 返回当前版本、影响数量与后代清单 |
| POST /trash/{batch_id}/restore | 事务恢复本批成员；祖先被删或项目归档时返回冲突 |
| GET /healthz、/readyz、/config | 存活、数据库可用状态、前端需要的时区等公开配置 |

PATCH 必须带 version；SQL 使用 WHERE id=? AND version=?，成功 version+1，匹配零行时返回冲突。归档状态检查和写入在同一事务完成。DELETE 带预览返回的根对象 version，并在事务内重新计算后代；若数量变化要求重新确认。关系重复添加成功且不重复插入，跨项目或已删除端点拒绝。

## 5. Markdown 保存与附件

正文防抖建议 800ms。每个对象最多一个保存请求在途；请求发出时捕获正文快照和版本，完成后若草稿继续变化，再保存最新草稿。旧请求响应不能覆盖新输入。409 时保留本地草稿，提供复制与重新载入入口，不自动覆盖服务器。

保存中、已保存、失败必须可见。路由离开和关闭标签页时检查未保存状态；切换源码/预览不清空草稿。勾选检查项按 Markdown AST 源码位置修改对应标记，不能通过全文字符串替换修改同文案的其他项；沿用相同保存队列，归档时不可勾选。

上传限制建议 20 MiB，可配置。流式限额写入数据目录内临时文件，使用生成的 storage_key，原文件名只用于展示。完成后原子改名，再写元数据；失败清理文件，崩溃留下的孤立文件暂保留，不自动删除。拒绝路径穿越，不以上传文件名拼接服务器路径。

图片只内联允许的位图类型；HTML、SVG 和其他附件作为下载处理，设置 Content-Disposition 与 nosniff。预览拒绝 javascript 等危险协议，默认禁用原始 HTML。局域网免登录仍应校验写入请求 Origin/Host，开发环境显式允许 Vite 来源，生产不启用任意来源 CORS。

## 6. 时间、删除与归档

部署时区 APP_TIMEZONE 默认 Asia/Shanghai，Go 镜像包含时区数据。前端所有输入/输出使用该时区，提交带明确偏移的 RFC3339；浏览器本地时区不能改变任务归属日期。日历时区适配在阶段 3 先做验证，使用 FullCalendar 官方时区适配方案。

今日日程匹配 start_at < next_day_start AND end_at > day_start，采用半开区间；当天零点结束的事件不算今天。日期上下界按部署时区求相邻日历日期后转 UTC，不固定加 24 小时。

删除事务只给原本未删除的根及后代赋本次 batch_id；早已删除的后代保持原批次。恢复只清除本批标记，保留关系。任一祖先仍删除则拒绝并返回所需先恢复的批次；不把子页面静默提升为根。所有写接口，包括附件、关系和恢复，统一拒绝归档项目写入。最近访问属于全局使用记录，可记录只读项目的访问，但默认工作台隐藏归档记录。

## 7. Docker 与数据恢复

数据目录 /data，数据库 /data/noteapp.db，附件 /data/assets。默认 Compose 将端口绑定 127.0.0.1；局域网部署通过配置显式更改绑定地址。生产单实例、非 root 运行，卷目录需可写。

第一版采用停机一致性备份：停止容器 → 完整归档 /data（包括存在的 WAL/SHM）→ 校验备份文件 → 启动容器。不要运行中只复制 noteapp.db。恢复到空数据卷、使用相同应用版本启动，验证数据库完整性、对象数量、关系和附件，再执行升级迁移。备份清单记录应用版本、schema 版本与文件校验和。

数据库迁移前执行同样备份；第一版不承诺自动降级数据库。日常日志输出 stdout，不记录正文和附件内容。请求超时、恢复 panic、优雅关闭和上传错误应有明确日志。

## 8. 扩展边界

阶段枚举与终结语义集中定义，未来自定义阶段增加阶段定义表；固定字段不转任意 JSON。自定义字段未来单独定义和值表。第一版不预建团队权限、协同编辑、Redis、队列、微服务或通用工作流引擎。

## 9. 核对来源

以下是能力核对来源，推荐组合和业务规则是本项目的工程决策。具体依赖版本在开发启动时锁定。

- [Go 1.22 路由增强](https://go.dev/doc/go1.22)：标准库路由方法与路径参数能力。
- [React 从零构建应用](https://react.dev/learn/build-a-react-app-from-scratch)：Vite 等构建工具与自行承担路由、数据获取的边界。
- [SQLite 适用场景](https://www.sqlite.org/whentouse.html)：本地应用数据库和高并发写入限制。
- [modernc SQLite](https://pkg.go.dev/modernc.org/sqlite)：Go 驱动和工具链兼容要求。
- [CodeMirror React 包装](https://github.com/uiwjs/react-codemirror)：CodeMirror 6 集成。
- [react-markdown](https://github.com/remarkjs/react-markdown)：Markdown 预览与插件边界。
- [FullCalendar React](https://fullcalendar.io/docs/react)：React 日历集成；使用时按锁定主版本核对插件与 API。
