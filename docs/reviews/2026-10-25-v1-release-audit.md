> 历史设计/实施记录：保留当时范围与验证结果。当前界面、正文格式及功能请以[现行产品说明](../current-product.md)为准；旧Markdown三模式、多层笔记界面等描述不代表当前行为。

# Noteapp V1 独立发布审计

日期：2026-10-25（Asia/Shanghai）。审计对象：`8169b66`，不是对旧验收结论的背书。**发布判断：不通过。**

普通 HTTP 局域网下现有正文编辑会崩溃，未达到明确承诺的日用范围；另确认块文档结构校验、文件处理中恢复操作、Host 边界缺口。Go 工具链还有官方已公开且本应用调用的缺陷路径。已执行的自动化回归通过不能消除这些问题。未修改产品实现，未发布、推送或写入实际实例。

## 1. 范围、隔离及环境

已完整阅读 README、architecture、operations、acceptance-v1、两份 2026-10-25 实施记录，以及 2026-10-23 产品/技术设计；旧 Markdown 与当前块 JSON 冲突处采用用户确认的块唯一正文。审查了 HTTP 入口、三类对象服务、项目、关系、回收站、块校验、幂等创建、SQLite/迁移、附件、前端保存/草稿/窗口身份/日历及运维脚本。保持模块化单体、普通构造函数、单实例 SQLite；免登录和没有团队权限不列为缺陷。

- 起始 `git status --short` 为空；项目及父级适用路径未发现 AGENTS.md。已有跟踪文件未修改；既有E2E另写其默认 `/tmp/noteapp-acceptance-v1.json` 测试夹具（仅本轮合成数据），后续恢复用该夹具。
- 发现实际容器 `noteapp-v1-check-noteapp-1` / 18084，以及既存本机 noteapp / 18080，均未用于测试写入，未停止/重建。没有读取 `data/`、实际卷或用户备份作为夹具。
- 本轮专用：`noteapp-release-audit-20261025` / 同名卷 / 18187；恢复卷与容器 `noteapp-release-audit-restored-20261025` / 18188。其他 Python 探测均创建 `noteapp-audit-*` UUID 名称并自行清理。ENOSPC 用独立 **2MiB named tmpfs volume**，没有填满主机或 Docker 数据盘。
- 主机 macOS 26.6.2 arm64，Docker client/server 29.8.2，Python 3.15.0；主机 Node 26.12.1、npm 11.20.0（与项目固定版本不同，明确保留此环境偏差）。Go 测试实际使用已缓存 Go **1.27.1** 原生工具链。浏览器为已安装 Brave/Chromium，Playwright 1.56.1。
- 按 Dockerfile 固定 Go 1.27.1 / Node 26.9.0 构建审计镜像 `noteapp:release-audit-20261025`，镜像 ID `sha256:be03221b8db9bf06e1d8d73f0adf48a9fc58cbec2e47e3da3423718c91b004e8`。构建使用缓存，未做 `--no-cache` 镜像源重下载。
- 首批测试使用已有稳定版不可变镜像 `sha256:a8c2a74e1628f0d132a2c922ed1165b96530eb36d9e4435e3e146d64d245bebf` 的**新容器新卷**。与本次源码构建镜像的 `/usr/local/bin/noteapp` SHA256 完全相同：`5b9d10e206cf83a1935e6074cc5e68834820ad0919176feaaaf19b639b89d9d1`；此程序内嵌前端。后续容量、故障、迁移和重建使用新审计镜像。
- 单独的只读审查代理复核了安全路径及数据库资源/事务：未找到 SQL 注入、缺失 Rows.Close/Err、事务内通过池查询引发单连接自等或未传播提交错误的重要问题。该结论仅限已读路径。

## 2. 发布前问题（按优先级）

P1：既定使用范围主流程不可用，阻断发布。P2：有条件触发的数据/安全/可靠性缺口；下列 P2 均应在本次发布前关闭，不等同于已证明远程代码执行。

