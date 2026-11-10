> 历史设计/实施记录：保留当时范围与验证结果。当前界面、正文格式及功能请以[项目介绍](../../README.md)为准；旧Markdown三模式、多层笔记界面等描述不代表当前行为。

# 项目表单色调与汇总行高

根因：项目表单仍使用早期modal的米绿色背景、绿色遮罩与标签；汇总空状态、单行笔记、双行任务/日程分别由不同padding/min-height控制。

修复：ProjectForm增加语义class，使用局部样式统一白底、灰色文字、蓝灰遮罩、深蓝主操作和焦点；新建与修改共用。没有改变创建、错误、禁用、未保存提示行为。汇总空状态和一项内容都采用64px外框（内容行62px+边框），双行元信息统一20px/16px及2px间隔；多项累计、长内容自然撑高。

验证：构建和独立容器相关浏览器回归，计算实际颜色、空/有内容高度，覆盖1261/773/390宽度；检查新建项目、取消草稿保护、菜单与完整验收流程。没有后端、schema或依赖变更。保留工作区已有品牌与设计素材改动。

实际结果：构建成功，相关17项浏览器回归全部通过（24.8秒），包含完整V1旅程、项目表单创建、空/有内容实际高度、三种对象来源、草稿取消保护和删除菜单。截图检查了桌面与手机。此轮仅CSS及语义class变化，没有新增业务逻辑，不重复Go和业务单测。

复现：npm run build --prefix web；PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' sh docs/evidence/project-surfaces-20261026/run-related-browser.sh noteapp:project-surfaces-20261026。

部署：project-surfaces-20261026更新到18084，启动smoke7/7通过。before-project-surfaces/after-project-surfaces备份通过校验，14张表逐行相同、附件清单相同。
