# 2026-10-27 任务筛选器验证

范围：按已确认方案完成任务筛选器，列表/看板共用 AND 条件、项目隔离的本机偏好，支持标题/阶段/优先级/截止日期与文本/网址/单选/多选自定义属性。不包含阶段折叠、时间轴、OR/嵌套或命名视图。

## 实现

- `filterEngine.ts`：纯函数验证和匹配；文本不区分大小写；空值与空数组统一；单选用选项 ID，多选任意/全部/不包含。
- `useTaskFilters.ts`：按项目持久化和读取，拒绝损坏或超限结构，存储失败保留会话操作。按应用时区调度午夜刷新，窗口重新聚焦/进入任务视图刷新相对日期。
- `TaskFilters.tsx`：锚定弹层，编辑完成点击应用才改变列表；标签编辑/移除、条件计数、清除入口，原生 popover 的 Escape/外部点击行为，小屏限制宽高。无匹配与加载失败分开；失效属性/选项需要显式移除/重选。
- `GET /api/v1/projects/{id}/property-snapshot/{type}`：一个 SQLite 读事务内获取定义和稀疏值图，排除已删除对象；允许归档读取，类型 allowlist，项目参数化 SQL，无 N+1、无 schema 变化。
- 自定义属性编辑沿用现有 object 查询失效机制，筛选快照随其刷新。任务正文/阶段写入 API 未改动。

## 测试过程

- `api-red.log`：新接口实现前 404 的预期失败。
- `engine-red.log`：引擎模块实现前的失败；之后 5 项规则测试通过。
- `midnight-red.log`：真实浏览器中离开任务页、跨午夜再返回，旧日期结果错误；补激活时钟刷新后由最终完整回归验证。
- `focused.log`：14 项专项通过，包括默认/自定义组合、项目/视图隔离、刷新恢复、错误重试、删除属性/选项、跨午夜、存储不可用、已有看板/拖动恢复。
- `mobile.png`：390px 宽度实际截图，弹层没有溢出。
- 独立审查发现日期跨午夜、失效多选无法取消两处问题，均补实现和实际浏览器回归。日期语义明确为区间两端包含、早于/晚于严格比较。

## 最终检查

- `browser-full.log`：最终镜像在独立临时卷中的 114 项浏览器回归全部通过（4.4 分钟），包含 7 项筛选浏览器回归与原有 107 项功能回归。
- `unit.log`：15 文件、76 项前端单元测试通过。
- `go-test.log`：`env -u GOROOT go test ./...` 通过；真实临时 SQLite 验证作用域、显式 null、软删除/恢复和归档读取。
- `go-race.log`：`go test -race ./internal/app ./internal/customproperty` 通过。
- `go-vet.log`：`go vet ./...` 无输出、退出 0。
- `operations.log`：10 项运维脚本测试通过。
- `build.log`、`docker-build.log`：前端及单容器构建通过。现有 chunk 提示保留。

复现：`npm test --prefix web -- --run`；`env -u GOROOT go test ./...`；`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' sh scripts/audit/run_browser.sh noteapp:task-filters-20261027`。

## 限制

筛选在前端对当前完整项目任务列表计算；自定义属性另取一份批量快照，不承诺大规模数据分页。偏好保存在当前浏览器，不跨设备同步。筛选属性不包含父任务/关联对象/正文；后续可扩展。已有大 JS chunk、Node deprecation 与 Python ResourceWarning 不属于本功能修复范围。

## 本地部署

最终镜像 `noteapp:task-filters-20261027` 已部署到 `http://127.0.0.1:18084`，沿用 Compose 项目/卷 `noteapp-v1-check` 和 Asia/Shanghai 时区。容器 Healthy，7 项 API/静态前端冒烟通过（deploy.log）。

升级前后备份均校验通过，目录 `backups/2026-10-27-before-task-filters` / `backups/2026-10-27-after-task-filters`；逐表比较 14 张表一致，附件清单一致（data-comparison.log）。没有清理业务数据。没有推送远程。

工作区原有 Nestory 品牌、图标、design/ 和 public/ 内容保留，不纳入本次提交；本机镜像包含当前完整工作区的界面内容。