### A01 / P1：普通 HTTP 局域网不能正常编辑正文

**状态：已实际复现（真实浏览器）。**

位置：`web/src/components/markdown/useAutosave.ts:23`、`web/src/app/tabIdentity.ts:16`、`:21`、`:34`，创建路径还经过 `web/src/app/api.ts:75`。

触发与最小复现：

1. 使用独立容器，先从 localhost API 创建项目和一篇笔记。
2. 用非 localhost 主机名或局域网 IP，通过 HTTP 打开笔记详情。审计用 Chromium 将 `audit.invalid` 映射至 127.0.0.1:18187，避免暴露端口到真实局域网；URL 主机名仍是非可信安全上下文。
3. 浏览器实测 `isSecureContext=false`、`typeof crypto.randomUUID === 'undefined'`。
4. 页面出现 `Unexpected Application Error! crypto.randomUUID is not a function`，没有正文编辑器。

预期：文档允许的受信任局域网 HTTP 部署可以创建、编辑、保存。实际：useAutosave 的初始化在 try/catch **之前**调用该方法而崩溃；main.tsx 吞掉窗口身份初始化错误不能保护编辑器。创建请求身份也依赖同一方法，不能依靠“恢复浏览器存储”解决缺少 API。

影响：本机 localhost 正常掩盖了整个 LAN HTTP 使用入口的问题；不表示数据库已损坏。此前仅 localhost/不同浏览器时区测试不覆盖该条件。

建议：统一生成 ID 的兼容实现，例如在 `crypto.randomUUID` 不可用时使用 `crypto.getRandomValues` 生成随机 UUID，并覆盖全部调用点及恢复流程。若选择强制 LAN HTTPS，需交付可执行的 TLS 部署和错误提示并明确调整支持范围，不能只补一行注意事项。浏览器限制依据：[MDN randomUUID](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID)。

回归条件：普通 HTTP LAN 主机名/IP 与 localhost 均完成三类对象创建、自动保存、刷新恢复、复制标签页隔离；不可只 mock 一个 UUID 返回值。

### A02 / P2：任意 Host 被接受，Origin 对比不能建立部署主机边界

**状态：任意 Host 的读写接受已实际复现；真实 DNS 重绑定攻击尚未动态复现。**

位置：`internal/app/app.go:288`、`:297`、`:301`；`internal/platform/config/config.go:20` 默认直接运行还监听 `:8080`（Compose 默认回环绑定成立）。

最小复现：在独立服务上发 `POST /api/v1/projects`，正文 `{"title":"foreign host"}`，头部 `Host: audit.invalid`、`Origin: http://audit.invalid`。Python 探测得到 **201**；普通 `Origin: http://evil.example` 配正常 Host 则 **403**。浏览器以映射域名 `http://audit.invalid:18187` 打开后，直接同源 fetch POST 也得到 **201**，无需前端身份逻辑。

预期：未知域名不能仅通过自洽的 Host/Origin 获得受信任站点身份。实际：没有 Host allowlist；GET 完全不做来源检查，写入只对比两个均可来自请求的域名。回环端口约束了可连接网卡，没有约束浏览器认为的域名。

影响：给 DNS 重绑定读取、修改单人数据留下服务端条件。完整利用还取决于 DNS、浏览器本地网络访问策略等，本报告**没有**声称已完成跨网站窃取或绕过了所有浏览器保护。没有把无登录本身当漏洞。

建议：配置并验证明确允许的部署 Host（含 localhost/IP/LAN 指定主机），对所有路由先检查；校验 Origin 时同时匹配允许来源，反向代理 Host 规则明确且不可任意信任 Forwarded 头。保留命令行无 Origin 的正常受信任调用能力。直接运行默认监听地址也应与本机默认部署说明一致。

回归条件：未知 Host 的 GET/POST 均拒绝；允许的本机和指定 LAN Host 正常；跨 Origin 仍 403；增加 DNS 重绑定模拟，不依赖 CORS 禁止响应读取作为唯一保护。

