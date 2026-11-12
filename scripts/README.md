# 维护工具与开发验证

正式应用由独立 Go API 与 Nginx 前端两个服务提供，Compose 可统一部署。普通部署只需要 Docker Compose 与 .env，见[部署说明](../docs/operations.md)。本目录用于维护和开发验证，不进入运行镜像，也不随应用启动执行。

~~~text
scripts/
├── operations.py                离线备份、恢复和运行检查
├── prepare-block-migration.mjs  旧 Markdown 数据库迁移准备
├── tests/                      自动化回归，由 CI 执行
├── audit/                      按需发布、容量、故障与升级验证
└── media/                      产品演示素材复现
~~~

| 范围 | 必要性 | 是否提交 Git |
| --- | --- | --- |
| operations.py | 在线导出有容量限制；完整卷离线恢复还可用于应用无法启动时 | 是 |
| prepare-block-migration.mjs | 升级旧库时复用与前端一致的锁定解析器 | 是 |
| tests/ | 验证归档安全、备份恢复、运行边界、Compose 和迁移准备 | 是 |
| audit/ | 常规测试之外的性能、真实磁盘故障、跨版本恢复和系统包检查 | 是 |
| media/ | 用隔离演示数据重新生成 README 产品截图和视频 | 是 |
| 日志、性能 JSON、原始截图帧、真实备份 | 本机执行产物 | 否；放入 .local/ 或 backups/ |

## 维护入口

Python 工具只使用标准库，无需 pip 依赖：

~~~sh
python3 scripts/operations.py --help
python3 scripts/operations.py backup --help
python3 scripts/operations.py restore --help
python3 scripts/operations.py smoke --url http://127.0.0.1:8080
~~~

Windows 可将 python3 替换为 py。备份和恢复参数见[部署说明](../docs/operations.md)，旧库操作见[迁移说明](../docs/migrations/legacy-markdown.md)。

## 自动化测试

五个 Python 测试文件分别覆盖：

- test_archive.py：WAL 快照、归档路径安全和连接释放。
- test_backend_performance.py：性能样本、中位数和 p95 统计。
- test_backup_restore.py：完整卷恢复、篡改拒绝和失败后恢复运行状态。
- test_runtime.py：真实构建版本、启动失败、非 root 权限、上传限制和退出。
- test_compose_deployment.py：双服务编排、代理、显式时区配置及独立更新后的数据保留。
- test_ci_changes.py：CI 路径选择与共享配置、删除和重命名的回归。

Node 的 prepare-block-migration.test.mjs 使用真实锁定的 BlockNote 解析器验证迁移准备。命令和镜像准备步骤见[开发指南](../docs/development.md)与[CI 说明](../docs/ci.md)。

专项工具用途见[audit 说明](audit/README.md)。Python 在此承担工具和测试职责；.mjs / .cjs 是 Node 模块格式，前端仍使用 TypeScript。
