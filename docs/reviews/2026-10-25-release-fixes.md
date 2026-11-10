> 历史设计/实施记录：保留当时范围与验证结果。当前界面、正文格式及功能请以[项目介绍](../../README.md)为准；旧Markdown三模式、多层笔记界面等描述不代表当前行为。

# 发布审查修复验收（2026-10-25）

范围为独立审查的 A01–A05。原始 [审查报告](2026-10-25-v1-release-audit.md) 和原始 evidence 保留，作为修复前事实；本文件记录修复后的实际结果。无新增登录、协作或通用属性引擎，数据库仍为 schema8，未自动改写正文。

## 修复及验证

| 编号 | 实际修改 | 验证 |
| --- | --- | --- |
| A01 | 共享 UUID 生成器优先使用原生 randomUUID；普通 HTTP 使用 crypto.getRandomValues 生成 RFC4122 v4，禁止 Math.random。创建请求、窗口身份、自动保存统一使用 | 单测覆盖原生/回退和格式；非localhost LAN HTTP真实 Chromium 验证 secureContext=false、randomUUID 不存在时三类编辑器正常保存；强制关页恢复草稿和克隆窗口身份隔离 |
| A02 | 所有路由之前执行精确 Host 白名单；默认 loopback，LAN显式配置。保留 Origin 协议/主机/端口校验，不信任转发头；本地Go默认监听127.0.0.1，容器保持:8080 | 未知Host的静态页、健康检查、资源和匹配Origin写入均403；DNS大小写/尾随点、IPv6、非法端口、开发Origin边界Go测试 |
| A03 | 对照固定BlockNote0.56.0校验样式、属性类型、标题、表格宽度/表头/合并单元格几何；拒绝非法写入且不剥离数据 | 两个审查样本及复核新增空物理行样本，在三类对象POST/PATCH均拒绝且真实SQLite行数/完整快照不变；合法全类型语料在三类编辑器及归档只读状态重新打开，API JSON保持不变 |
| A04 | 三类编辑器的pending文件处理纳入脏状态；恢复/重新载入的按钮与handler同时防护pending/save/move | 9个真实浏览器案例：任务/笔记/日程×慢上传/慢导入/保存中恢复，文件链接及正文最终持久化；9个组件测试验证handler防护 |
| A05 | Go1.27.1→1.27.3；运行时Alpine3.22.2→3.22.7；manifest digest固定，Node仍26.9.0 | 最终镜像提取二进制确认go1.27.3、CGO_ENABLED=0；源码/二进制govulncheck；官方Alpine main secdb版本比较；有界Range和multipart真实HTTP回归 |

独立复核发现“上一行rowspan覆盖的空物理行仍被接受”，已先复现红灯，再修复并复审。最终复核在本次范围内无剩余P1/P2发现。所有表格物理行必须至少一个单元格；合法合并表格允许各行物理单元格数量不同。

## 执行记录

证据目录：[本轮命令输出](evidence/2026-10-25-fixes)。归档日志仅移除行尾空白，不改变结果内容。Go命令使用可写临时缓存和明确工具链，未改用户全局Go/Docker配置。

```sh
env -u GOROOT GOPATH=/tmp/noteapp-go GOCACHE=/tmp/noteapp-go-cache GOMODCACHE=/tmp/noteapp-go/pkg/mod GOTOOLCHAIN=go1.27.3 /Users/seyr1n/.goenv/versions/1.25.12/bin/go test -race ./...
# 同一环境执行 go test ./...、go vet ./...
npm test --prefix web -- --run
npm run build --prefix web
node --test scripts/tests/prepare-block-migration.test.mjs
docker build -t noteapp:release-fixes-20261025 --build-arg APP_VERSION=release-fixes-20261025 .
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' sh scripts/audit/run_browser.sh noteapp:release-fixes-20261025
NOTEAPP_TEST_IMAGE=noteapp:release-fixes-20261025 python3 -m unittest discover -s scripts/tests -p 'test_*.py'
python3 scripts/audit/migration_rehearsal.py --image noteapp:release-fixes-20261025
python3 scripts/audit/alpine_advisories.py --image noteapp:release-fixes-20261025
```

最终镜像独立临时卷的完整浏览器套件 **59/59通过**（2.4分钟，36项常规业务与23项发布回归，无跳过）。Go全包test/race/vet、66项前端单测、TypeScript/Vite构建、4项迁移准备工具、9项运维测试和schema6→8迁移演练均通过。

全量测试额外发现并修复了块菜单鼠标问题：关闭动画留下opacity=0、无React事件处理器的HTML残影，点击没有反应。事件日志复现后，把侧边菜单关闭动画改为0，保留250ms打开动画；独立复核通过。修复后原鼠标用例单独连续5/5通过，新增残影消失/快速重新打开复制用例连续5/5通过，未改成键盘操作规避鼠标路径。

