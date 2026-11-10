# 搜索与集合读取性能修复（2026-11-10）

## 实现

- schema10新增search_documents派生文本与SQLite内建FTS5 trigram外部内容索引。只在源写入时从块text/附件name提取文本，SQLite触发器与源写入同一事务；删除移除，恢复重建，项目归档实时过滤。没有增加服务、依赖库、额外正文编辑格式或索引写入API。块JSON仍是唯一可编辑正文。索引可以从源记录重建。
- 搜索保留LIKE子串规则，一般查询可使用trigram；短中文和字面%/_/反斜线查询在派生文本匹配。一次物化匹配ID，再取得总数、排序和分页，越过末页仍返回正确总数。SQLite原有ASCII大小写规则与Unicode匹配不变。参考[SQLite trigram文档](https://sqlite.org/fts5.html#the_trigram_tokenizer)。
- 三类集合增加include_body=false；SQL不读取正文列，JSON省略body_document。默认API仍返回完整对象；详情、创建、更新协议不变。前端集合全部显式请求属性，TypeScript将集合Omit类型与完整详情区分，轻量对象不会进入编辑器或覆盖完整详情缓存，拖动更新也会剔除集合缓存中的正文。

## 性能复测

基线为d4bd18f保存的capacity.json/capacity-repeat.json及noteapp:architecture-20261110；候选noteapp:search-collections-20261110。固定同一Go/SQLite版本和Docker环境；单项目100/1000/5000个每类对象，正文相同（规范UTF-8 8620字节、实际ASCII转义存储11620字节）。每端点预热3次，3轮各20请求，p95为nearest-rank样本估计。以下为合计15000对象、每轮p95的最小–最大值：

| 操作 | 修复前 | 修复后 |
| --- | --- | --- |
| 未命中搜索 | 590.2–623.6ms | 3.0–4.0ms |
| 正文搜索 | 1249.6–1279.5ms | 160.0–182.2ms |
| 界面任务集合 | 265.8–287.3ms | 22.8–27.5ms |
| 界面笔记集合 | 248.3–285.4ms | 22.2–24.1ms |
| 界面日程集合 | 255.6–264.3ms | 18.2–19.8ms |
| 工作台 | 40.3–49.0ms | 40.2–60.0ms |
| 完整8KiB正文保存 | 2.1–5.5ms | 4.8–12.4ms |

8路未命中搜索同时保存：初测旧版3.0–2535.5ms（旧独立复测最大4208.3ms），新版5.1–7.7ms。这个压力样本是每轮一次，不能称为并发p95，也不能推断所有查询和任意并发都没有排队。

5000条任务解压JSON：旧59,452,782字节，新属性集合1,332,782字节，减少约97.8%；gzip传输旧763,929字节，新172,095字节。正文重复度高，不能把此压缩比例推广到真实笔记；接口计时包含响应读取，但不包含客户端解压/JSON解析/DOM渲染。

短中文搜索p95为101.7–173.1ms，字面%搜索65.8–70.5ms，保持原有匹配语义。它们仍可能线性扫描派生文本，未声称常数复杂度。新版大规模内存采样约54–61MiB，不是峰值或泄漏证明。

默认完整集合API为兼容保留，仍传输所有正文，某轮p95超过500ms；不作为当前界面所用属性接口的优化结果。正式集合界面的预算按属性接口评估。

## 基准与成本

Go真实临时SQLite基准6次：每类5000的未命中搜索中位数约250.38ms→0.67ms，正文搜索315.50ms→99.40ms，benchstat p=0.002（n=6）。新正文基准波动较大（±92%），以Docker重复容量实测为实际使用的主要证据；不是承诺每次恰好改善某个比例。工具固定golang.org/x/perf/cmd/benchstat@v0.0.0-20261009192801-be2c69fb417e，未加入项目依赖。原生Go基准UTF-8 JSON、Docker数据ASCII转义，二者绝对耗时不直接比较。

索引有实际成本：初测15000对象建数由约85秒增至约98秒；正文/标题变更会同步更新索引。本轮8KiB保存p95约4.8–12.4ms，仍低于预设200ms预算，但不称为零成本。独立复测的dbstat：原表及其索引约179.56MiB；派生文本/搜索索引约125.07MiB，其中search_documents约124.53MiB、FTS表约0.54MiB，合计约304.64MiB，另有WAL。约69.7%的额外数据库空间是这份重复8KiB数据集的实际代价，不能称为免费索引。

## 验证与数据保护

- 真实SQLite测试：索引创建前失败、事务回滚/删除/恢复/重命名/硬删同步、schema9升级回填且源块不变、FTS外部内容integrity-check。
- 新旧搜索实现结果对照：短中文、ASCII/非ASCII大小写、符号、正文文本、排序、归档、越过末页总数等；原有附件名/表格/块边界测试继续通过。
- 属性API先失败后通过，完整默认响应和详情保留；只改标题不会丢失正文。
- Go全量race/vet通过；前端98项测试和构建通过；Docker镜像构建通过。
- 新增三类真实浏览器轻量读取/编辑/保存/刷新回归；完整浏览器134项全部通过。
- 12项运维测试通过，包括干净卷恢复；schema6离线块准备→schema10演练通过。
- 正式备份副本schema9→10：原14张表及附件不变。原副本无活动对象，另在独立卷创建三类正文验证非空索引；重建容器与干净卷恢复后20张表/内容相同，搜索和块正文保留。
- 独立只读审查未发现具体正确性问题，见review.md。

首次失败均保留：前端单测替身漏导出新投影工具，改为保留真实模块导出；浏览器旧日期筛选fixture只拦截无查询参数地址，改按pathname匹配；恢复演练备份重启后随机宿主端口改变，工具改为重新发现地址。修复后上述检查重新通过，不把首次失败算作通过。

## 独立复测及本机交付

全新卷每类5000、同样3轮20请求独立复测：正文搜索p95为145.4–156.7ms、未命中2.5–3.3ms；属性任务21.5–25.7ms、笔记17.5–21.9ms、日程18.2–24.7ms。短中文112.7–122.4ms、字面%68.8–73.3ms；保存3.4–14.3ms。8路未命中搜索同时保存3.4/9.6/4.5ms。原始样本及磁盘页统计见capacity-repeat.json。当前界面使用的接口均在预设预算内；旧完整集合不作此保证。

本机18084已更新为候选镜像并healthy，7项smoke通过。更新前再次备份，schema9→10比较确认原14表数据、源块和附件不变（本机当前全部对象已删除，因此无活动索引项；非空索引由隔离副本回归验证）。备份保存在backups/2026-11-10-before-search-collections-deploy及after-search-collections。已有数据卷保留，未推送远程。

性能测量工具2项测试通过；所有测量完成后再部署，部署不与测量并行。

## 复现

```sh
env -u GOROOT go test -race -count=1 ./...
env -u GOROOT go vet ./...
npm run test --prefix web -- --run
npm run build --prefix web
docker build -t noteapp:search-collections-20261110 --build-arg APP_VERSION=search-collections-20261110 .
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' sh scripts/audit/run_browser.sh noteapp:search-collections-20261110
python3 scripts/audit/backend_performance.py --image noteapp:search-collections-20261110 --properties --output /tmp/capacity-after.json
python3 scripts/audit/backend_performance.py --image noteapp:search-collections-20261110 --counts 5000 --properties --output /tmp/capacity-repeat.json
python3 scripts/audit/search_index_rehearsal.py --backup backups/2026-11-10-before-search-collections --source-image noteapp:architecture-20261110 --image noteapp:search-collections-20261110
NOTEAPP_TEST_IMAGE=noteapp:search-collections-20261110 python3 -m unittest discover -s scripts/tests -p 'test_*.py'
```

性能测量串行执行，不与浏览器回归、构建或其他基准同时运行。测试工具后续变化不影响候选运行镜像的Go程序或前端。
