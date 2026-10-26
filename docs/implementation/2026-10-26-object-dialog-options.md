# 居中对象详情与分层设置

用户确认：仅精简重复的本地空间文案，不清理实际项目/对象数据。

- 任务/笔记/日程使用居中原生详情对话框。地址仍可直达/刷新，底层保留对应列表或日历，背景显式 inert/aria-hidden。
- 顶部项目名/对象类型/对象名逐级导航；移除返回链接和外部重复标题；正文内保留可改名标题。
- BlockNote 默认浮层、自定义侧边菜单和斜杠菜单使用对话框内部 portal，避免原生 top-layer 遮挡。
- 默认属性均提供SVG图标，统一名称列与值内容的起点；阶段不再单独向左突出圆点。
- 属性设置仅改名/删除自定义属性；选项行悬停/键盘聚焦的三点菜单管理选项名称、颜色和删除，触屏常显入口。
- 删除属性或选项必须明确确认共享范围与不可撤销性。仅自定义定义能匹配删除接口；固有属性不可删除。
- 删除属性事务内删除该类型所有值（含回收站）及定义。删除选项事务内归一引用值，空值null，仅受影响值版本递增，原生对象版本不变；无数据库迁移。
- 旧版属性设置里的未完成选项草稿保留原恢复键/数据形状，提示复制再载入，不静默忽略丢弃。

审查修复：选项删除/同步过程中锁定所有值修改入口；显式重新加载以新定义/新选项快照初始化，防止旧名称覆盖新名称；删除已应用但值刷新失败时维持锁定，提供同步重试，避免丢弃后来输入。

真实临时 SQLite 验证删除清理、回收站值、版本隔离、归档/CAS/固有属性保护，以及注入晚期错误时整笔回滚。详情容器与后端独立审查无新问题；全量审查发现的并发风险已修复并增加浏览器用例。

## 验证记录

- 前端构建通过；Vitest 14文件、71测试通过。
- `go test -race -count=1 ./...` 与 `go vet ./...` 通过。
- 运维测试10项通过（独立卷备份/恢复）；Python 3.15输出现有SQLite连接ResourceWarning，测试退出码0。
- 首次完整浏览器回归84通过、2失败：关联菜单Escape连带关闭详情（已阻止默认取消及冒泡）；删除确认定位器在双层对话框中不唯一（改为精确名称）。最终全量结果见下。
- 所有破坏性测试在独立数据库/卷中执行。本机正式卷在部署前备份，不用于删除测试。

最终完整浏览器回归：86/86通过（3.8分钟），见browser-final.log；包括新增6项居中详情/选项职责/并发与响应丢失回归。截图为task-dialog.png、note-dialog.png、event-dialog.png。构建包含既有大chunk提示，未新增依赖。

部署候选：`noteapp:object-dialog-20261026`，镜像 `sha256:6a30e383cb7a9b26dd69ba82cbe7c5c9326bfc4b746b05a57272a2e12ac53779`。

验证期间工作区另外出现web/index.html、web/public/icon.svg与App品牌文字改动，保留但不纳入本次提交；验证/部署镜像为上述已测试版本。

## 本机更新与数据核对

- `docker compose -p noteapp-v1-check up -d --no-build --force-recreate --wait` 成功，复用原卷`noteapp-v1-check`，端口18084、Asia/Shanghai、允许主机配置不变。
- `scripts/smoke.sh --url http://127.0.0.1:18084`：7/7通过。
- 前后备份：`backups/2026-10-26-before-object-dialog`、`backups/2026-10-26-after-object-dialog`，均校验通过。
- 逐行比较14张表全部相同（含58条最近访问），附件清单完全相同；见data-comparison.log。未删除正式数据。
- 保留已知范围：属性类型不可转换；跨类型复用复制定义，此后独立管理。属性/选项删除经确认后不可撤销；对象软删除/按批次恢复行为不变。

复现：`npm test --prefix web -- --run`、`npm run build --prefix web`、`go test -race -count=1 ./...`、`go vet ./...`；`NOTEAPP_TEST_IMAGE=noteapp:object-dialog-20261026 python3 -m unittest discover -s scripts/tests -p 'test_*.py'`；`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' sh scripts/audit/run_browser.sh noteapp:object-dialog-20261026`。后两者只使用独立测试容器/卷。
