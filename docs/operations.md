# Noteapp 运维手册

适用范围：第一版单实例、本机或受信任局域网，无登录和团队权限。数据库和附件必须放在本机磁盘的同一个 Docker 命名卷 `/data`，不要使用网络文件系统，也不要让多个应用实例同时写同一卷。

## 安装与启动

需要 Docker Engine + Compose v2。运维脚本另外需要主机 Python **3.9+**（标准库 sqlite3、tarfile，无 pip 依赖）和 POSIX shell；开发需要 README 固定版本的 Go/Node/npm。

```sh
cp .env.example .env
# 填写 APP_VERSION 为本次 git rev-parse HEAD；APP_IMAGE 可选独有版本tag。
docker compose config
docker compose up -d --build
scripts/smoke.sh --url http://127.0.0.1:8080
```

默认绑定 `127.0.0.1:8080`，UID/GID 10001 非 root，`APP_TIMEZONE=Asia/Shanghai`，附件上限 20971520 字节。Compose 给 SIGTERM 留 15 秒，应用最多 10 秒排空 HTTP，再关闭数据库。健康检查探测 `/api/v1/readyz`；`/healthz` 只表示进程可用。

默认真实卷名为 `noteapp_noteapp-data`，由 `APP_VOLUME_NAME` 明确指定。升级已有安装时先 `docker inspect <容器>` 查看 `/data` 的 Mounts.Name，把旧的真实卷名填入 `.env`，不要因为更换目录或 Compose project 而无意切换空卷。命名卷初次挂载会从镜像复制初始目录并保留10001权限；绑定主机目录时需要自行提供正确UID/GID与可写权限。恢复脚本使用 `volume-nocopy`，避免 Docker 把初始 assets 目录复制进空目标。

## 停机一致性备份

确定明确的容器、命名卷和镜像。`--image` 必须与容器实际 image ID 相同；可直接传 `docker inspect --format '{{.Image}}' <容器>` 的输出。版本清单同时记录可读应用版本和不可变image ID。备份父目录须已存在，输出目录须不存在。

```sh
mkdir -p backups
scripts/backup.sh \
  --container noteapp-noteapp-1 \
  --volume noteapp_noteapp-data \
  --image noteapp:local \
  --app-version <发布commit或版本号> \
  --output "$PWD/backups/noteapp-2026-10-24"
```

脚本核对容器 image 与 `/data` 卷，拒绝其他运行容器正在使用该卷。记录原运行状态后停止指定容器，把**整个 `/data`**（包括存在的 WAL、SHM、附件和其他普通文件）流式打包到主机临时目录，校验后才发布输出目录。原来运行的容器在成功、校验失败、普通异常、SIGINT/SIGTERM时都会尝试重新启动；原来停止的容器保持停止。SIGKILL、主机断电、Docker daemon 不可用无法执行退出清理，须人工核对状态。脚本不操作其他应用。

备份内容：

- `data.tar.gz`：完整数据卷快照。
- `manifest.json`：应用版本、源image引用及ID、源容器/卷、UTC时间、schema版本、所有业务表/关系表计数、每个普通文件与每个附件的SHA-256、SQLite检查结果。
- `SHA256SUMS`：归档与清单各自的SHA-256；用于检测损坏，不是密码学签名。

校验在主机临时解包目录里用 **SQLite `mode=ro`** 执行 `PRAGMA integrity_check` / `foreign_key_check`，不运行应用、不开迁移。附件必须与数据库size匹配且文件存在；归档中链接、设备、重复路径、绝对路径和`..`均拒绝。备份目录权限为0700，但内容未加密，需自行保管到安全磁盘并按需求加密/异地复制。不要运行中只复制 `noteapp.db`，也不要自行忽略 WAL/SHM。

## 恢复到空卷

先备份旧数据。恢复目标必须是**显式预先创建的空命名卷**，且没有运行容器挂载；禁止覆盖、合并或原地降级。保留源卷作为回退。

```sh
docker volume create noteapp-restore-check
scripts/restore.sh \
  --volume noteapp-restore-check \
  --image <manifest.json中的image_id> \
  --backup "$PWD/backups/noteapp-2026-10-24"
```

