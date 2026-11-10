> 历史设计/实施记录：保留当时范围与验证结果。当前界面、正文格式及功能请以[项目介绍](../../README.md)为准；旧Markdown三模式、多层笔记界面等描述不代表当前行为。

# 2026-10-25 V1稳定性修复与验收

## 已修复

1. **编辑草稿仅存在内存**：任务、笔记、日程接入持久恢复键，编辑时同步保存块草稿、服务器基线和版本。正常刷新自动恢复同窗口未保存内容；新窗口读取旧草稿时要求明确恢复，服务器基线变化则暂停覆盖。保存成功只清理已确认快照，较新编辑继续保留。存储失败明确提示，不声称已安全保留。重新载入只有GET成功且草稿清理成功后才重建编辑器，失败继续保留当前页面。
2. **删除预览数量相同却成员已更换**：预览增加规范化成员类型/ID/版本fingerprint，删除事务重新计算并要求一致；新增A→C同数量与后代编辑测试。
3. **上传/导入中移动父任务丢待插入内容**：共享编辑器报告pending状态，任务移动按钮在处理文件和正文保存期间禁用，移动处理函数再次检查；归档也拒绝在未保存/文件处理中执行。上传完成并保存后再移动，附件链接保持。
4. **已提交但响应丢失导致重复创建/错误日历回滚**：schema8的creation_requests与项目/任务/笔记/日程创建在同一事务提交，按请求ID、作用域和规范输入重放原结果，重启后仍有效。前端同一待确认意图重用ID，明确取消后可另建；笔记新建失败可重试或明确放弃，避免混淆新操作。日历PATCH响应失败会GET服务器确认并更新缓存/版本；GET也失败则禁用拖动，直到显式同步成功。
5. **正文2MiB与HTTP1MiB不一致**：文档限制统一2MiB，HTTP外层允许3MiB并将超限映射413；前端请求前检查UTF8序列化块大小并明确提示拆分，草稿不丢弃。真实SQLite接口测试证明1.2MB中文正文能保存、超过文档/请求上限均原子拒绝。

不改变既定Go模块化单体、SQLite、React和块正文架构。新事务辅助函数限定于创建幂等性，未引入微服务、Redis、队列、复杂DI或通用属性/工作流引擎。

## 严格复核中补充的问题

- 第一版请求身份只按路径/输入持久化，审查发现不同窗口同名创建会被合并。改为窗口隔离后，又发现浏览器复制标签页可能复制sessionStorage；新增context name和React挂载前BroadcastChannel活跃身份探测。浏览器测试主动同时复制sessionStorage与window.name，两个窗口的相同输入仍产生两个独立对象。
- pagehide直接关闭探测通道会影响BFCache返回后复制；改为仅普通pagehide关闭，persisted pagehide保持回应，单测覆盖两个分支。限定复核确认关闭。
- 恢复清理异常此前只显示错误但仍可能重建编辑器；现改为抛出错误阻止重建，并有单测。

## 实际检查

| 检查 | 结果 |
| --- | --- |
| Go test ./... | 全部通过 |
| Go test -race ./... / go vet ./... | 全部通过 |
| 前端tsc+Vite build | 通过，既有大包提示仍存在 |
| 前端单测 | 10文件55/55通过 |
| 完整Playwright | 35/35通过，1.8分钟 |
| Docker多阶段构建 | 退出0 |
| Docker runtime/备份恢复/归档 | 9/9通过，恢复后同request_id重放验证相同对象 |
| schema7→8隔离升级 | smoke7/7、逐表比较及附件SHA通过 |
| schema8备份→第二空卷恢复 | 清单/SQLite校验、启动smoke7/7通过 |
| 正式升级 | smoke7/7，最终业务表/附件比较通过 |

新增6项真实浏览器测试在独立临时数据库执行：上传返回延迟期间禁止移动、丢失创建响应并刷新后重试不重复、强制关闭标签页后恢复正文、同数量成员替换拒绝旧删除预览、日历已提交但响应丢失后与服务器同步、复制标签页独立创建。另有真实SQLite并发8次同键创建、持久结果重启重放、输入/作用域碰撞、请求结果写入失败事务回滚测试。

