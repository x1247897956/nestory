# 2026-10-24 前端交互与默认自动保存

## 已实现

- 黑白灰底色、深蓝操作点缀；统一列表、标题、属性行、按钮和保存状态。项目行去掉首字徽标及置顶前缀，置顶顺序和菜单仍保留。对象详情减少重复项目大标题。
- 任务父任务属性改为选择器。移动调用现有带版本号的事务接口；正文未保存时禁用移动，移动中锁定编辑与导航；有子任务的父任务不能再成为子任务。同项目和一层子任务约束仍由后端验证。
- 笔记列表不再混入新建表单。点击“新建笔记”直接创建无标题笔记、进入全页块编辑器并选中标题；子笔记从列表项操作创建。创建失败可重试，路由新建入口防重复提交。
- 项目日历默认月视图；点击日期默认09:00–10:00，选择周视图时间段沿用选区。“新建日程”打开紧凑窗口；有效标题和起止时间停止输入800ms后自动创建，进入完整日程编辑器。结束时间必须晚于开始时间；请求中冻结表单，失败保留草稿并可重试。
- 日程拖动/拉伸以原版本号保存时间，失败回滚日历并提示错误。隐藏时区解释文案，底层仍使用部署时区转换；两个浏览器时区的回归保留。
- 任务、笔记、日程默认自动保存，移除日常保存按钮。保留已保存/未保存/保存中/失败状态、失败重试、冲突处理和离开提示。空标题与无效日期不发请求，草稿保留。
- 保留共享对象属性、折叠关联及BlockNote块编辑，不新增后台属性系统或自定义字段。没有改变数据表、迁移版本或锁定依赖。

图片中的区域是旧笔记创建表单，不是正文编辑器；本次已移除。

## 交互参考

借鉴[Notion Calendar的选时与事件创建](https://www.notion.com/en-gb/help/manage-your-calendars-and-events)以及[Linear的父子任务关系](https://linear.app/docs/parent-and-sub-issues)，限定在现有单人项目范围。使用已锁定FullCalendar6.1.19及BlockNote0.56.0，未追随新版升级。

## 实际验证

- `npm run build --prefix web`：通过（包含tsc项目构建）；主包仍存在超过500KB的非阻断警告。
- `npm run test --prefix web -- --run`：8文件26/26通过。
- 临时SQLite实例18086完整Playwright：29/29通过，1.5分钟。首次26/29，三个失败定位为新增父任务选择器使旧的全局定位歧义、旧断言仍期待父任务链接；将新建操作限定在对应对话框，详情断言检查选择器实际值后完整重跑通过。
- 最终提示文案和移动日期排版调整后：日程相关单测7/7通过；相关浏览器回归6/6通过（27.9秒）。
- 桌面1440×960与手机390×844真实Brave截图检查；修正月/周选中按钮文字对比度、手机日期换行。截图在本机`/tmp/noteapp-{task-desktop,calendar-desktop,calendar-dialog,calendar-mobile}.png`，未作为用户数据提交。
- 独立只读代码审查发现置顶前缀遗漏，已修正；未发现其他可确认的重要问题。

所有写入型浏览器测试只用独立临时数据库。此次未修改后端，无数据库迁移；先前备份恢复验收仍见块编辑和V1验收记录。本次不声称重复执行了备份恢复演练。

## 复现

```sh
npm run build --prefix web
npm run test --prefix web -- --run
# 用独立APP_DATA_DIR启动临时Go服务（前端通过Go embed，构建后需重启服务）
E2E_BASE_URL=http://127.0.0.1:18086 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' npm run e2e --prefix web
docker build --build-arg APP_VERSION=interaction-polish-20261024 -t noteapp:local -t noteapp:interaction-polish-20261024 .
COMPOSE_PROJECT_NAME=noteapp-v1-check APP_VOLUME_NAME=noteapp-v1-check APP_PORT=18084 docker compose up -d --no-build --force-recreate
python3 scripts/operations.py smoke --url http://127.0.0.1:18084
```

限制：现有乐观并发冲突需用户处理；自动保存依赖网络，失败草稿留在当前编辑会话并提示，不能承诺断电或强行关闭浏览器仍恢复。新建笔记会留下无标题对象，符合直接创建行为；无标题日程不会创建。手机侧栏沿用现有上方布局。

## 部署结果

最终Docker build退出0；镜像`noteapp:interaction-polish-20261024`，ID `sha256:ae4665766658c165c0f14a351c85d8920971211a9973deea401814351b3ba832`。Compose重建成功，实际挂载仍为`noteapp-v1-check:/data`，18084只读smoke7/7通过；重建前后活跃项目ID集合一致（1个），静态JS/CSS指纹对应最终构建。原有用户对象没有用于测试。资源验证首次使用无尾斜杠的URL得到400，补全`/`后验证通过。
