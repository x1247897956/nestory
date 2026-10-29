> 历史设计/实施记录：保留当时范围与验证结果。当前界面、正文格式及功能请以[现行产品说明](../current-product.md)为准；旧Markdown三模式、多层笔记界面等描述不代表当前行为。

# 2026-10-25 正文只使用块

## 交付行为

任务、笔记、日程及统一对象接口只使用`body_document:{version:1,blocks:[...]}`。数据库schema7删除三张表的`body`与`legacy_body`列，块字段非null并具有空文档默认值。创建时省略正文得到空块，修改时省略正文保持不变；显式null、旧Markdown字段和无效文档返回400。版本冲突、项目只读、同项目/层级约束及原子事务保持不变。

前端草稿、自动保存、冲突恢复只处理块JSON，去掉旧原文下载UI。`/导入`和`/导出`仍可转换Markdown，但没有持久化Markdown投影；搜索直接通过SQLite json_tree提取text和附件name，不把块ID、类型、URL、样式当正文。JSON扫描搜索没有新增全文索引，适用于个人规模。原编辑器模块路径和部分测试可访问性标签保留兼容命名，不代表存在Markdown正文存储。

## 迁移安全

已有块JSON原样保留。非空旧Markdown须用[准备脚本](2026-10-25-block-migration-tool.md)和已锁定BlockNote0.56.0解析器离线生成准备表；后端检查原文SHA256和文档结构，在同一个SQLite事务中校验全部对象、复制数据、调整默认值/CHECK、删除旧列和准备表、登记版本7。任一步失败整个schema7回滚；缺少准备、源变化、无效准备/已有JSON均有真实SQLite测试。包含归档、回收站，不只当前可见对象。

Markdown导入语义沿用编辑器解析器；旧原文字节留在升级前完整备份，不在新库中继续存储。回退必须使用旧镜像和升级前备份恢复到另一个空卷，不支持原地降级。

## 实际检查

| 检查 | 实际结果 |
| --- | --- |
| Go `test ./...` | 全部通过 |
| Go `test -race ./...` / `vet ./...` | 全部通过 |
| 前端build（含tsc） | 通过，仍有既有大包非阻断警告 |
| 前端单测 | 8文件26/26通过 |
| 迁移准备Node测试 | 4/4通过，富文本/附件/重试/摘要/事务回滚/锁 |
| Playwright完整回归 | 29/29通过，1.4分钟 |
| Docker runtime/备份恢复/归档测试 | 9/9通过 |
| 新镜像构建 | 退出0 |
| schema6备份→隔离卷→schema7 | 成功，逐条比较通过 |
| schema7备份→第二个空卷恢复 | 清单核对、smoke7/7、三类对象编辑器打开均通过 |
| 正式实例迁移后 | smoke7/7，三类对象API均只有块字段 |
| 独立只读审查 | 无确认的重要问题或阻塞 |

失败与修复：

- 文档Apply先写新契约测试，旧签名编译失败；实现块唯一签名后通过。
- 迁移新测试暴露SQL NULL直接扫描至json.RawMessage不兼容，改为[]byte接收后通过。
- E2E首轮28/29：跨周日程被FullCalendar渲染为两个片段，旧全局链接断言歧义；限定当天单元格后在新临时库完整重跑29/29。
- Docker备份测试首轮4个错误：旧夹具仍提交body，符合新接口预期返回400；改为明确原生块夹具和恢复后JSON比较，9/9通过。失败setUp遗留的4组临时容器/空卷已清理。
- 浏览器首个审批请求超时，实际未启动；重试后执行成功。

## 数据和恢复演练

隔离卷与正式迁移后均逐条比较，共87份正文：2份已有块完全一致，31份非空旧Markdown转换成准备结果，54份空正文变为空块。35项目、28任务、40笔记、19日程的数量以及所有非正文元数据保持一致；45删除批次、57访问记录、task_pages6、task_events3、page_events3均保持。12个附件逐个SHA256一致。SQLite integrity_check=ok、foreign_key_check为空。

对比结果：[演练](../evidence/block-only/migration-comparison.json)、[正式](../evidence/block-only/final-migration-comparison.json)。本机备份路径不提交Git：

- `backups/2026-10-25-before-block-only`：首次schema6完整备份。
- `backups/2026-10-25-block-only-rehearsal`：隔离卷迁移后的schema7备份，已另建空卷恢复验证。
- `backups/2026-10-25-final-before-block-only`：正式停机后重新捕获的最终schema6备份。
- `backups/2026-10-25-after-block-only`：正式迁移后的schema7备份。

演练卷/恢复卷均独立于实际数据，验证结束后临时容器与卷已清理。正式实例仍为`noteapp-v1-check-noteapp-1`，挂载`noteapp-v1-check:/data`，端口18084。新镜像`noteapp:block-only-20261025`，ID `sha256:56d8e762eda192e5c3204029faef6a17f6abc19f26e83e363e37e9d7a0c14ea0`；旧镜像`noteapp:slash-menu-20261024`继续保留。

## 复现

完整升级步骤见[运维手册](../operations.md#块唯一正文升级schema7)。测试全部使用临时SQLite或独立Docker卷，禁止对实际项目运行写入型E2E。

```sh
env -u GOROOT GOPATH=/tmp/noteapp-go GOCACHE=/tmp/noteapp-go-cache GOMODCACHE=/tmp/noteapp-go/pkg/mod /Users/seyr1n/.goenv/versions/1.25.12/bin/go test ./...
env -u GOROOT GOPATH=/tmp/noteapp-go GOCACHE=/tmp/noteapp-go-cache GOMODCACHE=/tmp/noteapp-go/pkg/mod /Users/seyr1n/.goenv/versions/1.25.12/bin/go test -race ./...
env -u GOROOT GOPATH=/tmp/noteapp-go GOCACHE=/tmp/noteapp-go-cache GOMODCACHE=/tmp/noteapp-go/pkg/mod /Users/seyr1n/.goenv/versions/1.25.12/bin/go vet ./...
npm run build --prefix web
npm run test --prefix web -- --run
node --test scripts/tests/prepare-block-migration.test.mjs
# 18086必须由独立APP_DATA_DIR的临时服务提供，前端嵌入前先build。
E2E_BASE_URL=http://127.0.0.1:18086 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' npm run e2e --prefix web
python3 -m unittest scripts.tests.test_runtime scripts.tests.test_backup_restore scripts.tests.test_archive
```