测试过程中的失败均保留日志：首次合并58项为56通过、2失败（菜单残影及拥挤日历）；随后59项为58通过、1失败（日历定位到了隐藏DOM）。日历用例现按自身对象ID定位可见日程，需要时展开“更多”，拥挤日期针对性及最终全量均通过。LAN克隆测试还修正了Node不共享Chromium域名映射的问题，保留实际Host/Origin。重复测试曾误并发导致artifact ENOENT，该次不计为通过，后续独立5/5运行才作为证据。

最终镜像：`noteapp:release-fixes-20261025`，ID `sha256:def8a88e3d3eea20d376b0cb849cd6ec29e046fd323e55ebf93a0564265954bf`。镜像revision标签为本次发布版本名，提交ID以Git历史为准。

## 依赖检查的含义

最终二进制扫描无命中；源码符号和导入包无命中，模块层仍报告 `golang.org/x/sys/windows` 的 GO-2026-5024，限Windows且本应用不调用，最终Linux二进制不含该路径。本次不为未使用平台路径扩大依赖升级。

运行时Alpine3.22.7的main secdb比较结果为0个版本候选，完整实际包版本和通告源SHA见JSON；这不是所有组件、所有未来漏洞或可利用性的保证。npm audit本次0条。Range和multipart回归使用小输入验证正常、异常和限额行为，没有发送资源耗尽攻击载荷。

官方来源：[Go发布记录](https://go.dev/doc/devel/release#go1.27.3)、[Range公告](https://pkg.go.dev/vuln/GO-2026-6609)、[multipart公告](https://pkg.go.dev/vuln/GO-2026-6608)、[Alpine main secdb](https://secdb.alpinelinux.org/v3.22/main.json)。构建/runtime digest见Dockerfile，APK来自固定分支安全仓库，未逐包离线锁定。

## 数据保护及恢复演练

升级前停机全卷备份到本地忽略目录 `backups/2026-10-25-before-release-fixes`，包含WAL/SHM和附件，备份后恢复原容器运行状态。包含35项目、28任务、40笔记、19日程、12附件（计入已删除数据），schema1–8。用备份副本只读校验87份原有块正文，全部满足新schema约束，无自动修复/重写。

1. 创建独立卷，以备份记录的旧镜像恢复；使用最终镜像升级启动，7项smoke通过。
2. 再停机备份为 `backups/2026-10-25-release-fixes-ready`；逐列比较全部12张业务/元数据表的全部行，值均未改变，包括正文JSON、关系、删除批次；每个附件SHA一致。
3. 将最终备份恢复到另一个预先创建的空卷，最终镜像启动，7项smoke通过。恢复脚本同时验证SQLite integrity、外键、计数、文件SHA与清单。

正式实例已使用最终镜像对原 `noteapp-v1-check` 卷执行 Compose `--no-build --force-recreate --wait`，18084端口保持本机绑定，健康检查和7项smoke通过。升级后再次备份到 `backups/2026-10-25-after-release-fixes`，与部署前最新备份逐列比较12张表所有行，完全一致；12个附件SHA一致。本次创建的临时容器/卷及包含实际数据的临时解压目录已清理；正式卷、升级前后备份和回滚镜像保留。部署前最新备份为 `backups/2026-10-25-pre-deploy-release-fixes`，旧镜像标签 `noteapp:v1-stability-20261025` 保留。本次测试仅写本次创建的独立卷，未用正式数据做编辑/删除测试。备份archive含实际数据，未加入Git。

## 已知限制

- 免登录仅适合本机/受信任LAN；Host限制不能替代身份验证。未在真实第二台设备测试物理网络/DNS，LAN用Chromium非localhost域名映射到本机容器，覆盖不安全HTTP上下文。
- 不隐式信任HTTPS终止代理的转发头；此类部署需另行配置设计。
- 列表仍含完整正文，单项目每类1000对象、每份8KB为先前测量场景，不是无限容量承诺；摘要接口/分页后续实现。
- 原审查的可访问性P3仍待后续：任务导航改为原生Link、补充跳转主内容链接；本次未扩大为完整读屏器验收。
- 突然断电下的附件持久性尚未验证，不能把进程SIGKILL测试等同于掉电测试；异常中断可能遗留孤立附件，服务端备份仍为未加密本地文件。
- 前端包仍有Vite大chunk警告；Python3.15执行现有运维测试产生ResourceWarning，9项测试均通过；Node实验性/弃用提示不影响本次结果。
- 浏览器站点草稿不属于服务器备份。未宣称全面渗透测试或全辅助技术无障碍审计。
