## 阶段 1：项目与任务闭环

**文件范围：** cmd/noteapp/main.go、internal/app/app.go、internal/platform/{config,database,httpx,clock,id}/、internal/project/、internal/task/、migrations/001_core.sql、web/src/app/、web/src/features/{project,task}/、web/e2e/tasks.spec.ts、Dockerfile、compose.yaml、.env.example、README.md。

**接口：** /healthz、/readyz、/config；/projects、/projects/{id}；/projects/{id}/tasks、/tasks/{id}、/tasks/{id}/move。定义错误响应、version 和归档写保护，后续模块复用。

- [x] 记录 Go/Node 版本、依赖版本与许可证，生成 go.mod/go.sum 和前端锁文件；创建本地 Git 仓库并提交文档与骨架，不配置远程或发布。
- [x] 写迁移、连接配置和临时数据库测试；健康检查区分进程存活与数据库可用。
- [x] 用集成测试先覆盖：空标题拒绝、日期格式无效拒绝、五阶段自由切换、非法阶段拒绝、同项目父子、孙任务拒绝、父子阶段独立。
- [x] 完成项目侧栏、新建/修改项目、任务列表、分组/筛选、任务详情、一层子任务、优先级和截止日期。Task 正文先使用受控源码输入，阶段 2 替换为共享编辑器。
- [x] 实现乐观版本和事务内归档检查；两个标签页先后更新同一版本，后提交收到 409，草稿仍在。
- [ ] 完成单容器构建和持久化卷；提供 go run ./cmd/noteapp 与前端开发命令。
- [x] 执行 go test ./...、go vet ./...，前端 npm run typecheck、npm test -- --run、npm run build；执行 tasks.spec.ts。

**验收场景：** 创建“毕业设计”项目，添加“读论文”父任务和“读摘要”子任务；完成父任务后子任务仍为 Todo；刷新和重建容器后内容保留；第三层任务和跨项目父级被拒绝。项目归档后普通修改返回 409，取消归档后可以继续编辑。

**阶段门槛：** 页面可独立使用，数据通过真实数据库持久化；本阶段不暴露尚未实现的删除按钮。


## 阶段 2：页面树、Markdown 与附件
