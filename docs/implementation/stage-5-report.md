> 历史设计/实施记录：保留当时范围与验证结果。当前界面、正文格式及功能请以[项目介绍](../../README.md)为准；旧Markdown三模式、多层笔记界面等描述不代表当前行为。

# 阶段 5：备份恢复与第一版交付报告

日期：2026-10-24。以阶段5 brief、两份spec、前四报告及最终限定复审为依据。第一版功能与运维门槛已实际通过；逐条产品验收、不可变镜像ID和全部证据索引见 [acceptance-v1](../acceptance-v1.md)。不修改progress/final-review，不增加业务API、不增Go/npm依赖、不推送远程。

## 实现

- `scripts/backup.sh` / `restore.sh` / `smoke.sh` 为POSIX入口，`operations.py`只用Python3.9+标准库与Docker命令，不要求pip。备份强制明确容器、卷、镜像、应用版本、输出目录；核对/data真实挂载与精确image ID，拒绝其他运行卷使用者。
- 备份先停指定服务，打包整个/data，保留存在的WAL/SHM与所有附件。临时解包只读SQLite检查integrity/fk，记录schema、全部表/关系计数、所有文件和每个附件SHA；归档和清单有SHA256SUMS。只有验证成功才发布输出目录。finally先清除helper，再尝试恢复原运行状态；原停止保持停止，清理异常也不跳过重启尝试。
- restore先校验SHA、归档成员安全、SQLite和清单，再用 `volume-nocopy` 挂载显式存在的空目标，禁止覆盖；匹配原image ID，解包后修正10001所有权。写完重新读取目标卷逐项验证真实SQL/文件/附件，而非仅检查源归档。文档明确失败目标可能部分恢复，需另建空卷，不自动覆盖重试。
- Compose显式image/version/volume参数，15秒停机宽限、固定digest、多阶段构建及非root不变；镜像OCI revision标签；README与operations完善安装、升级备份、空卷恢复和故障边界。
- 关闭最终复审P2：新建Page/Task/Project使用data-dirty与统一beforeunload；Page/Task导航取消保留草稿，Project取消需确认，空默认不误报；创建在途保护并禁用输入，成功提交后同步解除保护再导航，失败仍保稿。

## 实际命令结果

| 检查 | 实际结果 |
| --- | --- |
| Go test / race / vet | 全部通过，证据各自log |
| 前端typecheck | 通过 |
| Vitest | 6文件19测试通过 |
| 前端build | 通过，主包约1.65MB/gzip527KB；大包警告为已记录限制 |
| npm audit | 0漏洞 |
| 全部Playwright | 正式最终镜像 **9/9通过，35.8秒** |
| 恢复新context浏览器 | **1/1通过，1.1秒**；正文/预览/三端关系/父子阶段/两个附件SHA |
| 真实Docker运维与归档用例 | **9/9通过**（3 runtime + 4 backup/restore + 2 archive） |
| docker compose config/build | 正式多阶段构建成功，最终镜像ID `sha256:3c84dfb17b8b123463e6afe6c1e088e2703424da8116632e2a9d2404ee8215ad` |
| 同卷重建 | `up --no-build --force-recreate`，原ID的全功能数据保留 |
| 停机备份/空卷恢复 | 通过；integrity=ok、fk=[]，schema1–4，全表计数与12附件SHA一致 |
| source/restored smoke | 两实例各7项通过 |
| shell语法/Python编译/git diff --check | 通过 |

所有命令实际文本与产品第11节10项覆盖在acceptance-v1，检查输出（仅规范化日志尾部空白）与截图在 `docs/evidence/v1/`。完整DB归档仅本机 `/tmp/noteapp-v1-backup-20261024-acceptance/data.tar.gz`，未提交Git；证据目录约460KB，无实际用户外部数据。

## 红灯、定位与修复

- backup/restore真实Docker测试先在缺脚本时红灯；实现后3/4过，restore拒绝空卷。定位Docker会把镜像/data/assets默认copy-up进新卷，改用volume-nocopy后4/4通过。
- 归档安全失败（链接）在停机之后触发，测试确认原运行实例被恢复运行，失败输出未发布；原停止实例保持停止，篡改归档拒绝，非空目标拒绝且原正文可读。
- 真实未checkpoint WAL/SHM快照测试读取未checkpoint记录，归档成员包含两文件；另外路径穿越归档被拒绝。
- 运行时迁移冲突的有效SQLite fixture使启动退出1且无listening；root:700卷使非root应用退出1（驱动错误文字为unable to open database/14，测试按实际语义断言）。正常SIGTERM在15秒内退出0，实际配置32字节上传33字节413，四种异常JSON400统一error。
- 最终复审新建草稿2项浏览器先实际红灯（beforeunload不阻止），修复后2项通过；完整UI创建成功跳转也没有误报。全量旅程重复运行后工作台同名对象locator冲突，改用本次对象href，随后9/9通过。这是测试隔离修正，业务代码未为测试开后门。

## 真实恢复数据和保留状态

全新Compose测试卷 `noteapp-v1-check` 在18084创建完整浏览器旅程数据：项目8064f60715393c1cf8493a8297ad8402、Page af25102a0220779c8cc5cc956cf12663、Done父fc63259558e8a22bc0d0f44a66e00f73、Todo子2d7973832a5646b05af72548691fb560、跨日Event104f226503f8df840241757fa2b5c89a；三组关联均存在，Page附件含PNG与中文txt。包含重复回归数据的整卷计数为31项目/24任务/39Page/18Event，关系6/3/3，12附件，11批次，49recent，schema4。清单和恢复输出保留逐项结果。

- **保留运行预览**：`noteapp-v1-check-noteapp-1`，`127.0.0.1:18084`，卷 `noteapp-v1-check`。
- **恢复实例已停止**：`noteapp-v1-restored-check`，原端口18085，卷 `noteapp-v1-restored-20261024`保留，可用同image ID再次启动。
- **旧formal-check容器已停止并移除**（协调者明确授权），卷 `noteapp-formal-check`原样保留。未操作其他应用。
- 自动化runtime/backup测试的临时命名容器与卷已清理。备份目录、本轮fixture、截图也仍在/tmp；Git仅保留manifest/SHA/log/截图，不含完整数据库与附件归档。

## 限制

脚本依赖主机Python3.9+和足够临时空间；SHA非认证签名，备份未加密。SIGKILL/断电/daemon不可用无法保证清理；需人工核对运行状态。并行维护同卷须由操作者避免，非分布式维护锁；失败目标禁止覆盖重试。SQLite单实例、免登录受信任网络、无永久删除或附件自动清理、大bundle等原产品边界仍在。固定依赖与普通构造函数保持，未扩展范围。
