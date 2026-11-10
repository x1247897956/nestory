# 单人后端性能检查（2026-11-10）

## 结论

当前数据规模下写入和工作台接口较快，但大规模正文搜索及搜索排队影响保存的问题明确存在。不能声称性能已全面优化或容量无限。未为多人协作引入服务、连接池重构或缓存。

## 方法

- 实测镜像noteapp:architecture-20261110（源码63ce398），Docker Desktop29.8.2、Linux/aarch64、10个虚拟CPU、约7.75GiB内存，无单容器CPU/内存配额。主机macOS/arm64；具体版本与镜像SHA见capacity.json。
- 一个全新项目，每类100/1000/5000个对象，合计300/3000/15000；正文规范UTF-8表示为8620字节，工具的json.dumps以ASCII转义中文后实际保存11620字节块JSON，重复中英文文本，所有日程位于同一查询月，任务均为开放状态。同项目集中样本用于观察大集合，不等同于真实分布或硬容量上限。
- 每接口预热3次，随后3轮各20次串行请求，固定相同顺序。默认gzip；HTTP计时包含读取完整响应，但不含客户端解压、JSON解析或渲染。p95是每轮20样本nearest-rank估计，表中为3轮p95的最小–最大值，不能当作生产SLA或统计显著的优化比较。
- 保存测相同8KiB正文的版本更新。每轮另作一次8路搜索与1路保存的同步起跑压力检查；保存排队结果不作为p95，不能代表多人吞吐量。
- 所有容器和卷由工具新建并清理，不访问正式数据。测量、重复运行、Go基准顺序执行。
- 首次试跑发现客户端会保留一轮所有解析响应，主动中断后改为每次释放并从头重测；试跑数据未用于下表。

## 容量结果

| 接口 | 300对象 | 3000对象 | 15000对象 |
| --- | --- | --- | --- |
| 任务集合 | 8.3–15.1ms | 43.5–55.1ms | 265.8–287.3ms |
| 笔记集合 | 7.0–7.1ms | 42.2–43.2ms | 248.3–285.4ms |
| 日程集合 | 7.0–7.9ms | 41.6–45.8ms | 255.6–264.3ms |
| 搜索未命中 | 13.7–14.6ms | 118.5–128.6ms | 590.2–623.6ms |
| 正文搜索 | 27.2–28.9ms | 257.8–258.4ms | 1249.6–1279.5ms |
| 工作台 | 1.9–2.4ms | 9.0–9.5ms | 40.3–49.0ms |
| 保存约8KiB正文 | 1.9–2.1ms | 2.1–2.9ms | 2.1–5.5ms |

三轮8路搜索并发时保存：300对象14.7–52.6ms；3000对象2.7–642.3ms；15000对象3.0–2535.5ms。结果受排队先后影响明显，不能只取最快值。

容器内存采样分别约23–24MiB、33–42MiB、42–67MiB，不是峰值或内存泄漏结论。任务集合5000条的解压JSON约59.45MB，而gzip约0.76MB；高度重复正文使压缩比异常好，真实笔记不可假设相同比例。后端接口延迟不代表浏览器处理这59MB数据的成本，集合全量携带正文仍是长期规模风险。

预设预算是集合/工作台/搜索p95<500ms、保存p95<200ms、并发压力时保存<1000ms。15000对象的搜索和并发保存超预算；初测其余接口通过，独立复测还出现一轮日程集合p95为555.2ms，超过500ms预算。预算不是用户要求或产品承诺。

## 诊断与后续

代码路径：workspace.Search先执行总数查询，再执行排序分页查询；两次都通过json_tree从块正文提取文本并作LIKE匹配。搜索结果虽然分页，计算仍会扫描大量正文。全局单SQLite连接意味着这些查询也会与保存争用连接；当前已经启用WAL，不能把问题简单归因为未开启WAL。

下一步优先优化搜索访问路径并保留原有子串匹配、中文、附件名、归档和分页语义；通过SQL/profile证据验证改动。其次评估集合按需读取正文，避免把全部笔记内容传给浏览器。当前不修改正文存储协议、不增加Redis或多实例架构，也不盲目提高连接数掩盖扫描成本。

## 独立复测和诊断证据

全新卷独立重复每类5000对象，3轮各20样本。正文搜索p95为1247.6–1268.4ms，未命中搜索589.0–592.8ms；8路搜索同时保存为8.3/4208.3/293.7ms。列表任务249.3–318.2ms、笔记235.7–269.9ms、日程230.8–555.2ms、工作台37.7–52.5ms、独立保存2.0–2.2ms。大规模搜索和排队风险重复出现；不是只凭一次慢请求下结论。完整原始样本见capacity-repeat.json。

- Go原生基准每类1000/miss：6次结果中位数49.03ms/op，范围48.64–50.53ms/op。
- Go原生基准每类1000/body：6次结果中位数61.75ms/op，范围61.51–62.25ms/op。
- Go原生基准每类5000/miss：6次结果中位数250.38ms/op，范围249.13–252.08ms/op。
- Go原生基准每类5000/body：6次结果中位数315.50ms/op，范围312.66–319.88ms/op。

Go基准在macOS/arm64 Apple M5、Go1.27.3执行；它采用原生UTF-8 JSON，而Docker容量工具是ASCII转义JSON，且平台/传输不同，两者绝对耗时不作直接比较。基准未修改业务实现，不能称作优化前后对比；没有使用benchstat声称统计显著的性能提升。

CPU profile的Search累计占89.03%，SQLite读取路径pread占88.23%（累计百分比重叠，不能相加）。对应数据库大正文overflow页扫描；pread样本不等于物理磁盘实际读取时间（可能命中系统文件缓存），本轮未测硬盘IOPS；不是证据表明Go路由或GC是主因。profile覆盖整个基准进程，包含约10.65% fixture设置，内存profile也含启动/建库分配；其分配top不能当作单次搜索的堆峰值。每次操作的Go分配参见benchmem日志，modernc原生分配和文件缓存不完全计入Go B/op。

第一次Go测量因沙箱无法读取Go缓存未执行；使用允许的本机缓存重跑后基准/profile通过，首次失败日志保留。百分位工具测试2项通过；现有workspace正确性测试结果见workspace-tests.log。

本轮只增加诊断工具、真实SQLite基准与文档，没有修改生产接口/数据库、没有声称已经修复这些性能问题。正式容器与数据不变。

## 复现

```sh
python3 scripts/audit/backend_performance.py --image noteapp:architecture-20261110 --output /tmp/capacity.json
python3 scripts/audit/backend_performance.py --image noteapp:architecture-20261110 --counts 5000 --output /tmp/capacity-repeat.json
env -u GOROOT go test -run '^$' -bench BenchmarkSearch -benchmem -benchtime=1s -count=6 ./internal/workspace
env -u GOROOT go test -run '^$' -bench 'BenchmarkSearch/per_type=5000/body' -benchtime=5s -cpuprofile=/tmp/search-cpu.prof -memprofile=/tmp/search-mem.prof -o /tmp/workspace.test ./internal/workspace
env -u GOROOT go tool pprof -top /tmp/workspace.test /tmp/search-cpu.prof
python3 -m unittest discover -s scripts/tests -p test_backend_performance.py
```
