> 历史设计/实施记录：保留当时范围与验证结果。当前界面、正文格式及功能请以[项目介绍](../../README.md)为准；旧Markdown三模式、多层笔记界面等描述不代表当前行为。

# Block-only 正文迁移准备工具

`node scripts/prepare-block-migration.mjs --database /absolute/path/to/stopped-copy.db --offline`

这是维护窗口中的离线准备步骤。必须停止全部应用进程，先备份数据库，再在可丢弃的数据库副本上运行。数据库使用 WAL 时，须通过 SQLite backup 或既有备份/恢复流程取得一致副本，不能只复制仍在写入的 `.db` 文件。`--offline` 表示操作者已经确认停机；脚本无法可靠识别闲置的应用进程。它还使用零等待的 `BEGIN EXCLUSIVE`，遇到冲突锁立即失败；WAL 模式下独占事务并不排斥所有读者，因此锁不能代替停机确认。

使用仓库指定的 Node 26.9.0，在 `web` 中按已提交 lockfile 安装依赖（`npm ci`）。脚本直接加载 `web/node_modules` 内的 `@blocknote/core` 0.56.0 和 jsdom 27.0.1，不下载包，不使用其他 Markdown 解析器，并核对安装的 BlockNote 版本与 `web/package.json` 精确版本一致。转换调用与正文编辑器相同的 `BlockNoteEditor.create()` 默认 schema 和 `tryParseMarkdownToBlocks()`；没有对 Markdown 格式、嵌套结构或附件地址做额外改写。Markdown 导入本身的语义以该锁定版本的编辑器为准，例如图片生成 image 块，普通文件链接仍为 link 行内内容。

脚本仅生成下面的准备表，不改写原对象、不删除旧列、不提升 schema 版本：

```sql
CREATE TABLE block_migration_prepared(
  object_type TEXT,
  object_id TEXT,
  source_sha256 TEXT,
  body_document BLOB,
  PRIMARY KEY(object_type,object_id)
);
```

`object_type` 为 `tasks`、`pages` 或 `events`。每个对象中仅 `body_document IS NULL AND body != ''` 的行参与准备，包括软删除对象。已保存 JSON 的对象完全跳过，空字符串由 Go 的 schema7 迁移直接转成空 blocks。摘要是原 `body` UTF8 字节的 SHA256 小写十六进制；BLOB 是 `{ "version": 1, "blocks": [...] }` 的 UTF8 JSON。

所有准备写入在同一个事务内提交。成功输出 `candidates`、`inserted`、`reused` 计数。重复运行保留原准备 BLOB 的块 ID 和全部字节，并检查摘要及去除生成 ID 后的解析结果。源正文发生变化、准备结果损坏、SQL 错误或锁冲突都会失败并回滚本次全部写入；已有准备结果不会被覆盖。失败时保持副本，查明原因，再从可信备份生成新的副本；不要为了通过检查而直接改写摘要。

先在副本运行准备工具，再用新版本后端执行 schema7。后端仍负责原子校验摘要、文档、全部对象并消费/删除准备表。准备成功不代表 schema7 已完成，也不代表可以跳过后端校验。完成干净恢复卷的完整验证后，再按同一停机备份流程升级正式卷。

验证命令：

```sh
node --test scripts/tests/prepare-block-migration.test.mjs
node scripts/prepare-block-migration.mjs --help
```

测试覆盖标题、嵌套列表、行内链接与加粗、清单勾选、表格、代码语言与文本、图片与文件附件地址、中文正文摘要、回收站对象、已有 JSON 保留、空正文跳过、重试字节不变、源变化/损坏回滚和冲突锁拒绝。测试仅使用临时数据库。