脚本先核对两个SHA，再安全解包到主机临时目录并重算所有SQL计数、附件和文件SHA；源清单与实际完全一致后才允许写目标。恢复先使用**同一image ID**，再单独升级。目标空检查与解包在同一个helper命令进行，修正UID/GID10001；写完重新读取目标卷，重复SQL完整性/外键/计数/所有文件与附件SHA比较。主机需要至少约两份解包快照的可用临时空间。

若解包中途磁盘或Docker故障，目标可能留下部分文件，脚本退出非零；**不会尝试覆盖它重跑**。仅在确认该卷是本次新建的失败目标后移除并另建空卷。失败不会写源卷。恢复/备份期间不要并行启动其他写实例或运行第二个同卷维护操作；当前脚本不是分布式维护锁。

恢复验证实例：

```sh
docker run -d --name noteapp-restore-check \
  -p 127.0.0.1:18085:8080 -v noteapp-restore-check:/data \
  <manifest.json中的image_id>
scripts/smoke.sh --url http://127.0.0.1:18085
```

浏览器核对项目、任务父子、页面层级、三端关联、Markdown、图片与下载。确认后停止验证实例，修改正式 `.env` 的 `APP_VOLUME_NAME` 和 `APP_IMAGE`，再 `docker compose up -d --no-build`。不要让验证和正式实例同时写恢复卷。

## 升级与故障

1. 保留旧image ID和应用commit，执行上述停机备份并确认备份验证成功。
2. 更新源码/固定依赖锁，设置新 `APP_VERSION` 和独有 `APP_IMAGE`，执行 `docker compose build`。
3. `docker compose up -d --force-recreate`，运行 smoke，检查 `docker compose logs` 与业务页面。迁移在事务内执行，失败即退出启动，不继续监听。
4. 若失败，保留失败卷便于诊断；用旧image和备份恢复到**另一个空卷**，通过验证后切换。不要把旧镜像直接指向已升级数据库。当前不提供自动schema降级。

上传413：核对 `APP_UPLOAD_LIMIT`，草稿仍保留；JSON无效/未知字段/额外JSON对象返回400。正文自动保存500/断网/409会停留并提示重试，不会自动覆盖服务器。权限错误时确认卷目录可被10001读写；数据库驱动可能将底层权限问题报告为 `unable to open database ... (14)`。不要以root运行应用绕过权限设置。

无永久删除、附件自动清理、离线编辑、历史版本、认证、多副本或公开互联网部署能力。前端bundle约1.65MB（gzip526KB），首次加载会受网络影响。日志输出stdout/stderr，不记录正文或附件内容。

## 可重复交付检查

```sh
python3 -m unittest scripts.tests.test_archive
# 仅创建和清理自己临时命名的容器/卷，要求本机已有最终镜像：
NOTEAPP_TEST_IMAGE=noteapp:local python3 -m unittest scripts.tests.test_backup_restore scripts.tests.test_runtime
```

