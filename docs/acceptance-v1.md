当前新增功能验收：[schema9 自定义属性](implementation/2026-10-26-custom-properties.md)。

# Noteapp 第一版实际验收

当前追加版本见 [2026-10-25 发布审查修复](reviews/2026-10-25-release-fixes.md) 和 [2026-10-26 交互精简与回归](implementation/2026-10-26-task-interactions.md)，下文保留最初阶段验收证据。

验收日期：2026-10-24。**第一版10项产品验收均通过**，正式多阶段Docker镜像、同卷重建、停机全卷备份和空卷恢复均已实际执行。证据为本仓库 `docs/evidence/v1/` 的命令输出、清单与截图；早期阶段1的替代运行镜像不是本轮正式构建证据。

应用版本标签 `7a922d6-stage5`（阶段4业务实现加阶段5创建草稿保护）；最终源码提交见Git历史。固定Go1.27.1、Node26.9.0、npm11.19.1。实际最终镜像 **`sha256:3c84dfb17b8b123463e6afe6c1e088e2703424da8116632e2a9d2404ee8215ad`**，schema **1–4**。该不可变image ID也记录在[备份清单](evidence/v1/manifest.json)，恢复验证使用完全相同镜像。所有数据均为本任务创建的合成验收数据，没有访问其他应用数据。

## 产品设计第11节逐条结果

| 验收标准 | 实际操作与结果 | 证据 |
| --- | --- | --- |
| 1. 重启/重建保留项目、正文、任务、日程、附件 | 正式Compose镜像在新卷创建全功能数据；`up --force-recreate`同卷重建后smoke通过；再备份恢复，浏览器仍读取原ID的正文、Done父/Todo子、日程、三端关系和附件。通过 | [正式构建](evidence/v1/noteapp-v1-build-final.log)、[容器](evidence/v1/container.txt)、[恢复浏览器](evidence/v1/noteapp-v1-restored-playwright.log) |
| 2. 唯一任务列表、一层子任务、多层Page和有效Event | 新context UI创建项目、笔记、父子任务与跨日日程；notes浏览器建立A→B→C；真实SQLite测试验证日期及区间。通过 | [全浏览器9/9](evidence/v1/noteapp-v1-playwright-final.log)、[Go](evidence/v1/noteapp-v1-go-test.log) |
| 3. 三类Markdown、图片/下载/代码块 | Task/Page/Event共用编辑；UI源码/预览/分屏与检查项；上传PNG和中文文本。恢复实例预览代码与图片、下载两文件SHA逐字节一致。通过 | [旅程截图](evidence/v1/journey.png)、[恢复截图](evidence/v1/restored.png)、[fixture及附件SHA](evidence/v1/noteapp-acceptance-v1.json) |
| 4. 五阶段自由切换、父子独立、检查项不改阶段 | Go覆盖任意五阶段更新；tasks浏览器完成父任务且子仍Todo；notes同名检查项精确改第二项、围栏非勾选，Markdown单测检查源码位置。通过 | [Go](evidence/v1/noteapp-v1-go-test.log)、[19前端单测](evidence/v1/frontend-tests.log)、[浏览器](evidence/v1/noteapp-v1-playwright-final.log) |
| 5. 三组双向关系、重复/跨项目拒绝 | calendar-relations在LA/London浏览器从三端增删、反端同步；Go覆盖幂等与跨项目复合外键/服务拒绝；完整旅程三组关系在恢复后每端各2条。通过 | [浏览器](evidence/v1/noteapp-v1-playwright-final.log)、[恢复浏览器](evidence/v1/noteapp-v1-restored-playwright.log)、[SQL关系计数](evidence/v1/manifest.json) |
| 6. Page无循环、任务不超过一层 | notes尝试A移入C返回409；Go测2000层祖先、跨项目、父任务含子不能降级；trash恢复重新校验任务深度。通过 | [Go](evidence/v1/noteapp-v1-go-test.log)、[浏览器](evidence/v1/noteapp-v1-playwright-final.log) |
| 7. 今日/逾期、跨日Event、归档隐藏 | workspace固定Clock真实SQLite测试包含25小时DST日、完成父任务的未完成子、零点半开边界；新旅程UI工作台看到当天子任务和跨日日程；归档过滤回归。通过 | [Go](evidence/v1/noteapp-v1-go-test.log)、[浏览器](evidence/v1/noteapp-v1-playwright-final.log) |
| 8. 归档只读可取消，批次恢复严格 | UI归档页面不可写，取消后可编辑；workspace-trash先删C再删A、先恢复A不恢复C，祖先冲突、预览数量改变二次确认、关系占位恢复；Go覆盖归档所有写入口。通过 | [Go](evidence/v1/noteapp-v1-go-test.log)、[浏览器](evidence/v1/noteapp-v1-playwright-final.log) |
| 9. 保存/上传失败有错误、不丢正文 | 500/断网/409、串行延迟B→回改A、后台刷新/载入失败保稿单测和浏览器回归；实际容器32字节上限上传33字节得到413；新建Page/Task/Project草稿刷新/离开保护由2项先红后绿浏览器覆盖，空默认不误报。通过 | [19前端单测](evidence/v1/frontend-tests.log)、[浏览器](evidence/v1/noteapp-v1-playwright-final.log)、[运行时9项](evidence/v1/noteapp-v1-operations-tests-final.log)、[新建保护红灯](evidence/v1/noteapp-v1-create-drafts-red.log) |
| 10. 备份恢复到干净环境后正文/关联/附件可用 | documented scripts停机归档整个/data、自动恢复源运行状态；新空卷恢复后实际重读SQL integrity=ok/fk=[]、所有表计数与每个文件/12附件SHA一致；新浏览器读取Markdown与三端关联和下载。通过 | [备份](evidence/v1/noteapp-v1-backup.log)、[恢复](evidence/v1/noteapp-v1-restore.log)、[清单](evidence/v1/manifest.json)、[SHA](evidence/v1/SHA256SUMS)、[恢复浏览器1/1](evidence/v1/noteapp-v1-restored-playwright.log) |

