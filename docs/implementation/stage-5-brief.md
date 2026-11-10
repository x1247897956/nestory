> 历史设计/实施记录：保留当时范围与验证结果。当前界面、正文格式及功能请以[项目介绍](../../README.md)为准；旧Markdown三模式、多层笔记界面等描述不代表当前行为。

## 阶段 5：备份恢复与第一版交付

**文件范围：** scripts/backup.sh、scripts/restore.sh、scripts/smoke.sh、docs/operations.md、docs/acceptance-v1.md、README.md；完善 Dockerfile、compose.yaml、.env.example。

**接口：** 不增加产品业务 API。脚本接收明确的数据卷、备份路径和镜像版本；恢复目标必须为空，禁止覆盖现有数据。

- [x] 完成停机备份脚本，失败也应尝试恢复原服务运行状态；生成版本清单和 SHA-256 校验和。不要将运行中复制单个数据库文件作为备份方案。
- [x] 在全新卷恢复真实验收数据，检查 PRAGMA integrity_check、foreign_key_check，核对项目/对象/关系数量及每个附件校验和。
- [x] 验证重建容器、优雅退出、数据卷权限、无写权限错误、上传限额、异常 JSON、迁移失败时停止启动。
- [x] 从新的浏览器上下文跑完整流程：项目 → 笔记 → 子任务 → 日程关联 → 工作台 → 归档 → 删除恢复 → 重建 → 备份恢复。
- [x] 执行 go test ./...、go test -race ./...、go vet ./...，前端 npm run typecheck、npm test -- --run、npm run build、npx playwright test，及 docker compose config、docker compose build。
- [x] 在 acceptance-v1.md 逐条记录产品设计第 11 节的操作、实际结果、应用版本和证据路径；记录限制与安装/升级/恢复步骤。

**交付门槛：** 在干净环境仅按 README 能启动；容器重建不丢数据；备份恢复后的正文、双向关联和附件可用。测试命令未执行或工具不可用时明确记录，不标记验收通过。

