<p align="center">
  <img src="web/public/icon.svg" width="88" height="88" alt="Nestory" />
</p>

<h1 align="center">Nestory</h1>
<p align="center"><strong>让想法、行动和时间，在同一个项目里相遇。</strong></p>
<p align="center">个人项目管理 · 块笔记 · 任务看板 · 日历</p>
<p align="center">
  <a href="#产品预览">产品预览</a> ·
  <a href="docs/operations.md">部署文档</a>
</p>

---

Nestory 是一个可以自行部署的个人工作空间。围绕项目整理笔记、任务和日程，让记录下来的想法有下一步行动，让安排好的时间有对应的上下文。

打开工作台查看跨项目的安排，进入项目专注一件事。无需注册账号，数据保存在你部署的设备上。

## 产品预览

![Nestory 项目汇总：集中查看任务、笔记和日程](docs/assets/project-overview.png)

[![Nestory 操作演示：列表与看板切换、阶段拖动、笔记和日历](docs/assets/product-tour.gif)](docs/assets/product-tour.mp4)

[观看完整演示 · MP4](docs/assets/product-tour.mp4)

## 一个项目，三种表达

### 写下想法

用块笔记整理资料、记录讨论和梳理思路。输入 `/` 插入标题、待办、表格、代码、图片或文件，拖动块调整结构；也可以导入和导出 Markdown。

![Nestory 块笔记：正文、清单、关联与自定义属性](docs/assets/block-note.png)

### 推进行动

在列表与看板之间切换，用阶段、优先级和截止日期安排任务。把较大的任务拆成一层子任务，通过筛选、排序和分组折叠，找到现在需要关注的事情。

![Nestory 看板：按阶段组织任务](docs/assets/task-board.png)

### 安排时间

用周/月日历查看日程，用时间轴查看活动跨度。可以在日历中拖动改期，也可以直接从工作台选择时段，创建所属项目的日程。

<details>
<summary>查看任务列表与日历</summary>

![Nestory 任务列表](docs/assets/task-list.png)

![Nestory 月日历](docs/assets/calendar.png)

</details>

## 把内容连接起来

- **双向关联**：将同项目的笔记、任务和日程连接起来，从任何一端回到相关内容。
- **自定义属性**：添加备注、网址、单选或多选。属性在同项目同类型内容中共用，各条内容独立填写。
- **统一编辑体验**：详情居中打开，属性可以折叠，正文直接编辑并自动保存。
- **工作台与搜索**：集中查看未完成任务和日历，搜索笔记、任务及日程的标题和正文。
- **归档与恢复**：结束的项目可以归档；误删内容可以从回收站按删除批次恢复。

## 例如，准备一次分享

在“技术分享”项目里，新建一篇笔记收集资料，把“完成初稿”和“准备演示”加入任务，再创建一场彩排日程。将它们相互关联后，可以从彩排直接打开讲稿，也可以从任务回到参考资料。

资料、进度和时间各有自己的位置，也能随时找到彼此。

## 自行部署

通过 Docker Compose 部署 Nestory，在自己的设备上保存笔记、任务和日程。

[查看部署指南 →](docs/operations.md)

当前版本面向个人使用，适用于本机或受信任的局域网。

## 致谢

感谢以下开源项目为 Nestory 提供支持：

- [BlockNote](https://www.blocknotejs.org/)：块编辑器。
- [FullCalendar](https://fullcalendar.io/)：日历组件。

## 许可证

本项目采用 [MIT License](LICENSE)。
