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
