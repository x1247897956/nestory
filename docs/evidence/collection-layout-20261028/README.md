# 2026-10-28 列表页布局与排序器

## 修改

- 三类对象列表页改为共用 CollectionHeader，标题/数量/新建操作同一行，视图/工具在下一行；外层 padding、标题字号、按钮高度统一。任务筛选和排序位于同一工具区。移除仅任务页有的进入位移动画，避免布局起点暂时偏移。
- 排序改为与筛选相似的锚定弹层：属性/方向作为草稿，点击“应用排序”才生效；关闭、Escape、外部点击取消草稿。已生效条件以标签显示，可编辑和移除恢复默认。保留单规则 SortSpec、原有按项目记忆与排序算法。
- 三处排序器按 projectId 重建，避免浏览器前进/后退时将旧项目未应用草稿带入另一项目。
- 日历按时间格子展示，没有意义的排序入口不显示；时间轴仍支持排序器。没有修改业务 API、数据库或依赖。

## 证据

- `red.log`：旧镜像无统一列表头，几何回归预期失败。
- `focused.log`：12 项专项通过，覆盖三页实际标题/工具栏位置高度、移动端宽度、排序草稿/应用/取消/重置、偏好记忆、视图切换、折叠与拖动、日历日期/时区与归档。
- `unit.log`：22 文件、99 项通过。新增排序器单元测试覆盖未应用草稿、编辑/重置、Escape/焦点、原生轻关闭、失效/空属性。
- `browser-full.log`：最终镜像完整 122 项浏览器回归全部通过（4.6 分钟），包含本轮三页几何布局、排序草稿交互和浏览器历史项目切换三项回归。
- `build.log` / `docker-build.log`：前端/容器构建通过，保留已有大 chunk 提示。
- `operations.log`：10 项运维脚本检查通过，已有 Python ResourceWarning 保留。
- `sorter-mobile.png` / `collection-mobile.png`：390px 实际截图，已查看；弹层与页面无全局横向溢出。
- 独立审查发现项目切换草稿隔离问题，已通过 key 修复，并增加原生历史切换回归。

## 范围

统一的是列表页外层标题、操作和工具区，列表/看板/日历/时间轴内容保持各自的展示方式。排序器目前一个属性+方向，不提供多级排序。草稿不是业务正文，不触发未保存正文离开确认。Go 业务未改，本轮未重复 Go 单元测试；容器重新编译 Go，浏览器连接真实临时 SQLite API。

工作区原有品牌、图标、design/、web/public/ 改动保留且不纳入本次提交；本机镜像包含完整工作区。

## 本机部署

已部署 `noteapp:collection-layout-20261028` 到 `http://127.0.0.1:18084`，沿用 `noteapp-v1-check` 项目/数据卷和 Asia/Shanghai 时区。容器 Healthy，7 项 API/静态前端冒烟通过。升级前后备份均已校验，目录 `backups/2026-10-28-before-collection-layout` / `backups/2026-10-28-after-collection-layout`。14 张表逐行一致，附件清单一致（data-comparison.log），没有清理业务数据。

复现：`npm run build --prefix web`；`npm test --prefix web -- --run`；`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' sh scripts/audit/run_browser.sh noteapp:collection-layout-20261028`。
