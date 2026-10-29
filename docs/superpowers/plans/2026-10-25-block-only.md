> 历史设计/实施记录：保留当时范围与验证结果。当前界面、正文格式及功能请以[现行产品说明](../../current-product.md)为准；旧Markdown三模式、多层笔记界面等描述不代表当前行为。

# Block-only正文 Implementation Plan

> **For agentic workers:** Use subagent-driven-development for independent frontend, migration tooling and test work. Keep the backend contract below binding.

**Goal:** 任务/笔记/日程只持久化、接收和返回`body_document`，不再存储Markdown正文或旧原文。

**Architecture:** 保持现有模块化单体和三类对象事务。schema7一次性校验/迁移全部对象（含回收站），移除`body`与`legacy_body`列。非空旧Markdown先在停机数据库副本上用已锁定BlockNote解析器生成准备表，Go迁移验证源摘要、文档结构后原子消费；未准备时拒绝启动、不丢数据。搜索直接从JSON text与附件name提取，不保存正文副本。Markdown仅用于客户端导入/导出。

- [x] 写块唯一正文契约与schema6→7真实SQLite迁移测试，先观察失败。
- [x] 修改document.Apply、三类服务/对象DTO；新建默认空块，元数据更新保留块，拒绝旧body字段。
- [x] schema7校验/原子迁移；搜索从块JSON获取文本，保留分页/归档/删除规则。
- [x] 前端只保留块草稿及提交字段，去掉旧原文/Markdown投影；错误恢复复制JSON。
- [x] 准备迁移脚本使用当前BlockNote+jsdom，生成带源SHA256的准备表，拒绝覆盖已有准备数据；测试标题、嵌套、清单、表格、代码、附件和重试。
- [x] 更新测试夹具为块输入，执行Go test/race/vet、frontend build/unit、完整E2E。
- [x] 原实例停机备份→干净恢复卷→准备迁移→新镜像启动→逐条对比块/元数据/关联/附件→新备份干净卷恢复；通过后原卷同流程升级。
- [x] 更新README/操作说明/验收记录，本地提交，不推送。

API contract: 请求只接受`body_document:{version:1,blocks:[...]}`（可省略则新建空文档/更新保留原文档）；响应总是非null。`body`和`legacy_body`不再输出或接受。事务、版本及归档/层级约束不变。

Migration staging contract: SQLite表`block_migration_prepared(object_type TEXT, object_id TEXT, source_sha256 TEXT, body_document BLOB, PRIMARY KEY(object_type,object_id))`。仅`body_document IS NULL`且`body != ''`的行必须有准备结果，摘要=旧`body`UTF8 SHA256小写hex。已有JSON不重新转换。空Markdown自动转换空blocks。所有旧行包括软删除都迁移；任何无效/缺失/源变化使整个schema7回滚。准备表成功迁移后删除。

验证进展：文档Apply新签名先观察编译失败，再实现通过；迁移测试首次暴露NULL扫描进json.RawMessage问题，改为[]byte后通过。Go test/race/vet、前端build/unit26/26、Node准备脚本4/4、完整E2E29/29通过。E2E首轮28/29：跨周日程出现两个片段，改为限定当天单元格后重跑通过。schema6→7隔离卷演练完成，87份文档/元数据/关联/12附件校验一致，schema7空卷恢复和三类编辑器打开通过。

正式卷同流程升级完成，迁移前后最终备份和逐条对比通过；Docker运维9/9通过；独立审查无重要发现。详情见`docs/implementation/2026-10-25-block-only.md`。
