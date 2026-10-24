# 独立 V1 发布审计复现

不修改产品。Python 脚本自动创建、清理自己 UUID 命名的容器和卷；镜像必须显式传入。

```sh
python3 scripts/audit/release_probe.py --image noteapp:release-audit-20261025 --count 1000
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' python3 scripts/audit/release_probe.py --image noteapp:release-audit-20261025 --count 1000 --browser
python3 scripts/audit/alpine_advisories.py --image noteapp:release-audit-20261025
python3 scripts/audit/storage_faults.py --image noteapp:release-audit-20261025
python3 scripts/audit/migration_rehearsal.py --image noteapp:release-audit-20261025
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' sh scripts/audit/run_browser.sh noteapp:release-audit-20261025
```

浏览器脚本需要空闲 18187 端口；冲突时不会测试或停止既有实例。测试文件在常规 E2E 中默认跳过，runner 启用并校验容器卷/端口。部分测试明确断言**当前缺陷存在**；通过表示复现成功，不表示产品通过。修复后应把这些断言改成预期正确行为。

容量样本：每类 `count` 个对象，正文约 8KB；API 用 7 次串行请求统计端到端中位数和最大值，非 p95。浏览器样本只有单次冷导航，heap 是采样值，不是峰值。容量脚本另上传10个各1MiB随机附件并核对下载SHA，测8路搜索并发编辑；父子/关系使用另行完整旅程与恢复测试。5000 首轮连接中断时没有保存容器现场，不能据此归因产品；后续脚本对失败保留 state/logs，显式关闭 Python 系统代理。

磁盘测试使用 **2MiB 独立 named tmpfs volume** 触发 ENOSPC，不填满 Docker 主磁盘。迁移脚本创建自己的 schema6 数据，测试拒绝未准备的旧正文、准备复用、升级到8、三端关系和附件。

Alpine脚本使用官方分支main secdb和镜像内原生apk版本比较，输出版本候选，不能代替运行路径/可利用性判定；不要求Docker Scout登录。