运行完整浏览器旅程：先对独立测试实例执行 `E2E_BASE_URL=http://127.0.0.1:18084 npm run e2e --prefix web`。新旅程记录 `/tmp/noteapp-acceptance-v1.json` 对象与附件SHA。对此实例备份、同卷重建、恢复到空卷后，可对目标实例执行 `NOTEAPP_VERIFY_RESTORED=1 E2E_BASE_URL=http://127.0.0.1:18085 npm run e2e --prefix web -- acceptance-v1.spec.ts`。可通过 `NOTEAPP_ACCEPTANCE_FIXTURE` 显式选择fixture路径。标准Playwright使用各测试自己的全新浏览器context；macOS现有Brave可配置 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`。

## 块唯一正文升级（schema7）

schema7从任务/笔记/日程中删除`body`和`legacy_body`，只保留非null的`body_document`。旧版客户端必须刷新；发送旧字段将返回400。旧镜像不能用于已升级卷，回退必须另建空卷并恢复schema6备份。首次新安装无需额外准备；已有非空旧Markdown的库会拒绝直接升级，避免静默丢正文。

准备工具需要仓库锁定的Node26.9.0及`web/node_modules`（`npm ci --prefix web`）。它使用和编辑器相同的BlockNote0.56.0解析器，输出带原文SHA256的准备表，不改变旧字段或schema版本；细节见[准备工具](implementation/2026-10-25-block-migration-tool.md)。正式容器仍只有Go程序，不需要Node运行时。

维护步骤：

1. 保留旧镜像的不可变tag，构建新镜像。先用完整备份在**全新隔离卷**演练以下流程。
2. 停止所有会写目标卷的应用，运行备份脚本（原容器已停止时脚本会保持停止）。保留原备份不变。在本机临时目录解出备份；不能只复制仍有写入的SQLite主文件。若备份包含WAL/SHM，先用SQLite backup生成一致副本，并重新核对清单，勿丢弃未checkpoint数据。
3. 对一致、停止使用的副本运行`node scripts/prepare-block-migration.mjs --database /absolute/work/noteapp.db --offline`。重复运行应输出`reused`，不重建块ID。
4. 验证目标卷没有其他运行中的写者，将准备后的数据库副本写回停机卷（UID/GID10001）。本次源库正常关闭后无WAL/SHM，安装前再次检查无这两个文件；遇到残留文件不要套用下面的主文件替换命令。
5. 用新镜像启动，schema7在单一事务中校验全部对象与准备摘要、迁移和删除旧列，失败则回滚。检查日志和smoke；核对所有文档（含归档/回收站）、元数据、关系、附件SHA及SQLite完整性。无效JSON、源摘要变化或缺少准备结果必须定位，不能跳过校验。
6. 新版备份再次恢复到第二个空卷验证，确认后应用同样流程到正式卷。保留升级前备份和旧镜像。

本机本次维护命令示例（变量/路径应按实际环境替换；备份输出目录必须尚不存在）：

```sh
docker stop noteapp-v1-check-noteapp-1
scripts/backup.sh --container noteapp-v1-check-noteapp-1 --volume noteapp-v1-check --image noteapp:slash-menu-20261024 --app-version slash-menu-20261024 --output backups/before-schema7
mkdir -p /tmp/noteapp-schema7-work
tar -xzf backups/before-schema7/data.tar.gz -C /tmp/noteapp-schema7-work
node scripts/prepare-block-migration.mjs --database /tmp/noteapp-schema7-work/noteapp.db --offline
# 仅在停机、无WAL/SHM且已验证源备份的前提下替换主文件。
docker run --rm -i --network none --user 0:0 --entrypoint /bin/sh -v noteapp-v1-check:/data noteapp:slash-menu-20261024 -ec 'test ! -e /data/noteapp.db-wal; test ! -e /data/noteapp.db-shm; cat > /data/noteapp.db.prepared; chown 10001:10001 /data/noteapp.db.prepared; mv /data/noteapp.db.prepared /data/noteapp.db' < /tmp/noteapp-schema7-work/noteapp.db
COMPOSE_PROJECT_NAME=noteapp-v1-check APP_VOLUME_NAME=noteapp-v1-check APP_PORT=18084 APP_IMAGE=noteapp:block-only-20261025 docker compose up -d --no-build --force-recreate
python3 scripts/operations.py smoke --url http://127.0.0.1:18084
```

一次性迁移对旧Markdown的格式解释遵循BlockNote导入语义，升级前备份保留原始字节。已有块JSON不经过Markdown转换，原样保留。全文搜索现在直接读取块JSON的text与附件name，没有持久化Markdown副本或新增全文索引，适用于当前个人数据规模。

## schema8 稳定性升级

schema7→8新增`creation_requests`表，用于和对象创建在同一事务保存重试结果；不改写已有对象或附件，不需要块迁移准备脚本。先备份，再使用`APP_IMAGE=noteapp:v1-stability-20261025`重建；恢复仍先使用备份清单中同一image ID。schema6及更早版本先执行前述块迁移，不能跳过旧正文检查。

```sh
scripts/backup.sh --container noteapp-v1-check-noteapp-1 --volume noteapp-v1-check --image noteapp:block-only-20261025 --app-version block-only-20261025 --output backups/before-schema8
COMPOSE_PROJECT_NAME=noteapp-v1-check APP_VOLUME_NAME=noteapp-v1-check APP_PORT=18084 APP_IMAGE=noteapp:v1-stability-20261025 docker compose up -d --no-build --force-recreate
python3 scripts/operations.py smoke --url http://127.0.0.1:18084
```

升级后刷新浏览器。当前浏览器草稿存放在localStorage，创建重试身份还依赖当前窗口的sessionStorage；站点数据不属于服务器数据卷备份范围。草稿存储失败时先复制JSON或尝试服务器保存，勿直接清理站点数据。不同浏览器/设备间不自动恢复未提交草稿。新增请求表须随数据库完整备份，不应单独清空，否则可能破坏响应丢失后的旧请求去重。
