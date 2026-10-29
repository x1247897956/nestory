> 历史设计/实施记录：保留当时范围与验证结果。当前界面、正文格式及功能请以[现行产品说明](../current-product.md)为准；旧Markdown三模式、多层笔记界面等描述不代表当前行为。

# 近期改动审计与稳定性回归

审查起始提交：`dc19720d9dc18e4fb7ba63dffa019c5cdbb45f7d`。覆盖 `f579eeb..dc19720` 的属性折叠/颜色/同项目跨类型复制、属性与选项删除、居中详情、汇总来源导航、两列布局、顶部及项目表单。

执行日期：2026-10-26 至 2026-10-27，Asia/Shanghai。证据目录：`docs/evidence/recent-audit-20261026/`。

## 范围与方法

三份独立只读审查分别覆盖导航/自动保存、属性前后端/事务与并发、UI/响应式/测试覆盖。主代理逐项用旧镜像复现，再实施最小修复并全量回归。所有创建、删除、磁盘故障、迁移和恢复测试仅使用独立数据库、容器、卷。

开始时工作区已有未提交的 `web/index.html`、App品牌、workspace品牌标记及 `design/`、`web/public/`。这些独立改动保留，没有混入审计修复提交。测试镜像包含当时的工作区品牌资源；原始补丁和资源SHA在证据目录，镜像ID明确锁定。此次不把含未提交独立工作区改动的构建标为正式版本发布标签。

## 确认问题与修复

| 编号 | 级别 | 触发与影响 | 修复 | 验证 |
| --- | --- | --- | --- | --- |
| A01 | P2 | 先访问对象B，再在A删除B已选多选项；返回B后继续选择，旧缓存值与新版定义混用，保存冲突/失败 | 仅在选项删除确认后移除同项目同类型inactive字段缓存，再刷新当前对象；不重挂载活跃草稿、不删除本地恢复记录 | `cache-before.log`：期望新选项却仍为null；新增浏览器缓存回归 |
| A02 | P2 | 两列布局的display:contents消除原定位盒；属性较多时关联面板在整个属性区底部，离触发行429px | 关联details建立自身定位上下文 | 旧版几何断言失败；新增触发行距离检查 |
| A03 | P2 | 关联请求处理中收起属性，失败后外层虽展开，内部details仍闭合，错误不可见 | 揭示错误时打开root内全部祖先details | 延迟PUT失败、折叠后错误可见回归 |
| A04 | P2 | 桌面长项目名撑出详情导航，覆盖后续层级/关闭区域 | 导航可收缩，项目名和当前对象名截断，类型与关闭按钮保留空间 | 旧版右边缘1399.5超过关闭按钮1133.5；1261/773/390断点回归 |

修复文件：CustomProperties.tsx、PropertyField.tsx、ObjectProperties.tsx、property-layout.css、object-dialog.css。UI三项修复经独立审查复核，无新增明确P1/P2。

测试代码问题：首次完整回归97通过、1失败；新增长项目名含“项目名称”，使旧任务旅程的模糊`getByLabel`误匹配侧栏。将定位限定为新建项目dialog里的精确label；应用镜像不变，重新执行完整套件。首次新增回归的缓存用例曾误用link而任务行实际是button；修正后用`cache-before.log`重新确认该产品缺陷，不以定位器失败作为缺陷证据。

## 已执行检查

- 最终完整浏览器回归：98/98通过（3.9分钟），含四项新增回归；原97/98失败记录和最终结果均保留。
- Go真实临时SQLite集成测试及 `go test -race -count=1 ./...`：通过。
- `go vet ./...`：通过。
- 前端构建：通过，保留既有大于500kB chunk提示。
- Vitest：14文件、71项通过；修复后再次71项通过。
- Python运维：10项通过，包含容器重建、备份及干净卷恢复；Python3.15有现有SQLite连接ResourceWarning，退出码0。
- 2MiB临时卷写满/附件权限故障：失败返回500且已有数据仍可读；释放空间后可继续创建。
- 迁移演练：未准备schema6正文拒绝启动且原始内容保留；重复准备可复用；升级schema9后正文、三端关系、附件SHA保持，integrity_check=ok、foreign_key_check为空。
- npm audit：0条报告漏洞。
- govulncheck：应用符号/实际导入包0命中；模块级GO-2026-5024属于`golang.org/x/sys/windows`的NewNTUnicodeString，Linux/arm64部署目标扫描和darwin宿主扫描均未导入该包。未为这一不适用路径盲目升级依赖。首次工具路径错误保留日志，后使用已缓存Go1.27.3工具链成功执行。
- Alpine官方v3.22 main secdb版本比对：候选镜像包0个低于已知修复版本的命中；仅为版本通告范围检查，不是全面可利用性测试。

迁移演练第一次请求未执行：自动审批服务额度不足，属于审查服务失败而非安全性否决；2026-10-27额度恢复后按同一已授权命令成功补跑，没有绕过审批。

## 证据与复现

候选镜像：`noteapp:recent-audit-20261026`，ID `sha256:9b02839874eefaaed990cec59a5ab47343bc1faf797f7aeb70bd660b7cdc0663`。

```sh
npm test --prefix web -- --run
npm run build --prefix web
go test -race -count=1 ./...
go vet ./...
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' sh scripts/audit/run_browser.sh noteapp:recent-audit-20261026
NOTEAPP_TEST_IMAGE=noteapp:recent-audit-20261026 python3 -m unittest discover -s scripts/tests -p 'test_*.py'
python3 scripts/audit/storage_faults.py --image noteapp:recent-audit-20261026
python3 scripts/audit/migration_rehearsal.py --image noteapp:recent-audit-20261026
python3 scripts/audit/alpine_advisories.py --image noteapp:recent-audit-20261026
```

宿主Go检查使用缓存工具链1.27.3，具体环境和原始命令见本轮执行记录；镜像构建使用Dockerfile锁定的工具链和依赖。浏览器runner需要18187端口空闲并自动清理自己的卷。

## 验收边界

覆盖桌面Brave/Chromium及手机宽度模拟，没有声称真实Safari/Firefox/iOS/Android设备验收、长期浸泡测试或全面渗透测试。免登录仍限定本机/受信任局域网。模块级通告和大包体积提示列为已说明范围，不把扫描结果扩展为“软件无漏洞”。跨标签页真实并发修改仍采用版本冲突及保留输入；不提供实时多人同步。

## 审计结论

本轮发现并修复4项P2，未发现尚未处理且可确认的P1/P2。当前通过本轮验收，可继续新增功能；本结论限于上述代码范围、运行场景和检查方法。正式发布前仍应统一提交独立品牌/素材改动，使发布源码与构建完全对应。本轮候选镜像及工作区资源指纹已保留为可核对基线，没有推送远程或发布外部服务。

## 本机部署与数据核对

2026-10-27 已将上述候选镜像更新到 `http://127.0.0.1:18084`，compose项目仍为noteapp-v1-check，原卷noteapp-v1-check、时区Asia/Shanghai、允许主机配置不变。7项启动smoke通过。

前后备份为backups/2026-10-27-before-recent-audit与after-recent-audit，均校验成功。14张表逐行完全一致（包括58条最近访问记录），附件清单一致。开始时的独立品牌文件与public资源SHA也完全一致，保留未提交状态。
