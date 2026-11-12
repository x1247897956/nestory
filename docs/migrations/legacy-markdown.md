# 旧 Markdown 数据库迁移

下方准备命令要求数据库已处于 schema6，且仍有非空 Markdown 正文。新安装与已升级到块正文的实例不需要运行准备工具。

schema1–5 尚无准备工具所需的 `body_document` 列，不能直接运行该命令。应先在一致副本上制定并验证分阶段升级到 schema6 的方案，使用已确认兼容的旧版本或迁移步骤。当前后端的后续迁移处于同一事务，启动失败会回滚，不能借此自动停在 schema6。本页不提供未经验证的中间版本选择。

## 在一致副本上准备

必须停止全部应用进程，先备份数据库与附件，再在可丢弃的数据库副本上操作。数据库使用 WAL 时，通过 SQLite backup 或[离线备份/恢复工具](../operations.md)取得一致副本，不能只复制仍在写入的 `.db` 文件。

使用仓库指定的 Node 和锁定依赖：

```sh
npm ci --prefix web
node scripts/prepare-block-migration.mjs --database /path/to/stopped-copy.db --offline
```

`--offline` 表示操作者已确认停机，脚本无法识别闲置应用进程。准备工具以零等待的 `BEGIN EXCLUSIVE` 拒绝冲突写锁；WAL 模式下该锁不排斥所有读者，不能代替停机确认。

## 转换协议

工具加载 `web/node_modules` 中与 `web/package.json` 一致的 BlockNote 和 jsdom，核对解析器版本，并使用编辑器默认 schema 与 `tryParseMarkdownToBlocks()`。它不另建 Markdown 解析器，也不额外改写附件地址或嵌套语义。

工具只生成准备表，不改写原对象、不删除旧列、不提升 schema：

```sql
CREATE TABLE block_migration_prepared(
  object_type TEXT,
  object_id TEXT,
  source_sha256 TEXT,
  body_document BLOB,
  PRIMARY KEY(object_type, object_id)
);
```

只处理任务、笔记和日程中 `body_document IS NULL AND body != ''` 的行，包含归档与回收站。已有块 JSON 原样保留，空旧正文由后端迁移为空块文档。摘要是原正文 UTF-8 字节的 SHA-256，准备结果是版本化块 JSON 的 UTF-8 字节。

所有准备写入在一个事务中提交。重复运行保留已有块 ID 和字节，并核对摘要和解析结果。源正文变化、准备结果损坏、SQL 或锁冲突均使本次操作失败并回滚；不要修改摘要来绕过检查。

## 升级与恢复

先在副本完成准备，再由新版本应用执行 schema7 及后续迁移。后端在同一迁移事务中校验源摘要、全部块结构、复制数据、删除旧列和准备表、登记迁移版本，任一步失败回滚。准备成功不代表后端迁移已经完成。

在隔离实例中核对正文、关系、归档、回收站和附件，并完成一次干净卷恢复验证后，才对实际部署执行同样的停机备份流程。旧原文字节保留在升级前完整备份中。回退使用旧镜像和升级前备份恢复到另一个空卷，不支持原地降级。

工具与集成演练：

```sh
node --test scripts/tests/prepare-block-migration.test.mjs
python3 scripts/audit/migration_rehearsal.py --image noteapp:test
```
