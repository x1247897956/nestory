# 2026-10-28 视图体验验收

## 完成范围

1. 视图偏好：按项目/对象类型保存在当前浏览器。任务列表/看板沿用原有键，筛选条件不受影响；新增分组、阶段折叠、排序，日程日历/时间轴、周/月、查看日期，笔记排序。存储损坏或被禁用时回退默认并允许本次会话操作。
2. 甘特式日程时间轴：复用现有开始/结束与范围查询，周/月缩放、前后区间、今天、标题固定列、横向滚动、详情入口、加载/空/失败/只读状态。按应用时区计算日历日比例与半开边界，跨 DST 不把一天固定成 24 小时。
3. 统一详情：Task/Page/Event 共用 ObjectEditorHeader/Body/Footer；标题/菜单/属性均在 header 中，正文与保存/恢复提示顺序一致。EventEditor 从 Events 拆出，仍保留原导出兼容；各业务原有自动保存、恢复、父任务保护和只读逻辑保留。
4. 排序：任务默认顺序/标题/优先级/截止日期/创建/更新时间；笔记默认顺序/标题/创建/更新时间；时间轴开始/结束/标题/时长。升降序、空值始终最后、稳定 ID 兜底，不修改数组或数据库顺序。父子层级保持。
5. 任务阶段折叠：单独折叠和全部展开/收起，按项目记忆；收起阶段仍接受拖入，落下后展开。悬停保持现有无 React 整页重绘逻辑。

## 检查证据

- `task-display-red.log` / `task-display-green.log`：任务显示设置正规化测试先失败后通过。
- `unit.log`：21 文件、96 项前端测试通过；新增偏好隔离/禁用存储/连续更新、排序空值与稳定性、DST/裁剪、统一三类真实编辑器结构、笔记排序和日程偏好测试。
- `focused.log`：22 项浏览器专项通过，包括原有日历写入/时区、拖动恢复、菜单/属性，与新的排序、折叠拖入、详情一致、视图/日期/项目隔离、延迟配置和归档时间轴。
- `timeline-desktop.png` / `timeline-mobile.png`：1280px 与 390px 实际截图，含真实接口创建的跨日日程。已查看图片并验证手机文档无全局横向溢出；时间轴内部允许滚动。
- `browser-full.log`：最终候选镜像的完整 119 项浏览器回归全部通过（4.7 分钟），包括原有 114 项与本轮 5 项集成回归。
- `build.log` / `docker-build.log`：TypeScript/Vite 与 Docker 构建通过，仅原有大 chunk 提示。
- `operations.log`：10 项备份恢复/运维脚本测试通过。已有 Python ResourceWarning 未导致失败。
- 独立审查无确认阻断问题。补充验证了延迟配置不覆盖已存偏好、项目间不同日历日期/视图，以及折叠阶段拖入。

## 实现约束与限制

没有新增依赖、Go 业务代码或数据库迁移；本轮未重复 Go 单元测试，Docker 已重新编译 Go，浏览器使用真实临时 SQLite 的容器 API。偏好不跨浏览器/设备同步；时间轴本身不支持拖动改期、依赖连线、进度或自动排程，日历原有拖动改期保留。排序是视图选择，不新增手动重排写入。

工作区原有 Nestory 名称、图标及 design/、web/public/ 内容保留且不纳入本轮提交；本机镜像使用完整工作区。没有推送远程。

## 部署与数据核对

已部署 `noteapp:view-experience-20261028` 至 `http://127.0.0.1:18084`，沿用 Compose 项目/卷 `noteapp-v1-check`、Asia/Shanghai 时区。容器 Healthy，healthz、readyz、config、projects、workspace/today、trash、静态前端 7 项冒烟通过。

`backups/2026-10-28-before-view-experience` / `backups/2026-10-28-after-view-experience` 均校验成功，14 张表逐行一致，附件清单一致（data-comparison.log）。没有清理真实数据。

复现：`npm run build --prefix web`；`npm test --prefix web -- --run`；`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' sh scripts/audit/run_browser.sh noteapp:view-experience-20261028`。
