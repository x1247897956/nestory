# 工作台日历创建日程检查记录（2026-10-28）

## 范围与修复

工作台日历缺少 interaction 插件与点击/选择回调，旧镜像实际点击无法打开创建弹窗（baseline-red.log）。现在月视图点击日期、周视图点击半小时槽位或框选区间均可创建，在弹窗中选择活跃项目并填写标题后自动保存，留在工作台刷新日历。时区使用服务端配置。加载、空项目、无效时间、未保存关闭和未知结果重试有对应状态。

创建响应丢失时锁定原输入并重试同一幂等意图；即使目标项目随后归档、候选列表移除该项目，仍可确认已提交的原结果。新增三个真实 API 浏览器用例覆盖以上流程，使用独立临时数据卷。

第一次完整浏览器回归为 127 通过、1 失败，暴露已有多选属性在删除选项后显示空白的问题（browser-first-run.log）。为该情况先补失败单元测试（property-baseline-red.log），再使展示依据仍存在的选项，空值显示“未选择”。不改服务端写入逻辑。

## 复现命令

```sh
npm run test --prefix web -- --run
npm run build --prefix web
docker build -t noteapp:workbench-create-20261028 --build-arg APP_VERSION=workbench-create-20261028 .
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' sh scripts/audit/run_browser.sh noteapp:workbench-create-20261028
NOTEAPP_TEST_IMAGE=noteapp:workbench-create-20261028 python3 -m unittest discover -s scripts/tests -p 'test_*.py'
```

## 已知边界

日程必须属于项目，无活跃项目时不能创建。月视图默认 09:00–10:00，跨日期框选仍以起始日期的一小时时段初始化，弹窗可修改结束时间；周视图使用实际选择区间。完整回归使用本机 Brave Chromium，未覆盖全部浏览器。构建仍有已有的大包提示，运维测试仍有 Python SQLite ResourceWarning；须以各日志最终退出结果判断。

## 最终结果

- 前端构建及 Docker 镜像构建成功。
- 单元测试：23 文件、102 项通过。
- 完整浏览器回归：128 项通过（4.7 分钟），包含工作台新增的 3 项；首次失败与后续修复均保留日志。
- 运维测试：10 项通过，包含干净数据卷的备份/恢复验证。
- 已重建本机 `noteapp-v1-check-noteapp-1`，运行 `noteapp:workbench-create-20261028`；18084 端口健康及静态前端检查通过。
- 升级前后备份分别位于 `backups/2026-10-28-before-workbench-create` 和 `backups/2026-10-28-after-workbench-create`。逐表数据与附件清单比较结果见 data-comparison.log，原数据保留。
- 保留原有未提交的品牌修改（App.tsx、workspace.css、index.html、design/、public/），未纳入本次提交；容器构建使用当前工作区外观。
