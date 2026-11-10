# 独立 V1 发布审计复现

脚本只操作独立临时数据。Python 脚本自动创建、清理自己 UUID 命名的容器和卷；镜像必须显式传入。

```sh
python3 scripts/audit/release_probe.py --image noteapp:release-audit-20261025 --count 1000
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' python3 scripts/audit/release_probe.py --image noteapp:release-audit-20261025 --count 1000 --browser
python3 scripts/audit/alpine_advisories.py --image noteapp:release-audit-20261025
python3 scripts/audit/storage_faults.py --image noteapp:release-audit-20261025
python3 scripts/audit/migration_rehearsal.py --image noteapp:release-audit-20261025
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' sh scripts/audit/run_browser.sh noteapp:release-audit-20261025
```

runner现执行常规业务用例和发布回归的完整套件，全部写入其独立临时卷。浏览器脚本需要空闲 18187 端口；冲突时不会测试或停止既有实例。测试文件在常规 E2E 中默认跳过，runner 启用并校验容器卷/端口。2026-10-25 修复后，浏览器测试已改为断言安全行为，包含 LAN HTTP、草稿恢复、克隆窗口、文件处理中恢复保护和固定块 schema。原始缺陷复现结果仍保存在独立审查报告中。runner只在自己的容器允许 `lan.noteapp.test`，未知 `audit.invalid` 必须返回403。

容量样本：每类 `count` 个对象，正文约 8KB；API 用 7 次串行请求统计端到端中位数和最大值，非 p95。浏览器样本只有单次冷导航，heap 是采样值，不是峰值。容量脚本另上传10个各1MiB随机附件并核对下载SHA，测8路搜索并发编辑；父子/关系使用另行完整旅程与恢复测试。5000 首轮连接中断时没有保存容器现场，不能据此归因产品；后续脚本对失败保留 state/logs，显式关闭 Python 系统代理。

磁盘测试使用 **2MiB 独立 named tmpfs volume** 触发 ENOSPC，不填满 Docker 主磁盘。迁移脚本创建自己的 schema6 数据，测试拒绝未准备的旧正文、准备复用、升级到8、三端关系和附件。

Alpine脚本使用官方分支main secdb和镜像内原生apk版本比较，输出版本候选，不能代替运行路径/可利用性判定；不要求Docker Scout登录。

自定义属性schema9演练（只恢复备份副本到本脚本新建的临时卷，不操作正式容器）：

```sh
python3 scripts/audit/custom_properties_rehearsal.py --image noteapp:custom-properties-20261026 --source-image noteapp:object-menu-20261026 --backup backups/2026-10-26-after-object-menu
```

要求源清单是schema8且源镜像与清单一致。脚本升级副本到9、比较全部原有行和附件，写入独立演练项目的四种属性，再备份恢复到另一个干净卷核对；会在backups/留下验证备份，临时容器/卷自动清理。随机宿主端口在停启后重新发现，避免复用旧地址。已有schema6准备迁移脚本当前目标也为schema9。

## 单人后端性能检查

```sh
python3 scripts/audit/backend_performance.py --image noteapp:architecture-20261110 --output /tmp/nestory-capacity.json
env -u GOROOT go test -run '^$' -bench BenchmarkSearch -benchmem -count=6 ./internal/workspace
```

新容量脚本依次创建每类100、1000、5000个约8KiB正文对象的隔离容器/卷；三轮各20次暖请求，输出全部样本及nearest-rank p95。默认协商gzip，计时截至HTTP响应读取完成，JSON解压/解析不计入接口延迟，也不代表前端渲染耗时。内存为Docker采样值，不能称作峰值；8路搜索同时保存用于多标签页压力诊断，不模拟多人用户。清理仅针对本次新建资源，不能传入正式URL/卷。

Go基准使用真实临时SQLite，单独定位搜索服务，不等同于Docker端到端延迟；不要同时运行两类测量、构建或其他基准。
