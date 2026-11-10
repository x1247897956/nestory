> 历史设计/实施记录：保留当时范围与验证结果。当前界面、正文格式及功能请以[项目介绍](../../README.md)为准；旧Markdown三模式、多层笔记界面等描述不代表当前行为。

# 阶段 3 实施报告

日期：2026-10-24。需求依据：stage-3-brief、产品设计与技术设计。代码从 9680c03 延续；实施期间协调者另提交了阶段审查文档。未修改 progress，未实现阶段 4 的删除、回收站或 workspace。

## 实现

- 事务迁移 003：独立 events 表，UTC 整数毫秒时间、非空标题、`end_at > start_at` CHECK、项目时间区间索引；三张关联表带复合外键、去重主键与反向索引。普通构造函数显式传 SQLite 依赖，无新增 Go 依赖。
- Event 的创建/读取/带 version PATCH 与项目区间 API。RFC3339 必须带明确偏移；区间半开，`start_at < to AND end_at > from`；单次不超过 366×24 小时。允许重叠与跨日，创建无需 Task。归档检查与写入同事务。
- FullCalendar 默认周，支持月、今天、中文、跨日按实际区间分段、点选日期或时间段创建；详情通过表单修改时间。统一部署时区，官方 luxon3 命名时区适配；FullCalendar 全部插件固定 6.1.19，Luxon 3.7.2。锁文件及许可/integrity 清单同步。
- Event 使用 Task/Page 的共享 CodeMirror/Markdown 与串行 800ms 自动保存。失败保留草稿、重试/复制/确认重新载入；详情及新建表单都有应用内离开与 beforeunload 保护。
- 三组关系集中事务校验，同项目且两端存活，归档拒写；PUT/DELETE 幂等，双向查询同一条记录。共享选择器可按标题搜索，展示 Page 路径、Task 阶段、Event 部署时区起止；任端关系变化统一失效所有关系缓存；元数据变化刷新相关候选与关系。
- 增加只读 `/projects/{id}/relation-options`：候选仅同项目未删除对象，Event 不受日历查询窗口限制，可关联任意日期日程；Page 路径迭代构造。该候选 API 不改变受 366 天约束的日历区间 API。

## 实际验证

| 检查 | 实际结果 |
| --- | --- |
| `go test ./...` | 通过，真实临时 SQLite 测试；既有 Task/Page/Asset 均回归 |
| `go vet ./...` | 通过 |
| `npm run typecheck` | 通过 |
| `npm test -- --run` | 6 文件、19 项通过 |
| `npm run build` | 通过；主 bundle 约 1.65 MB / gzip 525 KB，Vite 大包提示仍在 |
| `calendar-relations.spec.ts notes.spec.ts tasks.spec.ts` | 真实 Brave / Go / SQLite 合跑 **5/5** 通过，28.0 秒 |
| 浏览器不同区验证 | 独立 America/Los_Angeles、Europe/London context，部署 Asia/Shanghai，两者都通过 |
| 视觉检查 | 实际查看 `/tmp/noteapp-stage3-Los_Angeles.png`：中文周视图、跨日两段、部署时区详情与归档只读可见 |
| 安装 audit | 0 vulnerabilities（本次安装快照） |

SQLite 直接约束验证覆盖结束不晚于开始、三组跨项目复合外键；服务验证覆盖相邻区间不相交、跨日命中、允许重叠、366 天边界/越界、stale version、三组幂等及正反读删、三类端点分别软删后关联拒绝、归档拒写、Page 完整路径。数据库原迁移数量断言 2→3，并增加数据库重新打开后仍仅三条迁移的幂等检查；这是阶段 3 迁移所需的最小既有测试兼容调整。

测试先行记录：Event/Relation SQLite 测试在服务缺失时实际红灯；新增 HTTP 测试先因缺失 routes 得到 405；时区函数和 Event 编辑器测试先因缺模块红灯，再实现并验证。既有全量 Go 首次执行定位到硬编码迁移计数，修正上述兼容断言后全绿。浏览器验证覆盖月视图点选独立“讨论方案”、周视图跨日两段/起止、Markdown 自动保存刷新、Page 路径与 Task 阶段、三组从不同端添加/移除并转端检查、标题搜索仅同项目候选、改 Event 时间不改 Task 截止日期、跨项目 API 拒绝、归档 Event 与关系只读。既有 notes 的 Markdown/上传/树及 tasks 的子任务独立阶段、冲突和在途导航保护均重新通过。

## 审查修复与限制

协调者审查发现两项 P2，均补实际红灯再修复：

1. 仅改正文时分钟表单会抹去 API 时间的秒，并可能改变 DST 回拨原偏移。现未编辑的时间原 RFC3339 原样提交；只转换用户实际改变的时间字段。新增秒级正文保存单测与两个浏览器场景；新增 America/New_York 回拨 `-05:00` 原偏移保持测试。手动编辑输入按分钟精度，跳时中不存在的时间和回拨中出现两次的无偏移时间明确报错，保留草稿，不静默猜偏移。
2. 新建日程表单缺少草稿导航/关闭保护。新增 `data-dirty` 和 beforeunload；浏览器回归先实际 2/2 失败（离开没有提示），修复后 LA/London 均验证拒绝离开保留标题、关闭事件被取消，创建成功后可正常进入详情。

当前单用户候选选择器一次加载项目全部元数据，超大项目的分页与按需检索尚未实现。拖拽调时间不在本阶段验收范围。没有删除、workspace、回收站 UI；软删除测试仅通过测试 SQL 标记来验证现有端点规则。Docker 正式构建与容器重建由协调者处理，本报告不将本机验证代称容器验证。

命令使用 `env -u GOROOT GOPATH=/tmp/noteapp-go GOCACHE=/tmp/noteapp-go-cache GOMODCACHE=/tmp/noteapp-go/pkg/mod`；npm cache `/tmp/noteapp-npm`。Playwright 使用已授权沙箱外 Brave：`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'`。未推送远端。