记录失败而不掩盖：正文上限回归先复现1.2MB请求400，再修复为成功；首次新增日历拖动测试用周日最后一列向右越界未触发PATCH，改用周中夹具后通过。完整回归首轮33/35，旧笔记测试严格期待没有request_id而阻断请求、旧冲突测试只期待服务器409文案；现接受明确request_id并断言提前冲突保护，使用新临时库重跑35/35。事件单测补齐新增abandonCreateIntent mock后通过。自动审批额度不足曾使浏览器命令未执行，额度恢复后已实际执行；Docker daemon未运行，正常沙箱启动受限，授权启动已安装Docker后完成验证，没有改动Docker源或配置。

## 升级与数据证据

新镜像`noteapp:v1-stability-20261025`，ID `sha256:a8c2a74e1628f0d132a2c922ed1165b96530eb36d9e4435e3e146d64d245bebf`。实际实例`noteapp-v1-check-noteapp-1`，18084，沿用`noteapp-v1-check:/data`。部署前后35项目、28任务、40笔记、19日程、45删除批次、57访问记录及三张关联表所有行完全一致，87份块正文没有被改写；12附件SHA256一致。新创建结果表为空，schema从7增加到8。见[演练对比](../evidence/stability/upgrade-comparison.json)和[正式对比](../evidence/stability/final-upgrade-comparison.json)。

本机完整备份（不进Git）包括：

- `backups/2026-10-25-before-v1-stability`：首次schema7备份。
- `backups/2026-10-25-v1-stability-rehearsal`：隔离升级后schema8备份，已另建空卷恢复。
- `backups/2026-10-25-final-before-v1-stability`：正式停机前重新捕获的最新schema7备份。
- `backups/2026-10-25-after-v1-stability`：实际升级后schema8完整备份。

回退仍按运维手册另建空卷恢复，保留旧`noteapp:block-only-20261025`镜像。真实用户数据未用于写入型E2E。

## 边界和验收判断

本轮已确认的五类问题及复核衍生问题已修复，并有故障测试。既定单人、本机/受信任局域网范围的V1主功能可验收，无需重写架构。此结论不表示穷尽所有设备/浏览器/断电组合，亦不包含多人协作或互联网公开部署。

本机恢复缓存不跨浏览器/域名/端口/设备；浏览器存储被清理、禁用或额度不足时必须按提示复制草稿或保存服务器，不能保证强制清理后恢复。尚未提交的新建表单不作为跨设备离线工作流；外部API调用者要提供request_id才获得创建幂等性。请求结果目前不自动清理。正常恢复仍需数据库与附件备份，不能用浏览器草稿代替整库备份。

复现命令：

```sh
env -u GOROOT GOPATH=/tmp/noteapp-go GOCACHE=/tmp/noteapp-go-cache GOMODCACHE=/tmp/noteapp-go/pkg/mod /Users/seyr1n/.goenv/versions/1.25.12/bin/go test ./...
env -u GOROOT GOPATH=/tmp/noteapp-go GOCACHE=/tmp/noteapp-go-cache GOMODCACHE=/tmp/noteapp-go/pkg/mod /Users/seyr1n/.goenv/versions/1.25.12/bin/go test -race ./...
env -u GOROOT GOPATH=/tmp/noteapp-go GOCACHE=/tmp/noteapp-go-cache GOMODCACHE=/tmp/noteapp-go/pkg/mod /Users/seyr1n/.goenv/versions/1.25.12/bin/go vet ./...
npm run build --prefix web
npm run test --prefix web -- --run
# 先以独立APP_DATA_DIR启动18086临时服务。
E2E_BASE_URL=http://127.0.0.1:18086 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' npm run e2e --prefix web
python3 -m unittest scripts.tests.test_runtime scripts.tests.test_backup_restore scripts.tests.test_archive
```