## 真实环境、恢复数量与命令

正式测试源：容器 `noteapp-v1-check-noteapp-1`，命名卷 `noteapp-v1-check`，本机 `127.0.0.1:18084`。恢复目标：新空卷 `noteapp-v1-restored-20261024`、容器 `noteapp-v1-restored-check`，`127.0.0.1:18085`。原来的 `noteapp-formal-check` 容器已停止并移除，原数据卷保留；恢复验证实例18085已停止，18084预览继续运行。正常容器实际UID/GID10001，数据目录可写；故意root:700卷的独立负例退出1，未以root运行应用绕过权限。

备份目录 `/tmp/noteapp-v1-backup-20261024-acceptance`（完整归档保留本机，不把数据库提交Git）。总记录数包含已软删除对象和历史验收批次：

| 表 | 源清单与恢复一致的总数 |
| --- | ---: |
| projects | 31 |
| tasks | 24 |
| pages | 39 |
| events | 18 |
| task_pages / task_events / page_events | 6 / 3 / 3 |
| assets | 12 |
| delete_batches / recent_visits | 11 / 49 |
| schema_migrations | 4 |

本次停机后SQLite正常关闭，归档无需剩余WAL/SHM；脚本不排除它们，另外用真实未checkpoint的WAL/SHM快照测试证明存在时会完整归档、校验并读取未checkpoint记录。附件清单逐个SHA保存在manifest，完整旅程的PNG为 `d126d616641d42ac8b0a07ec302c9fa1ec049f86200931a0a60c8f3080284b77`，中文文本为 `f0a1126b4e05012526f2ffbec0039b8bcc840326597b80a24fcb3107c2e22776`。

```sh
# 不修改用户全局环境；本机goenv残留GOROOT，故命令显式去掉。
env -u GOROOT GOPATH=/tmp/noteapp-go GOCACHE=/tmp/noteapp-go-cache GOMODCACHE=/tmp/noteapp-go/pkg/mod go test ./...
env -u GOROOT GOPATH=/tmp/noteapp-go GOCACHE=/tmp/noteapp-go-cache GOMODCACHE=/tmp/noteapp-go/pkg/mod go test -race ./...
env -u GOROOT GOPATH=/tmp/noteapp-go GOCACHE=/tmp/noteapp-go-cache GOMODCACHE=/tmp/noteapp-go/pkg/mod go vet ./...
npm run typecheck --prefix web
npm test --prefix web -- --run
npm run build --prefix web
E2E_BASE_URL=http://127.0.0.1:18084 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' npm run e2e --prefix web
python3 -m unittest scripts.tests.test_runtime scripts.tests.test_backup_restore scripts.tests.test_archive
docker compose config
APP_VERSION=7a922d6-stage5 docker compose build
COMPOSE_PROJECT_NAME=noteapp-v1-check APP_VOLUME_NAME=noteapp-v1-check APP_PORT=18084 APP_VERSION=7a922d6-stage5 docker compose up -d --no-build --force-recreate
scripts/backup.sh --container noteapp-v1-check-noteapp-1 --volume noteapp-v1-check --image noteapp:local --app-version 7a922d6-stage5 --output /tmp/noteapp-v1-backup-20261024-acceptance
docker volume create noteapp-v1-restored-20261024
scripts/restore.sh --volume noteapp-v1-restored-20261024 --image noteapp:local --backup /tmp/noteapp-v1-backup-20261024-acceptance
docker run -d --name noteapp-v1-restored-check -p 127.0.0.1:18085:8080 -v noteapp-v1-restored-20261024:/data noteapp:local
NOTEAPP_VERIFY_RESTORED=1 E2E_BASE_URL=http://127.0.0.1:18085 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' npm run e2e --prefix web -- acceptance-v1.spec.ts
```

