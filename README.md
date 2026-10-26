# Noteapp

单人、本地或受信任局域网使用的项目、任务与笔记软件。第一版提供五阶段任务与一层子任务、多层笔记、共享块编辑与安全附件、独立日历、三组双向关联、工作台、搜索、项目归档和按批次删除恢复。SQLite与附件在同一数据卷持久化，无登录或团队协作。

本次审查修复见 [发布修复验收](docs/reviews/2026-10-25-release-fixes.md)。实际验收与限制见 [第一版验收](docs/acceptance-v1.md)，安装、升级、备份恢复见 [运维手册](docs/operations.md)。

## 开发

固定工具链：Go **1.27.3**、Node **26.9.0**、npm **11.19.1**。依赖版本见 `go.mod` / `web/package-lock.json`，许可证见 [依赖记录](docs/implementation/dependencies.md)。

```sh
cd web
npm ci
npm run build
cd ..
go run ./cmd/noteapp
```

打开 [本地应用](http://localhost:8080)。Go 编译时内嵌 `web/dist`，首次运行必须先构建前端。

前端热更新：另开终端执行 `cd web && npm run dev`；后端用 `APP_DEV_ORIGIN=http://127.0.0.1:5173 go run ./cmd/noteapp`。浏览器打开 [Vite](http://127.0.0.1:5173)，`/api` 同源代理至 8080。前端不会向任意来源开放 CORS。

| 环境变量 | 默认值 | 含义 |
| --- | --- | --- |
| APP_ADDR | 127.0.0.1:8080 | 本地 Go 监听地址；容器显式设为 :8080 |
| APP_ALLOWED_HOSTS | localhost,127.0.0.1,::1 | 所有路由允许的精确主机名/IP，不含端口、URL或通配符 |
| APP_DATA_DIR | ./data | SQLite 与附件存储目录 |
| APP_TIMEZONE | Asia/Shanghai | 部署时区，启动校验 |
| APP_UPLOAD_LIMIT | 20971520 | 单附件最大字节数，20 MiB；正整数 |
| APP_DEV_ORIGIN | 空 | 额外允许的开发浏览器 Origin |
| APP_BIND | 127.0.0.1 | Compose 端口绑定 |
| APP_PORT | 8080 | Compose 主机端口 |
| APP_IMAGE | noteapp:local | 构建/启动的镜像引用 |
| APP_VERSION | development | 镜像中的源码版本标签，发布时设为commit |
| APP_VOLUME_NAME | noteapp_noteapp-data | 显式真实命名卷，升级须沿用旧卷 |

若安装多个 Go 版本后出现 `compile: version ... does not match go tool version ...`，检查 `go env GOROOT` 和 `go tool compile -V`；本次环境残留 goenv 的 GOROOT，使用 `env -u GOROOT go test ./...` 可恢复工具链一致性，无需修改用户全局配置。受限环境可把 `GOPATH`、`GOCACHE`、`GOMODCACHE` 和 `npm_config_cache` 指向可写目录。

## Docker

```sh
cp .env.example .env
APP_VERSION=$(git rev-parse HEAD) docker compose up -d --build
scripts/smoke.sh --url http://127.0.0.1:8080
```

单容器提供 API 和静态前端，非 root UID/GID 10001 运行；默认真实命名卷 `noteapp_noteapp-data`（APP_VOLUME_NAME） 持久化整个 `/data`。固定镜像标签与 digest 见 Dockerfile。默认仅本机可访问；受信任局域网部署须同时设置 `APP_BIND=0.0.0.0`，并在 `APP_ALLOWED_HOSTS` 中追加实际访问的主机名或 IP，例如 `localhost,127.0.0.1,::1,192.168.1.20,noteapp.home`。请求 Host 可带端口，配置项不带端口；未知 Host 对所有路由返回 403，不信任转发头。当前没有身份验证。

更新/重建：`docker compose up -d --build --force-recreate`。停止：`docker compose down`。不要执行 `docker compose down -v`，那会删除数据卷。

## 检查

```sh
go test ./...
go test -race ./...
go vet ./...
cd web
npm run typecheck
npm test -- --run
npm run build
npx playwright install chromium
# 或使用现有 Chromium：
# PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="/path/to/chromium" npm run e2e
npm run e2e
cd ..
python3 -m unittest scripts.tests.test_archive
# 本机已有最终Docker镜像时，另验证备份恢复与容器错误边界：
python3 -m unittest scripts.tests.test_backup_restore scripts.tests.test_runtime
```

Playwright 默认启动 Go 后端并使用 `/tmp/noteapp-e2e-data` 临时数据库和 18080 端口；可用 `E2E_BASE_URL=http://127.0.0.1:8080 npm run e2e` 对已运行实例验证。测试会创建带时间戳项目，建议使用测试实例。

所有 HTTP JSON 接口位于 `/api/v1`：`/healthz` 检查进程、`/readyz` 检查数据库、`/config` 提供时区和阶段元数据；项目、任务、页面、日程、双向关联、工作台、搜索及回收站接口见技术设计。PATCH 与 move 必须提交 version。400 为参数错误，404 为不存在，409 为版本/归档/父级冲突，500 不暴露数据库详情。任务、笔记和日程编辑页在停止输入 800ms 后自动保存，每个对象串行发送快照；保存失败时提供重试按钮。失败和 409 会保留草稿，可复制、重试或确认后重新载入。关闭标签页和应用内路由离开会提示未保存内容。

## 停机一致性备份与恢复

运维脚本要求主机 Python 3.9+（含标准库sqlite3）和Docker。脚本只接受明确命名卷、容器及镜像；备份整个 `/data`，包括存在的WAL/SHM和附件，生成版本、SQL对象/关系计数、文件及附件SHA清单，最后自动尝试恢复原容器运行状态。不要运行中只复制数据库主文件。

```sh
mkdir -p backups
scripts/backup.sh --container noteapp-noteapp-1 \
  --volume noteapp_noteapp-data --image noteapp:local \
  --app-version "$(git rev-parse HEAD)" --output "$PWD/backups/noteapp-v1"

docker volume create noteapp-restored
scripts/restore.sh --volume noteapp-restored \
  --image <manifest.json中的image_id> --backup "$PWD/backups/noteapp-v1"
```

恢复只写预先创建的空卷，禁止覆盖；先使用清单里的同一image ID。脚本先核对SHA与只读SQLite完整性/外键/计数，再恢复并重新读取目标核对正文所在文件、所有关系计数和每个附件SHA。保留原卷，不要覆盖源数据。按 [运维手册](docs/operations.md) 启动恢复检查实例并验证浏览器，再切换正式卷。升级前备份；不承诺自动schema降级。

[最终验收记录](docs/acceptance-v1.md) 区分正式多阶段构建与早期开发替代验证，附实际命令、镜像版本和证据。当前前端大包约1.65MB（gzip526KB），首次加载性能仍可优化。

## 对象与固有属性

任务、笔记、日程共同实现 `internal/object.Entity`，提供统一的对象身份、类型、项目、标题、正文、版本和固有属性视图。`GET /api/v1/object-types/{tasks|pages|events}` 返回后端定义的固定属性及修改方式；`GET /api/v1/objects/{type}/{id}` 返回对象值、关联属性和归档只读状态。前端属性栏直接使用后端定义排列与标注字段。

属性仍通过各类型既有的 PATCH、move 和 relation 接口修改，继续执行版本检查、同项目约束、父级防循环和归档只读校验。原有SQLite专用表和数据保持兼容；schema9新增的自定义字段使用独立定义和值接口，不改变这些固有属性的业务约束。

后端模块职责、事务边界及对象版本语义见 [后端结构](docs/architecture.md)。对象读取由 `objectquery` 编排；`taskmeta` 集中任务元数据，`apperr` 与 HTTP 状态映射分离。附件流接收在数据库事务外完成，提交时重新检查项目可写性。

## 项目菜单与即时编辑

每个侧栏项目右侧的“⋯”提供重命名、归档/取消归档、删除、置顶/取消置顶。菜单与删除确认已统一为紧凑菜单和独立模态确认框，见[样式整理记录](docs/implementation/2026-10-25-menu-style.md)。置顶持久保存并优先排列；归档项目保持只读，需取消归档后重命名、删除或修改置顶。删除使用预览确认，将项目及当前有效的任务、笔记、日程放入同一回收站批次；恢复该批次保留关联，之前单独删除的对象保持原批次。

三类对象详情使用完整内容页和紧凑属性栏。笔记详情不展示目录、新建表单、父级和内部顺序值；这些不影响已有笔记层级数据。正文使用 BlockNote 块编辑器，直接编辑渲染内容，输入 `/` 插入标题、列表、待办、代码、引用、表格、图片或文件；悬停块左侧可拖动、复制和删除。没有固定模式工具栏。通过 `/导入` 插入 Markdown 文件、`/导出` 下载副本。正文只保存块 JSON（`body_document`），接口不再接受或返回 Markdown 正文及旧原文字段。搜索直接读取块中的文字和附件名称；Markdown 只用于导入/导出，导出不保证保留全部块属性，完整备份请使用数据库与附件备份。schema7 会移除旧 `body`/`legacy_body` 列；旧库中的非空 Markdown 需先停机备份，并使用锁定的编辑器解析器离线准备迁移，不能直接跳过。具体步骤见 [块迁移运维](docs/operations.md#块唯一正文升级schema7)及[准备工具](docs/implementation/2026-10-25-block-migration-tool.md)。不支持把旧镜像指向已升级数据库；回退必须恢复升级前备份。

历史schema 5增加了项目置顶与软删除字段；当前schema7升级方式见上文。现场升级前备份保存在 `backups/2026-10-24-before-project-actions/`，该目录排除在Git和Docker上下文外。旧镜像回退应先恢复对应备份，勿仅切换镜像而混用数据库版本。

### V1稳定性修复（schema8）

任务/笔记/日程的未保存编辑草稿会保存到当前浏览器，重新打开时恢复；服务器版本变化或其他窗口有草稿时会暂停覆盖，提示处理冲突。可用“恢复本机草稿”明确接续与当前服务器基线一致的恢复内容。浏览器存储不可用/配额不足会明确报错并提供复制草稿、重试保存；清理站点数据、换浏览器或换域名/端口不会携带本机草稿，完整数据保护仍依赖数据库与附件备份。

上传/导入未结束时不能移动任务；归档、删除和重新载入仍受未保存状态保护。创建请求丢失响应后重试会复用同一请求ID，不重复插入对象；新的独立窗口和明确取消后的新操作使用独立身份。日历拖动遇到响应丢失会查询服务器确认；查询也失败时禁止继续拖动，提供同步操作。删除确认校验整个成员快照。正文JSON上限2MiB，超限保留当前草稿并提示拆分。

schema7→8只添加创建请求结果表，不改写已有对象。升级前备份，使用新镜像重建原卷即可自动迁移；schema6及更早版本仍需先按上面的块迁移步骤准备。旧页面升级后请刷新。实际故障测试、备份恢复和限制见[稳定性验收](docs/implementation/2026-10-25-v1-stability.md)。

## 使用边界

当前面向个人规模数据。独立审计的容量样本为单项目每类 1000 个对象、每份约 8KB 正文；这是测量场景，并非无限规模或性能保证。列表目前读取完整正文，超大项目应拆分；摘要接口与分页列为后续优化。块数据按固定 BlockNote 0.56.0 schema 校验，非法写入返回400且不更改旧数据；升级不自动修复或丢弃已有正文。

LAN 的普通 HTTP 使用安全随机数兼容 UUID 生成；免登录仍只适合受信任网络。Host 白名单用于限制访问主机，不能替代身份验证。反向代理若终止 HTTPS，需单独设计可信代理配置；当前不会直接相信 `X-Forwarded-*`。

任务列表按阶段分组时，可拖动任务左侧的手柄到目标阶段；只更改这一项任务的阶段，父子状态互不联动。点击阶段圆点也可通过原生选择器修改，适合键盘和手机。关联属性展开后，搜索筛选同项目候选，点击候选即建立关联。对象详情页的项目操作统一从侧栏“⋯”进入。实现和验证见[对象与任务交互精简](docs/implementation/2026-10-26-task-interactions.md)。

对象标题右侧的“⋯”收纳对象自身操作，当前提供移入回收站；点击后仍需预览确认。任务、笔记、日程采用相同入口，属性区统一展示固有属性、关联和自定义属性，默认收起。见[对象菜单调整记录](docs/implementation/2026-10-26-object-menu.md)。

### 自定义属性（schema9）

先展开属性栏，再点击末尾的“添加属性”：可新建文本、单选、多选或网址，给默认属性命名并填写值；也可复用同项目其他对象类型的已有属性，复制定义、选项与颜色，不复制值，后续按对象类型独立管理。定义会自动出现在同项目同类型的所有已有/新建对象上，各对象的值独立。点击属性名称可改共享名称；单选、多选在选择面板直接创建选项，在选项行的三点菜单中改名、选择九种标签颜色或删除；属性设置仅管理属性名称和删除属性，固有属性不可删除。选项ID保持不变。折叠不停止自动保存，刷新后默认收起。设置和属性值自动保存，失败保留本机输入并展开实际错误；设置草稿可在再次打开对应设置时恢复。归档后只读。

每项目每类型最多64个属性，名称80字符、选项100个、文本4000字符、网址2048字符；网址只接受HTTP/HTTPS。删除自定义属性会清除该类型全部对象的对应值；删除选项会清理引用值，操作前有明确确认。当前不提供字段类型转换或按自定义字段筛选搜索。API、独立版本规则及清空值见[自定义属性接口](docs/custom-properties-api.md)。schema8→9只新增定义/值两表，不改写正文；升级前备份，新镜像启动会自动迁移。回滚应恢复升级前备份到空卷，再运行匹配旧镜像。

对象详情以应用内居中浮层打开，顶部为项目 / 类型 / 对象名称；点击上级或关闭回到列表。任务、笔记、日程共用此布局，编辑内容自动保存，保存失败与未完成附件处理会阻止静默离开。重复的本地空间提示已精简，现有数据不受影响。