### A03 / P2：后端持久化了编辑器无法重新打开的块文档

**状态：API + 浏览器已实际复现，两种独立极小输入。**

位置：`internal/document/document.go:124`（styles 只查值类型）、`:141`（表格只检查最小形状），`web/src/components/markdown/BlockEditor.tsx:238`（直接加载）与 `:264`（失败后只显示复制入口）。

最小复现：向新笔记 POST `body_document:{version:1,blocks:[block]}`，block 分别为：

```json
{"id":"bad-style","type":"paragraph","content":[{"type":"text","text":"x","styles":{"unknown":true}}]}
```

```json
{"id":"bad-table","type":"table","content":{"type":"tableContent","headerRows":4294967296,"rows":[{"cells":[[]]}]}}
```

预期：400，或被明确兼容处理且能够无损重开。实际：两者 **201 并保存**；打开详情显示“正文加载失败”，没有可用编辑器。独立 BlockNote 0.56.0 检查分别抛出 `style unknown not found in styleSchema`、`RangeError: Invalid array length`。

影响：此对象正文无法经正常 UI 继续编辑，需外部修复 JSON；原 JSON 仍在，可复制，不宣称字节已丢失。表格额外数值还能进入数组分配路径，但未运行大分配/OOM 攻击，不夸大为已复现客户端内存耗尽。

建议：按实际默认 BlockNote schema 校验样式键、props 类型、表格 headerRows/headerCols/宽度及单元格等边界；范围应与实际行列数一致。保留已有库拥有字段的兼容性，避免“过滤所有未知字段”引入新丢失。修复已有坏数据时不能自动覆盖原文。

回归条件：上述两例 API 原子拒绝且原正文不变；对每种允许块、样式、表格属性完成 API round-trip + 浏览器重新打开；包含归档/回收站迁移数据校验。

### A04 / P2：笔记文件处理中仍允许恢复重载，成功上传成为孤立附件

**状态：笔记已实际复现；日程相同遗漏由代码路径确认，未另做动态复现。**

位置：`web/src/features/page/Pages.tsx:301`、`:325`；`web/src/features/event/Events.tsx:583`、`:611`；对照任务的 `web/src/features/task/TaskEditor.tsx:207` 有 pending/busy 禁用。

最小复现：

1. 打开笔记，令一次标题 PATCH 网络失败，使“重新载入”恢复按钮出现。
2. 上传 `pending.txt`，代理让请求已在服务端成功但延迟返回上传响应；UI 显示“正在处理文件…”。
3. 此时“重新载入”仍可点击；确认丢弃草稿，GET 成功，旧编辑器卸载。
4. 放行上传响应。附件 GET=200，但服务器正文没有附件 ID，旧编辑器完成的插入没有进入当前正文。

预期：如任务编辑器一样，在保存/文件处理期间暂禁恢复重建，或在明确取消文件操作并说明后安全完成。实际：确认只说明丢弃本地草稿，没有等待/取消上传；用户文件已经上传成功却从正文消失。尚在解析的 Markdown 导入有相同生命周期风险，未单独故障注入。

影响：附件链接/待插入内容丢失，文件残留卷中但用户无正常附件列表找回入口；不代表磁盘文件被删除。确认丢弃已有标题不等于明确确认丢弃在途文件操作。

建议：笔记/日程也接入 onPendingChange，恢复控件和恢复 handler 双重检查 busy/pending；必要时取消上传并让操作完成反馈到当前编辑器。保持当前全局路由/归档/删除的 dirty 防护。

回归条件：三类对象分别在慢上传、慢导入、保存中、保存失败后重载；文件处理未完成时不能重建编辑器，完成后可重载；不能遗留“上传成功但无链接”的静默结果。

### A05 / P2：发布依赖仍锁定已公开缺陷版本

**状态：固定版本与调用路径已确认，未动态实施 CPU/内存拒绝服务攻击。**

