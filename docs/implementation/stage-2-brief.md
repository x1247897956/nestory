> 历史设计/实施记录：保留当时范围与验证结果。当前界面、正文格式及功能请以[现行产品说明](../current-product.md)为准；旧Markdown三模式、多层笔记界面等描述不代表当前行为。

## 阶段 2：页面树、Markdown 与附件

**文件范围：** internal/page/、internal/asset/、migrations/002_pages_assets.sql、web/src/features/page/、web/src/components/markdown/{MarkdownEditor,MarkdownPreview,useAutosave}.tsx（hook 使用 .ts）、web/src/components/markdown/markdown.css、web/e2e/notes.spec.ts。

**接口：** /projects/{id}/pages、/pages/{id}、/pages/{id}/move；/projects/{id}/assets、/assets/{id}。PATCH 使用正文快照和 version，附件返回稳定 URL。

- [ ] 先写真实数据库测试：多层页面、同级排序、移入自身/后代拒绝、跨项目父级拒绝；深层遍历不依赖调用栈。
- [ ] 完成页面树和稳定 ID 路由，支持新建子页面、改名、选择父页面和调整顺序；不要求首版实现拖拽。
- [ ] 实现源码、预览、分屏，共用 CodeMirror 与 Markdown 预览；将 Task 描述切到同一组件。
- [ ] 先写编辑器行为测试：重复检查项只改指定项；代码围栏内的 - [ ] 不作为可勾选任务；禁用脚本与危险协议。
- [ ] 实现 800ms 防抖和串行保存队列。模拟请求延迟、500、断网与 409，确认旧响应不覆盖新输入；离开编辑页提示未保存。
- [ ] 完成限额流式上传、随机存储名、图片展示与附件下载；测试同名文件、超限、路径穿越文件名、HTML/SVG 下载响应。
- [ ] 执行 go test ./...、前端类型检查/单元测试/构建和 notes.spec.ts，验证重启后图片及下载链接有效。

**验收场景：** 创建 A → B → C 页面树，尝试将 A 放到 C 下应失败。输入中文、代码块、两个同名检查项和图片，切换分屏不丢稿；只勾选第二项。保存失败后保留全文，重试成功。上传失败有明确反馈。

**阶段门槛：** 笔记和任务正文可日常使用；本阶段仍不暴露删除入口。

