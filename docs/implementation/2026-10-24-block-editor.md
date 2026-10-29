> 历史设计/实施记录：保留当时范围与验证结果。当前界面、正文格式及功能请以[现行产品说明](../current-product.md)为准；旧Markdown三模式、多层笔记界面等描述不代表当前行为。

# 2026-10-24 块正文编辑

## 范围与方案

按用户确认采用 BlockNote，三类业务对象共用一个正文编辑器。固定的即时/源码/预览/分屏/附件工具栏移除；直接编辑渲染结果，`/` 打开中文插入菜单，选中文字显示浮动格式操作。支持标题、列表、待办、代码、引用、表格、折叠块及文件。悬停块左侧可拖动，块菜单增加复制块和删除块。附件上传、Markdown 导入/导出也可通过 `/` 搜索。

依赖固定 `@blocknote/{core,react,ariakit}` 0.56.0，兼容 React 19。使用 MPL-2.0 的核心包，不使用 XL 包或云服务。选择 Ariakit 适配现有界面，未引入 Mantine 设计系统。移除原 CodeMirror 编辑器依赖；原 MarkdownPreview 保留只读渲染/测试用途。

## 正文模型与兼容

数据库迁移 006 在 tasks/pages/events 新增 nullable `body_document`（JSON BLOB）、`legacy_body`（原始 Markdown）。原 `body` 列是搜索与 Markdown 导出的投影，块 JSON 是权威数据。JSON 封装 `{version:1,blocks:[...]}`；由共享编辑器生成投影并同次 PATCH 提交，后端不运行 JavaScript 编辑器转换器，不独立核验两者语义等价。

- 原有行升级不转换，正文打开也不写入数据库。
- 首次实际正文编辑才转换，保存时快照原 body 到 legacy_body；后续不覆盖原文。详情下方折叠的“旧版原文”可下载恢复副本。
- 只修改标题、阶段等元数据不触发转换，未转换字段不发送 null。
- JSON/投影/旧原文使用原有事务和乐观版本锁原子提交；属性 PATCH 保留现有正文。
- 已转换后，旧客户端改变 body 而不提交块文档返回409；显式 null 清除、未知格式版本、无效块结构/重复ID等返回400。
- 校验版本、块类型、ID唯一、内容形状、32层深度及10000块上限；保留库所有 props/content 信息。
- 删除/恢复为原有软删除，块内容随对象保留。

## 保存与文件

沿用800ms串行自动保存、草稿错误提示、版本冲突保稿和路由/关闭提醒。上传与导入进行中也标记未保存，防止用户在完成前离开。失败不替换正文。导入 Markdown 在光标所在块后插入，不覆盖已有正文。导出是兼容性副本，折叠等富块结构不能用 Markdown 无损表达，备份应使用整库/块JSON。

## 用户授权清理

用户另行授权清空旧项目。已将本地18084实例的22个项目按项目删除批次移入回收站（包含取消归档后删除），活跃与归档项目均为0。备份 `backups/2026-10-24-before-project-cleanup`；批次明细 `backups/2026-10-24-project-cleanup.json`。未清空回收站，未删除其他服务。

## 验证

实际执行结果：Go race 全套通过、go vet通过、前端单元20项通过、类型检查与构建通过；最终完整浏览器23/23通过（1.1分钟），另新增拖动验证与表格/图片互通专项2/2通过。块菜单原适配器在焦点/位置变化时会间歇关闭，现以浏览器原生popover承载操作，保留BlockNote编辑/拖动，并隔离编辑器视图重新渲染。

## 已知边界

Markdown 导入/导出是有损格式互转，原文保留用于审阅；不要使用旧版本镜像写入已经使用块正文的数据库。HTTP JSON 请求仍限1MiB（JSON与投影合计），超限保存失败保留本地草稿。构建仍存在大于500KB的chunk提示。中文字符和菜单已自动化验证，真实操作系统中文输入法候选/组合输入仍需人工体验。


## 构建与升级演练

- 首次 Docker npm ci 长时间无输出，取消后增加 `--loglevel=verbose`。重试使用缓存及官方 registry.npmjs.org，安装341包约3秒、esbuild postinstall退出0，镜像构建成功。没有修改全局Docker/npm源；首次停滞根因未被证明。
- 当前Docker环境在重打同名镜像标签后，旧运行容器所指的manifest/layer已不可读取（image inspect与docker commit均报NotFound）。保留原始备份清单不改；另从运行容器提取旧程序至 `backups/runtime-before-block-editor/noteapp`。后续需要保留版本标签，不能只保留可变 `noteapp:local` 标签。
- schema5备份先经 `validate_bundle` 校验，手工解压到空的 `noteapp-block-upgrade-20261024` 卷（未运行旧应用），再启动新镜像执行schema6。此步骤没有声称旧镜像不可用时精确镜像restore脚本执行成功。
- 升级后整卷备份 `backups/2026-10-24-block-upgrade-rehearsal`：全部业务计数不变、12附件SHA不变、三类对象所有原body逐字节一致，只有schema_migrations新增版本6。


## 最终交付结果

- 最终Docker镜像 `noteapp:block-editor-v1`（同时为 `noteapp:local`），image ID `sha256:743e68885dc97ad2582e77c9840e50641f3ed9837f939c301051fc992f587bbc`；保留独立版本标签，避免仅依赖可变local标签。
- 最终镜像容器18087：`acceptance-v1` + `block-editor` + `block-interoperability` 共5/5通过（32.1秒），包含真实拖动排序，使用加强后的后端JSON校验。
- 备份 `backups/2026-10-24-block-final-rehearsal`；原卷重建、空卷 `noteapp-block-restored-20261024` 恢复均成功。restore.sh实际通过schema1..6、完整性、外键、全表数量和18附件SHA核验。
- 额外读取备份SQLite与18087/18088 API逐条对比：9份块文档JSON、当前投影、legacy_body全部一致；校验脚本保存在 `backups/2026-10-24-verify-block-restore.py`。
- 空卷恢复后的浏览器 `NOTEAPP_VERIFY_RESTORED=1` 验收1/1通过（1.1秒），代码/图片/关系可用。
- `COMPOSE_PROJECT_NAME=noteapp-v1-check APP_VOLUME_NAME=noteapp-v1-check APP_PORT=18084 docker compose up -d --no-build --force-recreate` 已执行；本地18084上线新镜像，7项smoke通过，活跃和归档项目列表均为0。未将测试数据写入实际卷。
- 演练容器与演练卷完成后清理；备份文件保留在Git/Docker忽略的backups目录，不推送或公开。

主要复现命令：

```sh
# 兼容本机goenv shim，直接调用其安装目录的go，允许按go.mod下载锁定工具链。
env -u GOROOT GOPATH=/tmp/noteapp-go GOCACHE=/tmp/noteapp-go-cache GOMODCACHE=/tmp/noteapp-go/pkg/mod /Users/seyr1n/.goenv/versions/1.25.12/bin/go test -race ./...
npm run typecheck --prefix web
npm run test --prefix web -- --run
npm run build --prefix web
# 指向独立测试实例，禁止将完整E2E指向真实数据实例。
E2E_BASE_URL=http://127.0.0.1:18087 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' npm run e2e --prefix web
# 目标卷需先创建且为空，镜像ID必须与备份清单一致。
scripts/restore.sh --volume NEW_EMPTY_VOLUME --image noteapp:block-editor-v1 --backup backups/2026-10-24-block-final-rehearsal
```
