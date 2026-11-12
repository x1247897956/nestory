[English](operations.en.md) | **简体中文**

# 部署 Nestory

使用 Docker Compose 在自己的设备上运行 Nestory。当前版本适合个人在本机或受信任局域网使用。

已有实例请保留原 `.env`，先确认实际 Compose 项目名、端口、镜像和数据卷，避免按新安装默认值启动另一套空实例。

## 安装

安装 Docker 和 Compose v2。Windows 使用 Docker Desktop 的 Linux 容器模式；标准部署无需 Python、Git Bash 或在 WSL 终端执行命令。

首次安装先在项目根目录准备配置。Linux/macOS：

```sh
[ -f .env ] || cp .env.example .env
```

Windows PowerShell：

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

用文本编辑器打开 `.env`，确认 `APP_TIMEZONE=Asia/Shanghai` 或改成所需的 IANA 时区（例如 `UTC`、`Europe/Berlin`），见[时区配置](configuration.md#设置时区)。部署命令不会读取系统时区或改写这个值。然后在任意平台执行：

```sh
docker compose up -d --build
docker compose ps
```

一条命令会构建并启动 `noteapp`（Go API）与 `frontend`（Nginx 页面与代理）两个独立服务。看到两个服务状态均为 `healthy` 后，即可通过部署设备上配置的访问地址使用 Nestory；默认端口为 `8080`，默认仅允许本机访问。其他设备访问的设置见[局域网访问](configuration.md#局域网访问)。

无法启动时查看日志：

```sh
docker compose logs --tail=100 noteapp frontend
```

## 数据保存在哪里

笔记、任务、日程和附件保存在 Docker 数据卷中，默认卷名为 `noteapp_noteapp-data`。停止或重建容器不会删除数据。

正常停止使用：

```sh
docker compose down
```

不要添加 `-v`，它会删除数据卷。Nestory 的工程服务及数据卷仍沿用 `noteapp` 名称，已有安装无需改名。

## 更新

取得新版本源码后，保留原 `.env` 和数据卷，显式更新镜像与容器。应用没有周期备份任务，日常误删通过回收站恢复。执行：

```sh
docker compose up -d --build --force-recreate
docker compose ps
```

服务恢复后，刷新浏览器并确认原有项目和附件可以打开。

## 分别更新前端或后端

本地构建使用可写镜像标签时，可以只构建并替换指定服务：

```sh
# 仅更新前端，保留后端容器和数据
docker compose up -d --build --no-deps frontend
# 仅更新后端，保留前端容器
docker compose up -d --build --no-deps noteapp
```

两个镜像各自有版本标识，设置页分别显示前后端版本。`APP_IMAGE` 指定后端镜像，`APP_FRONTEND_IMAGE` 指定前端镜像。若使用固定镜像 ID 或摘要，先单独构建／取得新镜像，再显式修改对应镜像配置并用 `--no-build --no-deps` 更新该服务；不要向固定 ID 直接执行 `--build`。

## 从旧单容器安装切换

先确认现有 Compose 项目名、`APP_PORT`、`APP_IMAGE` 和 `/data` 卷名，并记录原镜像、配置及旧版 Compose 文件。保留原 `.env`、项目名和 `APP_VOLUME_NAME`；新后端仍使用 `noteapp` 服务及同一数据卷。默认值不一定匹配已有安装，不能用模板覆盖真实配置。

先为新架构构建两个不同于旧镜像的标签：

```sh
docker build --build-arg APP_VERSION=YOUR_VERSION -t noteapp:split .
docker build --build-arg APP_VERSION=YOUR_VERSION -t noteapp-web:split web
```

将 `.env` 中 `APP_IMAGE` 指向新后端，加入 `APP_FRONTEND_IMAGE=noteapp-web:split`，保留其他部署配置。准备完成后显式执行 `docker compose up -d --no-build`：原对外端口会从后端移到前端，期间有短暂中断。确认两个服务健康、原有项目、回收站和附件均可使用。

本次拆分没有数据库 schema 变更。需要退回旧单容器架构时，先用新 Compose 停止服务（不带 `-v`），恢复记录的旧 Compose、`.env` 和旧镜像，再启动；仅更改 `APP_IMAGE` 不会撤销双服务端口布局。若另有数据库升级，遵守下方恢复流程，不让旧镜像直接读取新 schema。

## 手动迁移

换电脑或迁移实例时，优先使用设置页的「导出工作空间」和空实例中的「恢复工作空间」，见[设置与迁移说明](settings.md)。

以下离线脚本是可选的人工运维工具，不会由应用、启动命令或计划任务自动调用。

## 离线导出（可选）

离线工具需要 Docker 和主机 Python 3.9+。它会短暂停止应用，备份数据库和附件，完成后尝试恢复原运行状态。以下多行命令使用 POSIX Shell 语法（Linux/macOS/WSL）；Windows PowerShell 可用 `py scripts/operations.py backup` 或 `restore`，传入相同参数值。

在部署目录执行以下命令；命令从实际容器读取 `/data` 卷名。备份输出目录每次应使用一个新名称。

```sh
mkdir -p backups
nestory_container=$(docker compose ps -q noteapp)
nestory_volume=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' "$nestory_container")
python3 scripts/operations.py backup \
  --container "$nestory_container" \
  --volume "$nestory_volume" \
  --image "$(docker inspect --format '{{.Image}}' "$nestory_container")" \
  --app-version "$(git rev-parse HEAD)" \
  --output "$PWD/backups/before-update"
```

看到 `Verified backup` 表示备份校验完成。完整保留生成的备份目录，并把 `.env`、`compose.yaml` 一起保存到部署设备以外的位置。

## 恢复

从备份目录的 `manifest.json` 中找到 `image_id`，将下面的 `IMAGE_ID` 替换为该值。恢复使用备份时的镜像，目标必须是新建空卷。

```sh
docker volume create noteapp-restored
python3 scripts/operations.py restore \
  --volume noteapp-restored \
  --image IMAGE_ID \
  --backup "$PWD/backups/before-update"
```

恢复成功后，在 `.env` 中设置：

```dotenv
APP_VOLUME_NAME=noteapp-restored
APP_IMAGE=IMAGE_ID
```

这里的 `IMAGE_ID` 同样替换为备份清单中的后端镜像ID，并为 `APP_FRONTEND_IMAGE` 选择与其 API 兼容的前端版本；离线备份清单只记录后端与业务数据，不记录前端。启动并检查恢复后的内容：

```sh
docker compose up -d --no-build --force-recreate
```

确认正文和附件正常前，保留原数据卷与备份。恢复旧版本时也使用这一流程，不要直接让旧镜像读取升级后的数据库。

<a id="块唯一正文升级schema7"></a>

旧版 Markdown 数据库（schema6 及更早）需要额外的离线转换，新安装无需处理。已有此类数据时，请先阅读[旧正文迁移说明](migrations/legacy-markdown.md)。
