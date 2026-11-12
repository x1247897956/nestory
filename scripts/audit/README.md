# 按需开发与发布验证

这些工具操作自己创建的隔离容器和数据卷，不参与应用启动。常规 CI 执行 scripts/tests/ 和浏览器回归；下面的容量、故障和历史升级演练由开发者按需要运行。

| 工具 | 覆盖范围 | 额外要求 |
| --- | --- | --- |
| backend_performance.py | 当前性能入口：每类 100/1000/5000 对象、原始样本、p50/p95、属性集合、gzip、并发保存和磁盘页统计 | Python、Docker、候选镜像 |
| release_probe.py | 综合观测：附件上传/下载 SHA、并发重试、KILL 后持久性及可选浏览器容量测量 | Python、Docker；浏览器另需 Node/Chromium |
| capacity_browser.mjs | 冷导航、DOM、heap、输入与保存测量，由 release_probe.py --browser 调用 | 锁定的前端依赖、Chromium |
| storage_faults.py | 独立 2 MiB tmpfs 卷中的磁盘写满、附件目录不可写及释放后的恢复 | Python、Docker |
| alpine_advisories.py | 读取镜像系统包，对照对应 Alpine 分支官方安全公告 | Python、Docker、网络 |
| migration_rehearsal.py | 合成 schema6 数据，验证拒绝未准备升级、离线块准备、升级及关系/附件保留 | Python、Docker、Node、前端依赖 |
| custom_properties_rehearsal.py | schema8 备份副本升级，核对原表与附件，写入四类属性后干净卷恢复 | Python、Docker、源/候选镜像和已校验 schema8 备份 |
| search_index_rehearsal.py | schema9 副本升级到 schema10，验证 FTS 回填、同卷重建和干净卷恢复 | Python、Docker、源/候选镜像和已校验 schema9 备份 |
| compare_backups.py | 比较相同 schema 的两份备份，逐表与附件核对，只允许最近访问时间前进 | Python、两份已校验备份 |
| run_browser.sh | 创建隔离实例、等待就绪、运行 Playwright 并清理，CI 也使用它 | POSIX Shell、Docker、Node、Chromium |

## 性能与运行检查

从仓库根目录执行，使用自己构建的测试镜像：

~~~sh
mkdir -p .local/reports
python3 scripts/audit/backend_performance.py --image noteapp:test --properties --output .local/reports/capacity.json
python3 scripts/audit/release_probe.py --image noteapp:test --count 1000 > .local/reports/release-probe.json
python3 scripts/audit/alpine_advisories.py --image noteapp:test > .local/reports/alpine.json
python3 scripts/audit/storage_faults.py --image noteapp:test > .local/reports/storage.json
sh scripts/audit/run_browser.sh noteapp:test noteapp-web:test
~~~

release_probe.py 的部分字段仅记录状态，不等同于完整回归断言；其计时与 backend_performance.py 有重叠。性能比较以性能工具的原始样本和重复轮次为准。heap / Docker memory 是采样值，不是峰值或泄漏证明。Alpine 版本匹配是公告候选，不能直接认定应用可被利用。

run_browser.sh 使用空闲的 18187 端口，失败时不会停止占用该端口的其他实例。它具有实际隔离编排和清理逻辑，因此保留；维护工具的纯命令转发 Shell 入口已移除。

## 历史版本升级演练

以下是参数格式。将源镜像与备份替换为同一来源且符合 schema 要求的实际值；工具只升级自己创建的副本：

~~~sh
python3 scripts/audit/migration_rehearsal.py --image noteapp:test
python3 scripts/audit/custom_properties_rehearsal.py --image noteapp:test --source-image SOURCE_IMAGE --backup PATH_TO_SCHEMA8_BACKUP
python3 scripts/audit/search_index_rehearsal.py --image noteapp:test --source-image SOURCE_IMAGE --backup PATH_TO_SCHEMA9_BACKUP
python3 scripts/audit/compare_backups.py BEFORE_BUNDLE AFTER_BUNDLE
~~~

自定义属性演练在被忽略的 backups/ 中保留校验备份；临时容器/卷由工具清理。真实备份不提交 Git。报告放在 .local/；浏览器失败产物由 Playwright 放入被忽略的 web/test-results/、web/playwright-report/，CI 按工作流保存为限时 artifact。

浏览器可用 Playwright 安装的 Chromium；如需指定已安装的浏览器，设置 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH。测量应串行进行，避免与其他基准、浏览器回归或构建争用资源，详见[性能检查](../../docs/performance.md)。

页面验证和素材工具需要分别构建的后端与前端镜像。`release_probe.py --browser` 额外要求 `--frontend-image noteapp-web:test`；纯 API/性能探针仅需后端镜像。
