# 架构清理

目标：让正式应用、前端语言与辅助工具的边界清晰；清除已替代的实现，不修改业务接口或数据库。

- [x] 基线Go/API与前端测试，确认旧Markdown预览器仅被其旧测试引用。
- [x] 后端New只组装依赖，按业务域注册路由；服务器保护及静态资源单独管理，原接口与事务不变。
- [x] 前端共享目录使用editor命名，按需加载组件明确为LazyBlockEditor；移除旧MarkdownPreview及其专有依赖，保留Markdown导入导出。
- [x] 构建/单测/API race/vet、全浏览器及备份恢复回归；核实最终容器不需要Python/Node。
- [x] 更新内部架构与工具目录说明、审查、备份、本机部署、数据核对和本地提交。

技术选择：保留Go模块化单体、专用SQLite服务和普通构造函数，不为SQL建立空泛Repository或增加服务。Python是主机维护工具，标准库实现归档、SHA和SQLite离线检查；不重写成熟脚本以追求表面语言统一。TS/TSX统一为TypeScript；Shell/JS工具不计作前端实现。