位置：`go.mod:3`、`Dockerfile:9`、`internal/asset/http.go:44`、`:53`、`internal/app/app.go:286`。

最小检查：用 Go 1.27.1 执行 `govulncheck v1.9.0 ./...`，退出非零。不要把输出的 7 条全视为本部署可利用：

- [GO-2026-6609](https://pkg.go.dev/vuln/GO-2026-6609)：Range 解析的 CPU 消耗问题；附件 `http.ServeContent` 和静态 `FileServer` 可达。官方 2026-10-08 公布，1.27.2 修复。
- [GO-2026-6608](https://pkg.go.dev/vuln/GO-2026-6608)：multipart MIME 头解析内存限制绕过；上传使用 `NextPart`，处于受影响路径。应用外围 `MaxBytesReader` 仍限制总读取量（默认附件20MiB+外围1MiB），因此不声称本应用可无限量读入内存。1.27.2 修复。
- GO-2026-6617、6612、6611、6603 为 HTTP/2 条件：当前仅 HTTP `ListenAndServe`，没有 TLS/H2C 配置，未证明可达。
- [GO-2026-6613](https://pkg.go.dev/vuln/GO-2026-6613) 要求 CONNECT 成功 2xx；当前 method 路由没有此行为，不列确认漏洞。
- 另有仅导入/模块层命中，未确认本产品调用，不提升严重程度。

预期：发布基线不锁定已公开修复的相关缺陷版本。实际：模块、构建镜像和文档均固定旧 patch。单人受信任网络降低威胁，但并不能使受影响代码消失。

建议：升级到至少已修复的 1.27.2 或更新受支持修复版，同时锁定对应镜像 digest，更新开发/交付记录，重跑扫描与回归。不要只在本机用新 Go 扫旧镜像；核对最终二进制 build info。

回归条件：最终镜像采用修复版本，Range、multipart 限额回归成功，扫描结果逐项解释；不要求为本次审计触发破坏性 DoS。

补充OS层（**版本通告命中已确认，应用可利用性待验证**）：Scout要求登录后，改用[Alpine官方v3.22 main secdb](https://secdb.alpinelinux.org/v3.22/main.json)与镜像内原生 `apk version -t` 比较，结果见 `alpine-advisories.json`。BusyBox 1.37.0-r19 低于修复r20，musl 1.2.5-r10 低于数据库中的r11/r12/r13修复，OpenSSL 3.5.4-r0低于后续3.5.5–3.5.8修复，zlib 1.3.1-r2低于1.3.2修复。不能把这些CVE版本候选全称为Noteapp可利用漏洞：Go程序CGO_ENABLED=0，未证明其调用OS库；BusyBox/openssl还用于容器工具。建议同时刷新运行时基础镜像与包，复核最终组件清单及可达性/不适用理由。通告匹配未涵盖main以外仓库或所有供应链风险。

## 3. 可后续处理的问题和可接受限制

- **容量/界面 P3（已测退化）**：对象列表接口返回全量正文；笔记树 `web/src/features/page/Pages.tsx:70` 起对每节点 filter 全表，任务分组也多次扫描。5000 条单类列表约42MB、上万 DOM 节点，见下表。建议先分离列表摘要与正文，再做分页/虚拟化和树索引；不要求为个人应用引入 Redis/搜索服务。现阶段应公开容量建议，不能把实测成功推广为无限容量。
- **可访问性 P3（代码确认）**：`web/src/app/App.tsx:182` 用 button 导航任务；原生新标签页/Cmd-click 不可用。`web/src/app/App.tsx:219` 布局没有跳转主内容链接。依 Vercel 指南建议用 Link 并补 skip link；未做完整读屏器验收，不据此声称 WCAG 认证失败。
- 可接受：单人无登录、单实例/单连接SQLite、本机磁盘、无离线跨设备编辑、历史版本、永久删除及附件清理；Markdown 导出有损而完整备份保留块JSON和附件；浏览器恢复缓存不属于服务端备份；备份未加密、SHA不认证来源；维护操作不支持并行同卷；SIGKILL/断电不能执行脚本退出清理。上述均已有文档说明，未作为新增缺陷。
- 上传文件先 rename 再提交数据库，进程/主机异常可留孤立文件，且没有显式 fsync 文件/目录；进程 SIGKILL 已验证提交对象保留，**突然掉电附件持久性尚未验证**，两者不能混为一谈。

## 4. 实际验证与证据

证据目录：[evidence/2026-10-25](evidence/2026-10-25)。新增脚本见 [scripts/audit](../../scripts/audit/README.md)，独立浏览器用例见 [release-audit.spec.ts](../../web/e2e/release-audit.spec.ts)。注意“reproduce”用例断言当前缺陷存在；**6/6表示复现/探测成功，不表示产品合格**，默认不混入常规回归。

| 检查 | 本轮实际结果 | 证据 |
|---|---|---|
| Go `test -count=1 ./...` | 所有有测试包通过 | go-test.log |
| Go `test -race -count=1 ./...` / `vet ./...` | 通过 / 退出0无诊断 | go-race.log / go-vet.log |
| 前端 Vitest | 10文件55/55 | frontend-test.log |
| typecheck、tsc+Vite build | 通过；主包1674.52KB/gzip519.40KB，保留大包警告 | typecheck.log / frontend-build.log |
| 既有完整 Playwright | 35/35，1.8分钟，本轮独立18187实例 | e2e-authorized.log |
| 新增独立 Playwright | 6/6：坏样式/表格、quota、pending重载、LAN/Host、有限XSS向量 | independent-browser-final.log |
| Node块迁移准备 | 4/4 | migration-tool.log |
| Python Docker运行/备份恢复 | 7/7；包含启动迁移失败、不写权限、32字节上传限额、SIGTERM、非空/篡改/错误源卷拒绝和失败恢复源状态 | docker-operations.log |
| 归档解析 | 2/2；未checkpoint WAL快照可读、路径穿越拒绝 | archive.log |
| npm audit | 0报告漏洞（不证明无漏洞） | npm-audit.json |
| govulncheck | 7条符号命中，实际路径解释见A05 | govulncheck.log、两份官方JSON |
| OS组件通告匹配 | Scout登录阻塞后，官方main secdb + apk原生版本比较完成；四类包存在版本候选，未宣称全部可利用 | alpine-advisories.json |
| Docker构建/Compose | 构建退出0；默认127.0.0.1，UID10001 | docker-build-authorized.log / container-packages.log |
| 独立磁盘故障 | 实际ENOSPC；创建/上传脱敏500；原项目可读，释放空间后新建201；无失败项目残留 | storage-faults.json |
| schema6迁移演练 | 未准备拒绝且schema仍6/旧正文不变；准备首次3项、二次reused3；随后升至8，3正文等于准备值，三组双向关系及附件SHA一致 | migration-rehearsal.json |
| 完整旅程卷备份/空卷恢复 | schema1–8、41项目/31任务/31笔记/16日程（含删除项）、10附件、3关联表等清单一致，integrity=ok/fk=[] | full-backup.log / full-restore.log / backup-manifest.json |
| 恢复后浏览器 | 1/1，重新读取块正文、父子状态、三端关联、图片与下载SHA | restored-browser.log |
| 同卷容器重建 | 新审计镜像启动后smoke7/7、恢复只读旅程1/1 | recreated-smoke.log / recreated-browser.log |
| 创建幂等/异常退出 | 独立8并发同键均201且唯一对象1；SIGKILL重启后提交任务列表逐项一致 | probe-1000.json、probe-browser-5000-retry.json |

业务约束并非只读文档核对：本轮 Go/浏览器覆盖同项目、Page循环、两层任务拒绝、父子状态独立、归档写拒绝、三组关系、删除成员同数量替换冲突、历史批次恢复隔离、浏览器LA/London与部署时区一致、块搜索/附件/导入导出。稳定性回归实际覆盖多标签版本冲突、复制窗口身份、失响应创建重试、日历已提交响应丢失后的查询确认、强制关页恢复、慢上传禁任务移动。新增quota测试用真实浏览器抛 QuotaExceededError：错误可见、自动保存暂停、输入仍在，手动重试可保存服务器；不是清理全部站点数据后的恢复保证。

### 容量和性能（端到端样本，非生产SLA）

相同单项目，每类1000/5000个容量对象（另有探测用2篇坏块笔记与1条幂等任务），正文约8KB（中英文文本），所有任务同一到期日、日程同一时间段，特意给列表/搜索施加压力；层级/关系用另外业务和恢复夹具。API每路径串行7次，统计的是 HTTP+读取+JSON解析时间，中位数/最大值，**不是p95、不是纯SQL时间**。本机回环无网络限速。浏览器仅单次冷导航，不是统计分布；内存是采样值，不是峰值。

| 指标 | 3000对象（1000/类型） | 15000对象（5000/类型） |
|---|---:|---:|
| 笔记列表响应 | 8.36MB | 41.79MB |
| 任务列表响应 | 8.41MB | 42.07MB |
| 笔记列表API中位数/最大 | 93.30 / 112.99ms | 547.80 / 828.31ms |
| 任务列表API中位数/最大 | 105.98 / 166.55ms | 609.62 / 722.41ms |
| 日程列表API中位数/最大 | 88.82 / 93.41ms | 415.88 / 545.31ms |
| 无匹配全文搜索中位数/最大 | 105.59 / 125.58ms | 554.17 / 902.45ms |
| 工作台API中位数/最大 | 15.81 / 17.15ms | 46.82 / 83.77ms |
| 浏览器任务列表可用 | 386ms，5122 DOM节点 | 933ms，25122 DOM节点 |
| 浏览器笔记列表可用 | 316ms，3081 DOM节点 | 1635ms，15081 DOM节点 |
| 编辑到自动保存确认 | 1507ms（含800ms防抖） | 1329ms（含800ms防抖） |
| 浏览器编辑时JS heap样本 | 74.18MB | 203.35MB |
| 服务内存样本 | 113.8MiB | 403.8MiB |

这说明轻量个人规模在本机可用，但5000条单类列表已为明显负担：41.8MB在100Mbps链路仅传输的理论下界约3.3秒，未含解析/渲染，不能把回环时间用于LAN承诺。**保守建议每项目每类约1000条以内、典型正文约8KB**，更大应分项目并实测，或先改列表摘要；这是一条本轮样本支持的建议边界，不是硬性拒绝上限。没有验证几万篇大正文、几GB附件、低端手机的稳定日用。

额外附件/并发结果见 `probe-final-1000.json`：另一次3000对象样本上传10个各1MiB随机附件，下载逐项SHA校验；8路搜索同时编辑的等待在该文件记录。该样本8个搜索均200，最慢930.36ms，并发编辑200/192.44ms。数据库max1conn会排队，未埋入DB.Stats，不能把HTTP延迟说成准确数据库等待时间。

### 运维可执行性和限制

本轮从全新卷安装、schema6合成旧库升级、迁移拒绝回滚、同卷重建、备份与空卷恢复均实际执行。恢复后浏览器重新读正文、关联和附件。回退/整机迁移按现有运维手册“保存旧image ID→备份→另建空卷用同image恢复→校验→切换”路径可执行，需另行搬运该image（例如docker save/load）和完整备份；没有实际跨第二台物理主机演练，也没有承诺schema原地降级。schema7→8由真实SQLite测试及合成6→8升级路径覆盖，未从用户旧备份再演练。

## 5. 命令与复现入口

从仓库根目录执行。本轮先遇到Go环境指向不可写缓存/自动工具链sumdb路径；没有修改全局配置，直接调用缓存的1.27.1。以下环境仅影响当前shell：

```sh
export GOPATH=/tmp/noteapp-go GOCACHE=/tmp/noteapp-go-cache GOMODCACHE=/tmp/noteapp-go/pkg/mod GOTOOLCHAIN=local
unset GOROOT
export PATH=/tmp/noteapp-go/pkg/mod/golang.org/toolchain@v0.0.1-go1.27.1.darwin-arm64/bin:$PATH
go test -count=1 ./...
go test -race -count=1 ./...
go vet ./...
npm test --prefix web -- --run
npm run typecheck --prefix web
npm run build --prefix web
node --test scripts/tests/prepare-block-migration.test.mjs
NOTEAPP_TEST_IMAGE=noteapp:v1-stability-20261025 python3 -m unittest -v scripts.tests.test_runtime scripts.tests.test_backup_restore
python3 -m unittest -v scripts.tests.test_archive
GOBIN=/tmp/noteapp-release-audit/bin go install golang.org/x/vuln/cmd/govulncheck@v1.9.0
/tmp/noteapp-release-audit/bin/govulncheck ./...
npm audit --prefix web --json
docker compose config
APP_IMAGE=noteapp:release-audit-20261025 APP_VERSION=8169b66 docker compose build
```

完整既有浏览器本轮使用新卷18187，未设置 E2E_BASE_URL=18080/18084：

```sh
E2E_BASE_URL=http://127.0.0.1:18187 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' npm run e2e --prefix web
```

新增独立脚本的完整命令见 scripts/audit/README.md。`run_browser.sh` 负责创建并清理自己命名的容器和卷，18187冲突则拒绝；不要把这些写入型用例指向实际实例。容量 `--count 5000 --browser` 与1000用法相同，要求Node和现有web/node_modules。存储/迁移/容量脚本都有显式 `--image`，不复用用户卷。

备份演练实际命令（名字仅为本次隔离资源）：

```sh
scripts/backup.sh --container noteapp-release-audit-20261025 --volume noteapp-release-audit-20261025 --image noteapp:v1-stability-20261025 --app-version 8169b66 --output /tmp/noteapp-release-audit/full-backup
docker volume create noteapp-release-audit-restored-20261025
scripts/restore.sh --volume noteapp-release-audit-restored-20261025 --image noteapp:v1-stability-20261025 --backup /tmp/noteapp-release-audit/full-backup
# 用18188启动恢复实例，再执行：
NOTEAPP_VERIFY_RESTORED=1 E2E_BASE_URL=http://127.0.0.1:18188 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' npm run e2e --prefix web -- acceptance-v1.spec.ts
```

### 工具失败及未覆盖项

- Go初次命令因用户缓存权限/sumdb自动工具链路径失败；后改用显式缓存工具链，test/race/vet已实际成功。
- 首次浏览器沙箱启动失败：34项在launch阶段失败、1项API用例通过；取得执行环境审批后完整35项成功。不把首次失败归为产品故障。
- Buildx首次不能写 `~/.docker/buildx/activity`；环境审批后构建成功。没有修改Docker全局配置。
- 5000容量首轮 `RemoteDisconnected`，清理前未保留现场，不能断言产品崩溃。禁用Python系统代理并增强失败state/logs留存后完整重跑成功；根因未最终证明为代理，只是排除环境变量后的重试结果。1000首轮重启校验还因Docker随机映射端口变化导致解析非JSON失败，修正探测器重读映射端口后通过。这两次是探测器/环境记录；首轮5000失败stderr单独保留，首次端口问题在此说明。
- LAN初版用例等待pageerror未捕获React Router错误边界，改为断言页面报错文本后复现成功，未改产品。
- Docker Scout 1.26.0 拒绝扫描，要求Docker登录；没有登录用户账户或修改配置。后改用官方Alpine main secdb做本地版本候选比较，脚本已保留；这不是完整镜像漏洞扫描/可利用性分析，不能宣称最终镜像无已知漏洞。
- 前端网络失败用route.abort/延迟响应注入；未完成真实TCP黑洞超时长等待测试，不能把它等同于实际超时恢复。日历PATCH和随后GET均失败后的禁拖动/同步重试分支由本轮前端单测覆盖。
- 追加报告交叉复核代理被平台安全检查拦截，未提供报告复核结果；主审依据原始日志与源码自行核对。此前安全/数据库只读代理已正常交付，不能用被拦截的追加请求作为完成证据。
- 没有物理断电/内核崩溃、真实第二台机器迁移、Safari/Firefox/真实手机、真实DNS重绑定、最大2MiB复杂表格编辑性能、超大Markdown文件解析内存、大量附件并发或上传过程中真实磁盘掉线覆盖。没有长时间浸泡/泄漏测试，没有对本次有限XSS向量以外作无漏洞保证。

## 6. Skills 来源和用途

原目录所列 Go、systematic-debugging、requesting-code-review、verification-before-completion、web-design-guidelines 等多为指向不存在 `~/.cc-switch/skills` 的失效软链接，using-superpowers也在此列；实际可读的 find-skills 位于 `~/.agents/skills/find-skills/SKILL.md`，官方 skill-installer 位于 `~/.codex/skills/.system/skill-installer/SKILL.md`。先读取这两份并检查现有目录，再恢复所需上游材料，未盲装/覆盖原技能。

| 技能 | 实际来源/安装位置 | 用途 |
|---|---|---|
| find-skills / skill-installer | 现有本地技能与OpenAI系统installer | 查验失效链接、定向取得缺失技能 |
| golang-testing 1.4.0 | [samber/cc-skills-golang](https://github.com/samber/cc-skills-golang/tree/main/skills/golang-testing)，官方installer安装到 `/tmp/noteapp-release-audit/installed-skills/golang-testing` | 检查集成测试隔离、可观察断言、race和失败归因 |
| golang-security 1.2.2 | 同仓库 `skills/golang-security`，同级tmp目录 | 输入/文件/网络信任边界、漏洞可达性与误报区分 |
| golang-database 1.3.2 | 同仓库 `skills/golang-database`，同级tmp目录 | 参数化SQL、context、关闭rows、单连接事务与提交错误；追加独立只读复核 |
| systematic-debugging | [obra/superpowers](https://github.com/obra/superpowers/tree/main/skills/systematic-debugging)，tmp/skills目录读取 | 先复现/定位根因，不修改产品 |
| requesting-code-review | 同上游 `skills/requesting-code-review` | 指派隔离只读审查代理，主审独立动态验证发现 |
| verification-before-completion | 同上游 `skills/verification-before-completion` | 本轮实际输出支撑每条通过和提交前核查 |
| using-superpowers | 同上游 `skills/using-superpowers` | 核对技能适用与优先级 |
| web-design-guidelines | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines)，并读取官方当次command.md | UI语义/键盘/大列表复核；没有照搬所有风格偏好为阻断项 |

临时取得的指南未全局注册，下次会话需保留或重新安装；原自定义技能不变。技能文件SHA见 `skills.json`。按用户范围优先原则，没有照搬通用数据库技能的换sqlx/迁移框架或安全技能的登录/多权限建议。

## 7. 发布门槛

必须关闭 A01–A05 后复审。至少需要非localhost普通HTTP真实浏览器主流程成功、任意Host拒绝、坏块原子拒绝、三类对象pending恢复安全、最终镜像采用已修复Go patch，并对OS组件通告候选提供更新或可复核的处置结论。保持当前已通过的35项业务/故障回归和备份恢复验证。

容量优化、任务导航语义、skip link可后续处理；发布说明先写清本轮实测容量建议。已有功能大部分可用，不建议重写架构；本报告也不是授权实施修复。仅报告、证据和独立复现材料纳入本地提交。测试容器/卷均已清理，审计镜像与 `/tmp/noteapp-release-audit/full-backup` 合成备份保留供复核，实际18084实例保持运行。
