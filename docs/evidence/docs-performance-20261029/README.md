# 文档同步与加载性能检查（2026-10-29）

## 改动

新增现行产品说明作为入口，同步README、架构与运维文档，历史规格/计划/实施/审查加历史标识，保留原始验收结果。当前笔记界面为扁平列表，正文仅块JSON，详情浮层、属性共享/复用和筛选器规则与实现一致。

加载优化不增加摘要API、不改变完整对象字段、数据库或依赖：原生块编辑器按需下载，笔记/日程页面不请求无关任务集合（汇总背景保留），GET JSON协商gzip BestSpeed；写请求/静态/附件/Range和已有编码透传。

## 大样本对比

独立容器，三类各1000对象，每份块正文约8KB；文本大量重复，是可复现的传输/加载样本，不代表所有实际内容的压缩率。相同探针分别运行旧镜像 `noteapp:workbench-create-20261028` 和候选镜像 `noteapp:performance-20261029`。原始结果记录镜像SHA和容器身份，探针退出清理临时容器/卷，未修改用户数据。浏览器为本机Brave Chromium。

| 指标 | 基线 | 优化后 |
| --- | ---: | ---: |
| 集合首屏JS字节 | 1,740,458 | 785,074 |
| 笔记列表额外任务请求 | 1 | 0 |
| 笔记列表接口解码字节 | 16,769,702 | 8,356,624 |
| 任务列表准备时间（单次） | 415 ms | 305 ms |
| 笔记列表准备时间（单次） | 328 ms | 212 ms |
| 笔记详情准备时间（单次） | 278 ms | 253 ms |
| 笔记列表JS堆（单次） | 88,306,172 | 62,853,952 |

首屏脚本减少约55%，笔记列表解码数据减少约50%。时间与堆值为单次本机测量，只作参考，不视为稳定延迟承诺；探针按页面顺序访问，详情是在列表之后打开。打开详情时编辑器仍需下载；总代码体积没有被宣称全部消失。

候选镜像对同一完整响应分别请求identity/gzip并解压逐字节核对：

| 集合 | identity字节 | gzip字节 | 解码一致 |
| --- | ---: | ---: | --- |
| 任务 | 8,413,078 | 119,061 | 是 |
| 笔记 | 8,355,786 | 116,000 | 是 |
| 日程 | 8,390,892 | 123,848 | 是 |

本样本减少约98.5%传输字节。压缩不减少浏览器解码后的对象体积，也有CPU成本。静态JS此次未加服务端gzip。探针还验证写入后强制停止/重启，提交记录保持一致。

## 测试及复现

- 旧镜像真实浏览器回归先失败：笔记页仍发任务请求；新3项用例通过，覆盖无关请求/首屏预算、详情按需加载后自动保存、模块下载失败恢复、gzip完整字段。
- 压缩测试覆盖质量协商/禁用/通配符、写请求、附件/静态/Range/已有编码、不带正文的状态及错误JSON；全Go race和vet通过，使用真实临时SQLite测试业务一致性。
- 前端23文件102项单测、构建和Docker构建通过。Go缓存目录初次受沙箱权限限制，获得工具权限后重新完整执行通过；未把初次失败当通过。
- 运维10项通过，包含重建与干净数据卷恢复；保留现有SQLite ResourceWarning。构建仍有大于500kB chunk提示。
- 完整浏览器回归131项通过（4.9分钟）。独立只读审查未发现具体正确性/安全/回归问题。本地Markdown文件链接170项检查无断链（不验证外部URL及锚点）。

```sh
npm run test --prefix web -- --run
npm run build --prefix web
env -u GOROOT go test -race -count=1 ./...
env -u GOROOT go vet ./...
docker build -t noteapp:performance-20261029 --build-arg APP_VERSION=performance-20261029 .
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' python3 scripts/audit/release_probe.py --image noteapp:performance-20261029 --count 1000 --browser
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' sh scripts/audit/run_browser.sh noteapp:performance-20261029
NOTEAPP_TEST_IMAGE=noteapp:performance-20261029 python3 -m unittest discover -s scripts/tests -p 'test_*.py'
```

## 剩余边界

仍按个人规模设计，完整列表仍读取正文，未引入分页、虚拟列表或全文索引。若后续数据量继续增长，应以新的实际样本测量并明确筛选/排序与父子上下文的分页语义。未更改原有未提交品牌资源，不将其纳入本次提交；本机镜像使用当前工作区外观。

## 本机部署与数据核对

已重建 `noteapp-v1-check-noteapp-1`，镜像 `noteapp:performance-20261029`，地址 `http://127.0.0.1:18084`，健康/API/静态入口检查通过。前后备份保留在 `backups/2026-10-29-before-performance` 与 `backups/2026-10-29-after-performance`。读取校验后的备份到临时目录对比，14张表结构与记录、附件清单一致，见data-comparison.log。

```sh
python3 scripts/audit/compare_backups.py backups/2026-10-29-before-performance backups/2026-10-29-after-performance
```

原有品牌文件修改保留且不纳入本次提交；没有推送远程或发布。
