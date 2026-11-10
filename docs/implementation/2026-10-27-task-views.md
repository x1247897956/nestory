> 历史设计/实施记录：保留当时范围与验证结果。当前界面、正文格式及功能请以[项目介绍](../../README.md)为准；旧Markdown三模式、多层笔记界面等描述不代表当前行为。

# 任务列表与阶段看板

用户新增视图功能，本轮提供列表/看板。看板按现有五阶段分列，每个任务（含子任务）在其当前阶段显示一次，卡片展示标题、父任务上下文、优先级与截止日期。父子状态独立，不联动完成。

视图偏好按项目保存在当前浏览器；存储被阻止时仍可在本次页面内切换。优先级筛选共用，列表分组按钮仅在列表显示。卡片点击使用现有居中详情，关闭回到当前视图，汇总来源仍留在汇总背景。

跨阶段拖动及卡片原生select共用原Task PATCH版本检查。拖动需匹配当前组件内真实drag ref、项目和任务payload，外部伪造数据不会修改任务；忙碌时禁用阶段变更，归档禁用拖动/选择/创建。失败不乐观移走卡片，重新取服务器状态并展示错误；冲突不覆盖他人更新。

每列+按钮在现有创建弹窗预选且显示该阶段；普通新建默认Todo，默认payload省略stage保持旧创建幂等输入形状。取消/导航/成功均重置创建阶段，预选阶段本身不视为未输入草稿，用户主动修改阶段受未保存保护。子任务创建和正文恢复规则未改。

横向滚动限制在看板容器，手机可使用44px选择器和新增按钮。第一版跨列拖动只修改阶段，同列不重排；视图配置尚不提供自定义阶段或额外自定义保存视图。没有新增依赖、后端接口或schema。

## 验证记录

- 旧镜像确认缺少视图入口，新增用例按预期失败。
- 前端构建、71项单元测试通过；Go task/app API测试通过。
- 新增6项浏览器测试通过（8.7秒）：项目偏好、详情返回、父子拖动/选择与优先级、失败及真实409冲突、归档、手机长标题与分列创建、存储被阻止和外部拖动。
- 首次专项5通过1失败来自优先级label的严格DOM文本匹配，改用精确可访问combobox后通过；没有放宽业务断言。
- 运维10项通过，包含容器重建和干净卷备份恢复；保留既有Python3.15 SQLite ResourceWarning。
- 新鲜独立审查未发现确认的P1/P2；补充覆盖了存储被阻止与外部拖动。未改既有品牌/图标工作区内容。

复现：`npm test --prefix web -- --run`、`npm run build --prefix web`、`go test -count=1 ./internal/task ./internal/app`；`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' sh scripts/audit/run_browser.sh noteapp:task-views-20261027`；`NOTEAPP_TEST_IMAGE=noteapp:task-views-20261027 python3 -m unittest discover -s scripts/tests -p 'test_*.py'`。所有浏览器/运维测试只用独立卷。

最终完整浏览器回归：104/104通过（4.5分钟），见browser-full.log。专项及完整旅程截图均已检查，证据目录保留桌面、手机和按列创建示例。

部署：镜像`noteapp:task-views-20261027`，ID `sha256:205e14ad2e493912c02a6daf08cd979b2cceba2be135c5f1e7bdd17e751a6e2f`，已更新到本机18084；时区、Host允许列表、原数据卷不变，smoke7/7通过。before-task-views/after-task-views备份均校验成功，14张表逐行相同，附件清单相同。没有数据迁移。
