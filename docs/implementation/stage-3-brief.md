> 历史设计/实施记录：保留当时范围与验证结果。当前界面、正文格式及功能请以[现行产品说明](../current-product.md)为准；旧Markdown三模式、多层笔记界面等描述不代表当前行为。

## 阶段 3：独立日程与项目内关联

**文件范围：** internal/event/、internal/relation/、migrations/003_events_relations.sql、web/src/features/{event,relation}/、web/e2e/calendar-relations.spec.ts。

**接口：** /projects/{id}/events?from=...&to=...、/events/{id}；三类详情的 /relations；/relations/{kind}/{left_id}/{right_id}。from/to 为带偏移的 RFC3339 半开区间，限制单次查询不超过 366 天。

- [ ] 先做日历小验证：周视图、月视图、中文、跨日事件、浏览器时区与部署时区不同时的输入展示；固定同主版本插件与时区适配依赖。
- [ ] 写日程区间测试：结束不晚于开始拒绝、相邻区间不相交、跨日命中、允许重叠。创建 Event 不要求关联 Task。
- [ ] 完成点选时间段新建、日程详情与 Markdown 描述；第一版通过表单改时间，拖拽调整不作为验收要求。
- [ ] 创建三张关联表与正反向索引，编写复合外键与服务校验测试；重复 PUT 幂等，跨项目与已删除端点拒绝。
- [ ] 完成共享关联选择器，展示 Page 路径、Task 阶段、Event 时间；任一端增删后刷新另一端缓存。
- [ ] 执行 go test ./...、前端类型检查/单元测试/构建和 calendar-relations.spec.ts。

**验收场景：** 在“毕业设计”创建“讨论方案”Event，关联“实验方案”Page 和“执行实验”Task；从三端都能看到关系，任一端移除后另一端一致。修改日程时间不改任务截止日期；尝试关联其他项目失败。

**阶段门槛：** 时间判断与三组关系经过数据库和浏览器双重验证。

