# 2026-10-27 拖动反馈修复验证

## 已撤销范围

撤销未提交、未部署的任务摘要查询实验，包括 TaskSummary 后端只读模型、查询接口、装配与前端摘要 DTO。已提交的列表/看板视图保留。当前任务接口仍使用完整 Task，没有数据库迁移、依赖调整。

## 根因与修改

1. 旧实现等待 PATCH 及整列表 GET 完成才移动任务。改为取消已有列表查询后即时更新本地阶段；PATCH 返回后使用服务器完整 Task 和版本覆盖缓存，成功路径不再重新读取完整列表。
2. 旧实现插入“正在更新阶段”段落，使内容纵向跳动。改用现有工具栏说明位置。
3. 悬停目标切换通过 React 状态让整页重绘。现仅修改目标元素的视觉类，拖动结束/离开/落下移除。
4. 列表重复扫描父子任务。建立按 ID/父 ID 索引；看板的拖入校验改用集合。
5. 失败通过单任务 GET 校正，涵盖已写入但 ACK 丢失；读取也失败时恢复原任务并触发列表重新校验。服务器 CAS 规则保留，不假造版本、不自动重复写入。

## 验证证据

- `red.log`：旧镜像 task-views-20261027，在 PATCH 被阻塞时任务未移动，新增回归断言失败。
- `focused.log`：列表/看板两项延迟保存回归通过，包含落下立即移动、内容顶部坐标不变、成功路径零额外列表 GET。
- `unit.log`：14 文件、71 项通过。
- `operations.log`：10 项通过。Python 3.15 有已有 sqlite 连接 ResourceWarning，未导致失败。
- `build.log`：TypeScript + Vite 构建通过。保留已有大 chunk 提示；没有修改打包策略。
- `browser-full.log`：独立临时数据卷中 107 项浏览器检查全部通过（4.2 分钟），包括新增延迟保存、丢响应连续修改及已有 500/409、父子独立、归档、自动保存回归。
- 独立代码审查：无阻断发现；补充了失败恢复确认成功后的关联/工作台缓存更新。

## 限制

这是交互反馈和渲染路径优化，没有声称降低服务器写入耗时，也没有量化大型任务集的 CPU/帧率收益。保存期间仍串行化阶段修改以保留 CAS 一致性。工作区原有 Nestory 品牌、图标修改不属于本次提交；本地容器构建使用当前完整工作区。

## 本地部署与数据核对

- 镜像 `noteapp:drag-performance-20261027` 已重建并部署至 `http://127.0.0.1:18084`，Compose 项目/卷保持 `noteapp-v1-check`，时区保持 Asia/Shanghai。
- `deploy.log`：容器 Healthy；healthz、readyz、config、projects、workspace/today、trash 和静态前端全部通过。
- `backup-before.log`、`backup-after.log`：升级前后备份均经校验，位于 `backups/2026-10-27-before-drag-performance` 和 `backups/2026-10-27-after-drag-performance`。
- `data-comparison.log`：14 张表逐行一致，包括 recent_visits，附件清单一致。没有清理本机业务数据。
- 后端/数据库源文件与原提交相同，本轮未重复运行 Go 测试；Docker Go 编译及真实容器 API 浏览器测试已执行。

复现：`npm test --prefix web -- --run`；`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' sh scripts/audit/run_browser.sh noteapp:drag-performance-20261027`。专项可在脚本末尾 npm 命令追加 `-- e2e/drag-responsiveness.spec.ts`。
