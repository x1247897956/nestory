> 历史设计/实施记录：保留当时范围与验证结果。当前界面、正文格式及功能请以[项目介绍](../../README.md)为准；旧Markdown三模式、多层笔记界面等描述不代表当前行为。

# Noteapp 实施记录

## 基线
- 用户授权按五阶段顺序实施、测试、Docker 演练和本地提交；禁止推送发布。
- 完整读取产品设计、技术设计、路线图。初始目录仅有三份文档，无适用 AGENTS.md，无应用代码和 Git。
- 本机：Go 1.27.1 darwin/arm64、Node 26.9.0、npm 11.19.1；Docker Desktop 引擎可用。
- 在指定目录初始化 implementation 分支，保留并提交原设计。
- Ruling: 使用用户明确指定的空白项目目录原地开发，不额外建立 worktree；目录和初始文档均保留，若需隔离可由 Git 分支恢复。

## 阶段 1
- 实施任务见 stage-1-brief.md；先约束测试，再 API/SQLite，再 React 页面，再容器与端到端验收。
- 执行由 stage1 实施子代理负责；主代理负责审查与阶段衔接。
- 尚未声称任何应用检查通过。

## 阶段 1 结果
- 提交 e973ada；Go test/vet/race、前端typecheck、5单测、build、tasks.spec.ts通过，详见stage-1-report.md。
- 独立审查发现项目version快照、后台刷新/手动重载丢稿问题；修复并新增回归，复审通过。
- 替代Linux runtime非root容器重建同卷持久化通过；正式多阶段build基础层慢下载仍待完成。
- Ruling: 已有可运行容器和重建数据验证，阶段2源码继续推进，正式多阶段构建保留未勾选并作为最终交付硬门槛；若正式镜像兼容性不同需返工构建。

## 阶段 2
- 执行stage-2-brief：Page树、共享Markdown、串行自动保存、安全附件。
- stage2子代理实施，主代理跟进正式Docker下载和独立审查。

## 阶段 2 结果
- 实现9f7ed91、修复9680c03；Go test/vet、前端typecheck/15单测/build、浏览器3/3、进程重启附件SHA一致通过。
- 审查发现嵌套检查项冒泡和保存B期间回改A导航保护漏报；红绿回归后修复，独立复审通过。
- 正式Docker构建仍待下载，不声称通过。

## 阶段 3
- 独立Event、部署时区日历、三组双向关联；stage3实施，主代理审查与构建跟进。

## 阶段 3 结果
- 提交1c9d5b7；Go test/vet、前端19单测/typecheck/build、Brave5/5通过（LA/London浏览器时区与Shanghai部署不同）。
- 审查修复正文保存抹秒/回拨偏移和新建日程离开丢稿，红绿测试+浏览器回归，复审通过。

## 阶段 4
- 今日/搜索/recent、删除预览/批次恢复、全对象归档只读；stage4实施。

## 正式构建补验
- Docker基础镜像相同digest缓存下载成功；正式docker compose build退出0。
- 正式非root镜像重建同卷，正文/独立父子阶段/Event/三组关联/附件SHA一致通过，详见docker-build-check.md。
- 最终阶段5仍重新构建最新源码并执行空卷备份恢复。

## 阶段 4 结果
- 提交7a922d6；Go test/vet、前端19测试/typecheck/build、6浏览器流程通过。
- 审查发现先删子任务再移动父级后恢复可造第三层，事务复验层级修复；delete-preview补成员清单；红绿回归并复审通过。

## 阶段 5
- 停机备份、空卷恢复、实际PRAGMA与附件校验、完整浏览器/容器/最终文档交付；由stage1代理承接最终交付任务。

## 阶段 5 与最终结果
- 提交c1e8244、73c65cd；正式最终镜像3c84dfb17b8b123463e6afe6c1e088e2703424da8116632e2a9d2404ee8215ad。
- Go test/race/vet、前端19单测/typecheck/build、Playwright9/9、运维9/9、恢复浏览器1/1通过；完整数据空卷恢复SQL/关系计数/12附件SHA一致。
- 全分支最终审查仅发现新建Page/Task/Project未保存保护缺口，浏览器先红后绿修复，限定复审通过。
- 主代理最终复核Go test、前端19单测、运行预览smoke七项、git diff --check通过。
- 按用户既定要求保留implementation分支和工作目录，未创建远程、未推送或发布。
- 本机预览127.0.0.1:18084，合成验收数据卷noteapp-v1-check；恢复实例已停止，验收数据卷/备份保留。
- 第一版10项产品验收及五阶段路线图全部实际完成，最终交付见README、docs/operations.md、docs/acceptance-v1.md。

## 2026-10-25 独立发布审查修复

A01–A05已修复；独立复核新增表格空物理行约束和块菜单关闭残影也已修复。Go1.27.3、Alpine3.22.7固定digest。最终59浏览器、66前端单测、Go test/race/vet、4迁移工具及9运维测试通过。正式18084实例原卷重建、停机备份和干净卷恢复均完成，12表全部行值及12附件SHA保持一致。详见 docs/reviews/2026-10-25-release-fixes.md，原始独立审查保持不变。
