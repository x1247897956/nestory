# 2026-10-28 笔记筛选验收

## 行为

笔记列表在现有工具栏中加入与任务一致的筛选器：标题、创建/更新时间、四类自定义属性；AND 组合，显式应用，条件标签编辑/移除、清除、空结果和重试。按项目/对象类型保存偏好，任务原有存储键、字段及行为保留。与笔记排序组合，打开/关闭详情后保持条件，归档仍允许筛选但不允许编辑。

最小扩展既有 filterEngine/useTaskFilters/TaskFilters，不另写一套属性匹配逻辑；使用已有 pages 属性快照 API，属性编辑通过 object 前缀缓存失效刷新快照。创建/更新时间为 Unix 毫秒，按应用时区转换成日期；绝对和相对日期条件均等待时区，避免先以 UTC 错误匹配。

## 检查

- `red.log`：新增笔记字段/日期测试在实现前失败；`engine.log`：7 项引擎测试通过。
- `unit.log`：22 文件、101 项前端单元测试通过。
- `focused.log`：14 项专项浏览器检查通过，包含笔记的标题+自定义组合、排序、刷新/项目/类型隔离、绝对日期时区等待、快照失败/属性删除恢复、归档、小屏，以及现有任务筛选/视图回归。启动探针首次瞬时空响应后重试成功，测试退出 0。
- `browser-full.log`：最终镜像完整 125 项浏览器回归全部通过（4.7 分钟）。
- `operations.log`：10 项运维脚本检查通过。
- `mobile.png`：390px 实际截图已检查，无全局横向溢出。
- `build.log` / `docker-build.log`：前端和 Docker 构建通过，仅保留已有 chunk 提示。
- 独立审查无可执行问题，确认任务兼容性、时区门控、错误/空值区分、属性缓存失效和自动保存刷新路径。

没有新增依赖、Go 业务代码或 schema；本轮不重复 Go 单元测试。最终浏览器使用真实临时 SQLite API，容器重新编译 Go。笔记筛选不包含正文全文（可用搜索）；不新增 OR/嵌套条件，偏好仅当前浏览器。

工作区原有品牌/图标及 design/、web/public/ 内容保留，不纳入本次提交；本机镜像包含当前完整工作区。

## 部署

已部署 `noteapp:note-filters-20261028` 到 `http://127.0.0.1:18084`，沿用 Compose 项目/卷 `noteapp-v1-check` 与 Asia/Shanghai 时区。容器 Healthy，7 项 API/静态前端冒烟通过。升级前后备份已校验（`backups/2026-10-28-before-note-filters` / `backups/2026-10-28-after-note-filters`）；14 张表逐行一致、附件清单一致。未清理真实数据，未推送远程。

复现：`npm test --prefix web -- --run`；`npm run build --prefix web`；`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' sh scripts/audit/run_browser.sh noteapp:note-filters-20261028`。
