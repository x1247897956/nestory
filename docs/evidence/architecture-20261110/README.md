# 架构清理与验证（2026-11-10）

## 范围

- 后端保持Go模块化单体、普通构造函数与SQLite专用业务服务。app.go从326行缩减为73行，专注依赖组装；项目、任务/笔记/日程、跨对象、工作台路由与服务器保护分别管理。移动原有handler，不改变路径、参数、响应或事务。36项原字面量路由全部保留，动态关联/回收站注册循环原样迁移。
- 前端共享目录从components/markdown改为components/editor，MarkdownEditor按需加载包装器改名LazyBlockEditor；仍使用同一BlockNote编辑器和同一块正文JSON。清除已无正式调用方的旧MarkdownPreview、4项仅测试旧预览器的测试、旧CodeMirror/实时Markdown样式。
- 删除react-markdown、remark-gfm、rehype-highlight三个直接依赖；lockfile包记录从394降为293，其余保留包版本没有改变。没有宣称主包因此缩小：这些旧包本来就不在正式界面的可达导入链中；这是维护/安装复杂度清理。
- Docker产品标签更新Nestory。Python维护工具、Node迁移/测量/媒体工具保持原路径和行为；scripts/README与内部architecture说明实际边界。用户README没有增加技术架构入口。

## 语言与运行环境

正式服务是Go程序加内嵌静态前端；TypeScript的.ts与.tsx为同一语言，后者支持React语法，编译后浏览器执行JavaScript，HTML/CSS负责入口与样式。Python不提供业务API，operations.py在主机按需使用标准库处理tar/SHA/SQLite离线检查/Docker操作。

迁移用.mjs是为了使用锁定BlockNote原生解析器；.cjs素材脚本采用CommonJS，二者都是Node工具，并非额外前端框架或后端服务。候选镜像实际执行命令确认有noteapp二进制、无python3/node、无/src目录，见runtime.log。

## 已执行验证

- 基线API/httpx测试通过；基线前端23文件102测试通过。
- 清理后API测试、全Go race与vet通过，继续使用真实临时SQLite验证事务。
- 前端22文件98测试通过；减少4项是退役预览器的孤立测试。现有块编辑、自动保存和恢复测试未删除。
- 前端和Docker镜像构建通过。首轮Docker因npm官方registry下载EIDLETIMEOUT失败，缓存后重试成功，保留首次日志。未换浮动版本或引入依赖框架。
- 主机Node26.12.1/npm11.20.0与项目锁定工具链有EBADENGINE提示，宿主构建/测试通过；Docker构建仍使用锁定Node26.9.0/npm11.19.1。Go依go.mod与Dockerfile保持1.27.3。
- 10项主机运维测试通过，包括干净卷备份恢复。
- 独立只读审查未发现具体可执行问题，核对路由与middleware顺序、目录导入、样式依赖和运行边界。
- 首轮浏览器130项通过、1项因测试定位器歧义失败：懒加载提示与保存提示同时使用status，旧验收定位器未区分。将验收定位限定在现有autosave-indicator内；未改变生产保存逻辑，第二轮完整回归131项全部通过（4.9分钟），见browser-retry.log。
- 本机18084容器已更新并健康；7项基础接口/静态前端检查通过。更新前后备份对比：14张表结构及完整内容一致，附件清单一致。见deploy.log、smoke.log与data-comparison.log。

## 复现

```sh
env -u GOROOT go test -race -count=1 ./...
env -u GOROOT go vet ./...
npm run test --prefix web -- --run
npm run build --prefix web
docker build -t noteapp:architecture-20261110 --build-arg APP_VERSION=architecture-20261110 .
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' sh scripts/audit/run_browser.sh noteapp:architecture-20261110
NOTEAPP_TEST_IMAGE=noteapp:architecture-20261110 python3 -m unittest discover -s scripts/tests -p 'test_*.py'
```

本轮未进行数据库迁移或重写备份协议；没有全面抽象存储层或把应用拆成微服务。App.tsx仍有应用级状态，保留后续按实际复杂度进一步提取feature逻辑的边界。设计探索稿保留，不纳入本次提交。
