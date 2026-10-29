> 历史设计/实施记录：保留当时范围与验证结果。当前界面、正文格式及功能请以[现行产品说明](../current-product.md)为准；旧Markdown三模式、多层笔记界面等描述不代表当前行为。

# 属性折叠、颜色与跨类型复用

- 任务详情页移除创建任务入口，列表和项目汇总保留。
- 属性区默认收起；显式展开编辑。折叠仅隐藏内容，不卸载自动保存与本地草稿，保存错误会自动展开提示。
- 统一名称列和内容列的内边距，固定阶段圆点在值容器内部；关联名称使用相同图标留白。
- 单选、多选可在属性设置为每个选项选择灰、棕、橙、黄、绿、蓝、紫、粉、红。旧选项没有 color 时显示中性色。
- 添加属性弹层提供同项目其他对象类型的已有属性，复制名称、kind、选项 ID 和颜色到当前类型的新定义，值为空。
- 同类型对象继续自动共享定义。复用后的定义按类型独立管理，来源后续修改不会隐式改动目标。
- 目标同名属性不重复展示；API 继续执行同类型名称唯一约束。复制使用源版本锁和现有创建幂等协议。
- 无新表/迁移：颜色存放在已有 options JSON 内，固定枚举验证，不接受任意 CSS。

计划验收：真实临时 SQLite 的原子性/隔离/非法颜色/归档/幂等验证；浏览器折叠时保存、默认折叠、跨类型复制且值独立、颜色持久化、键盘与窄屏检查；备份后部署并核对原数据。

审查修复：颜色/名称保存尚未返回时用户收起属性，若随后 PATCH 失败，原设置弹层已关闭。现在不仅展开外层，还重新打开包含该错误的弹层，让实际错误与重试操作可见。新增延迟保存失败回归，验证输入保留、重新显示、重试成功。

完整回归发现父任务调整会重建编辑器，使已展开属性意外收起。现在在当前 tab 内按项目/类型/对象ID保留展开选择；刷新重新默认收起。独立审查已复核错误弹层及此项状态保留修改，无新的 actionable 问题。

验证依据：
- Go 新增真实临时 SQLite 测试，覆盖非法颜色不提交、跨项目/过期来源拒绝、复用元数据/颜色、同请求幂等、目标重名拒绝、源修改不影响已复制定义、不复制值、归档拒绝。
- 原有浏览器用例显式展开其要操作的属性；新增用例单独验证真实默认折叠状态，不通过全局浏览器 fixture 自动展开。
- 文字对齐采用实际文本 Range 坐标与阶段圆点边缘，避免只比较不同 padding 容器外框。
- 运维干净卷恢复用例现同时验证单选/多选颜色，恢复前后完整属性视图一致。

## 最终验收

- Go `go test -race -count=1 ./...` 通过，`go vet ./...` 通过。
- 前端 14 个文件、71 项单元测试通过；TypeScript/Vite 构建通过，保留既有大包体提示。
- 最终 Docker 镜像全量浏览器回归 80/80 通过。含默认折叠、收起期间保存、所有对象类型、同项目跨类型复用且值隔离、单选/多选颜色、源/目标独立、关闭弹层后延迟错误恢复、父任务移动后的状态保留。
- Python 运维检查 10/10 通过，其中从备份恢复到干净卷后单选、多选的颜色及完整属性视图一致。
- 独立代码审查未发现后端问题；已修复并复核错误弹层 P2。
- 1261/773/390px 浏览器截图通过文字坐标和圆点边缘检查，未出现横向溢出。

复现：

```sh
env -u GOROOT GOPATH=/tmp/noteapp-go GOCACHE=/tmp/noteapp-go-cache GOMODCACHE=/tmp/noteapp-go/pkg/mod GOTOOLCHAIN=go1.27.3 /Users/seyr1n/.goenv/versions/1.25.12/bin/go test -race -count=1 ./...
npm test --prefix web -- --run
npm run build --prefix web
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' sh scripts/audit/run_browser.sh noteapp:property-controls-20261026
NOTEAPP_TEST_IMAGE=noteapp:property-controls-20261026 python3 -m unittest discover -s scripts/tests -p 'test_*.py'
```

证据：`docs/evidence/property-controls-20261026/`。初次专项中止及修复前回归的失败日志均保留，不作为最终通过结果。

## 部署及数据核对

镜像 `noteapp:property-controls-20261026`，ID `sha256:0ec469790545a4fc8da7c02dd06fff0217dcf58fe197ad2b9b7d83d3d792b62b`。
使用原 `noteapp-v1-check` 数据卷，`127.0.0.1:18084`，`Asia/Shanghai`，schema9 不变。
部署前 `backups/2026-10-26-before-property-controls`、部署后 `backups/2026-10-26-after-property-controls` 均通过完整性验证。
7 项冒烟检查通过。13 张内容/元数据/迁移表逐行相同，附件清单完全相同；访问表的58个对象身份保留，其中2条 `visited_at` 正常前移，未把访问时间更新误报为业务数据丢失。

首次严格比较在访问时间差异处中止；随后检查其主键集合、列名、时间单调性，并继续核对其余所有表，完整结果保存在 `data-preservation.log`。
