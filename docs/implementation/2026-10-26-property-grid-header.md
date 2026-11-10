> 历史设计/实施记录：保留当时范围与验证结果。当前界面、正文格式及功能请以[项目介绍](../../README.md)为准；旧Markdown三模式、多层笔记界面等描述不代表当前行为。

# 两列属性与统一顶部

需求：默认/自定义属性起点对齐，双列自动排行；统一项目、全局页面和详情顶部。

实现：属性区使用单一行优先CSS Grid，默认属性与自定义属性的包装使用display:contents，避免两套网格留空。两列等宽，列间40px，标签116px+间隔12px；容器不足720px切单列，手机标签104px。保留默认折叠、自动保存、错误恢复和原有DOM阅读/焦点顺序。select使用统一绘制箭头，清除浏览器默认文字内缩；关联、日期、文本、选项和网址统一内容内边距。

顶部使用56px导航节奏，项目汇总去掉独立的大标题栏，保留标题语义和描述；全局/列表/详情共用字号、分隔、图标及间距。描述存在时自然增加高度。保留用户工作区已有品牌/图标/设计文件，本次不提交这些独立改动。

检查：构建、单元测试、独立容器浏览器回归；桌面1261、中屏773、手机390截图及真实几何检查。部署前后备份核对实际数据，无业务数据迁移。

实际检查记录：
- 构建成功；前端单元测试14文件71项通过。
- 完整浏览器回归87通过、1失败：新增顶部高度检查发现57px，已修正为56px；相关19项最终回归结果见browser-final.log。
- 截图检查后移除关联数量徽标旧负边距，增加徽标左边缘与值列一致的断言；桌面/中屏/手机截图在证据目录。
- 未改后端、依赖或schema，因此本轮不重复Go业务测试与恢复演练；此前版本完整Go竞态/运维验证记录见2026-10-26-object-dialog-options.md。
- 复现：npm test --prefix web -- --run；npm run build --prefix web；PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' sh docs/evidence/property-grid-20261026/run-related-browser.sh noteapp:property-grid-20261026。全量运行用scripts/audit/run_browser.sh。

部署验收：最终19项相关浏览器用例全部通过（29.3秒），7项本机smoke通过；镜像noteapp:property-grid-20261026已部署到18084。前后备份分别为backups/2026-10-26-before-property-grid与after-property-grid，14张数据库表逐行相同，附件清单相同。没有数据清理。