结果：Go test/race/vet全部通过；typecheck通过；前端6文件19单测通过；build通过；所有Playwright **9/9**通过（35.8秒）；恢复后独立浏览器 **1/1**通过；Docker/归档运维 **9/9**通过。Compose config和正式多阶段build退出0，包含容器内npm ci/build和Go编译。smoke源/目标两边均7项通过。npm audit为0漏洞，见[audit](evidence/v1/noteapp-v1-audit.log)。

额外运行时边界：有效SQLite但已有冲突tasks表触发迁移失败，容器退出1且无listening日志；无写权限卷同样启动退出1；正常SIGTERM在15秒内退出0；真实超限413；畸形/多JSON/未知字段/null请求400且统一error。失败备份原运行容器恢复运行、原停止容器保持停止、非空目标拒绝、归档篡改拒绝、错误源卷拒绝；归档路径穿越拒绝。

## 安装、升级与限制

安装与开发按 [README](../README.md)，完整停机备份、空卷恢复、镜像版本和升级回退步骤按 [operations](operations.md)。新建默认配置已通过独立Compose project/空卷启动，API与静态页面同源。升级先保存旧image ID并验证备份，恢复先用相同image ID，另建卷演练后才切换；不自动降级schema。

已知限制：单人免登录、仅受信任网络、SQLite单实例；无离线编辑/历史版本/永久删除/附件清理；候选一次加载项目元数据；当前前端主包约1.65MB（gzip527KB）有非阻断大包警告。时区回拨歧义输入明确拒绝，手改Event时间按分钟精度，未改的秒与原偏移保留。备份未加密；SHA只检损坏，不认证来源；需要Python3.9+和主机临时磁盘空间；SIGKILL/断电不能保证退出清理，失败目标不得覆盖重试；禁止并行维护同一卷。macOS浏览器测试需授权在沙箱外启动已有Brave，Playwright在Node26打印DEP0205但不影响测试结果。


## 2026-10-24 块编辑补充验收

用户确认用块编辑替代Markdown固定模式工具栏。BlockNote0.56.0适用于任务/笔记/日程，正文JSON主存储和原文保护随schema6交付。完整浏览器23/23通过，另拖动/互通2/2通过，最终Docker镜像5/5及空卷恢复后1/1通过；9份块文档、投影、原文逐条比较一致。实际项目已按用户授权全部移入回收站，部署实例活跃/归档列表均为0。详细检查、命令、镜像ID、备份路径及已知限制见 [块编辑记录](implementation/2026-10-24-block-editor.md)。

## 2026-10-24 前端交互补充验收

父任务可选、笔记直接创建、月历选时自动创建/改期、对象默认自动保存及黑白深蓝样式优化已交付。完整浏览器29/29、前端单测26/26通过；最终提示/样式调整后的相关回归6/6、日程单测7/7通过；Docker构建及18084部署后smoke7/7通过，重建前后用户项目ID保持一致。详情见[交互优化记录](implementation/2026-10-24-interaction-polish.md)。

## 2026-10-25 块唯一正文

正文接口与schema7只保留body_document，移除Markdown/旧原文字段，搜索直接从块读取。Go test/race/vet、前端单测26/26、完整浏览器29/29、准备工具4/4、Docker运维9/9通过。schema6→7隔离卷与正式卷各87份文档逐条对比、关系/元数据及12附件SHA一致；schema7备份干净卷恢复与三类编辑器打开通过。详见[块唯一正文验收](implementation/2026-10-25-block-only.md)。

## 2026-10-25 V1稳定性收尾

修复持久草稿、删除快照、上传移动互斥、创建幂等/日历结果确认及正文限额不一致。新增故障注入及复制标签页覆盖后完整浏览器35/35，前端单测55/55、Go test/race/vet、Docker运维9/9通过；schema7→8隔离升级/空卷恢复及正式升级逐表数据/12附件SHA一致。验收范围为既定单人本机或受信任局域网，具体证据及剩余边界见[稳定性验收](implementation/2026-10-25-v1-stability.md)。
