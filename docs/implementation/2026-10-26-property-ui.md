> 历史设计/实施记录：保留当时范围与验证结果。当前界面、正文格式及功能请以[项目介绍](../../README.md)为准；旧Markdown三模式、多层笔记界面等描述不代表当前行为。

# 自定义属性交互调整

目标：保留黑白与深蓝的界面语言，参考 Notion 属性的名称/值结构、标签选择和 URL 直接打开行为，改善当前表单拼接的体验。
参考：https://www.notion.com/help/database-properties

- [x] 属性按名称和值逐行对齐，长名称截断、完整名称保留在可访问名称中。
- [x] 单选、多选使用可搜索的轻量弹层；直接创建选项并选中，支持键盘。
- [x] URL 默认显示可点击链接；单独编辑入口，保留 HTTP(S) 校验。
- [x] 精简设置层级，保留自动保存、冲突输入与恢复操作。
- [x] 浏览器回归及桌面/窄屏视觉检查。
- [x] 备份后更新本机容器并核对持久化数据。

数据模型及接口未改动。选项创建沿用定义版本锁；并发更新时读取最新定义，按名称复用或在最新选项列表追加，避免覆盖其他设置。值保存仍使用独立版本锁。

## 验证结果

- 前端单元测试：14 个文件、71 项通过。
- TypeScript + Vite 构建通过；保留原有大包体提示，本次无依赖变更。
- 全套浏览器回归：73/73 通过（独立 Docker 容器和数据卷，18187）。
- 最终设置同步修正后，属性专项再次 7/7 通过，覆盖直接创建/多选、URL 点击及编辑、共享定义并发更新、独立值、草稿冲突和恢复、归档只读。
- 检查 390px、773px、1261px。截图记录在 `docs/evidence/property-ui-20261026/`。
- 视觉检查发现直接创建选项后旧设置组件仍显示旧列表；现在仅在设置无草稿、无保存请求、无错误时，重新打开设置载入当前定义。未保存输入与错误状态继续保留。

复现：`npm test --prefix web -- --run`；`npm run build --prefix web`；`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' sh scripts/audit/run_browser.sh noteapp:property-ui-20261026`。

## 本机部署

镜像 `noteapp:property-ui-20261026`，ID `sha256:fa9b996f6d3a856bac037a49a422ef4af482c51b5961b6b1e6b504d4a671abdb`。
继续使用 `noteapp-v1-check` 数据卷及 `127.0.0.1:18084`，schema9 不变。
更新前后备份：`backups/2026-10-26-before-property-ui`、`backups/2026-10-26-after-property-ui`。
7 项冒烟检查通过；两份备份均通过完整性验证，14 张表逐行及附件清单完全一致。
本次仅调整前端，没有新增数据库迁移或依赖。
