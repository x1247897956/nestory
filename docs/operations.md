[English](operations.en.md) | **简体中文**

# 部署 Nestory

使用 Docker Compose 在自己的设备上运行 Nestory。当前版本适合个人在本机或受信任局域网使用。

## 安装

安装 Docker 和 Compose v2，然后在项目根目录执行：

```sh
cp .env.example .env
docker compose up -d --build
docker compose ps
```

首次启动会构建镜像。看到 `noteapp` 服务状态为 `healthy` 后，即可通过部署设备上配置的访问地址使用 Nestory；默认端口为 `8080`，默认仅允许本机访问。其他设备访问的设置见[局域网访问](configuration.md#局域网访问)。

无法启动时查看日志：

```sh
docker compose logs --tail=100 noteapp
```

## 数据保存在哪里

笔记、任务、日程和附件保存在 Docker 数据卷中，默认卷名为 `noteapp_noteapp-data`。停止或重建容器不会删除数据。

正常停止使用：

```sh
docker compose down
```

不要添加 `-v`，它会删除数据卷。Nestory 的工程服务及数据卷仍沿用 `noteapp` 名称，已有安装无需改名。

## 更新

更新前先完成下面的备份。取得新版本源码后，保留原 `.env` 和数据卷，执行：

```sh
docker compose up -d --build --force-recreate
docker compose ps
```

服务恢复后，刷新浏览器并确认原有项目和附件可以打开。

## 备份

备份脚本需要主机安装 Python 3.9+。它会短暂停止应用，备份数据库和附件，完成后尝试恢复原运行状态。

在部署目录执行以下命令；如果修改过数据卷名称，将 `--volume` 换成实际卷名。备份输出目录每次应使用一个新名称。

```sh
mkdir -p backups
nestory_container=$(docker compose ps -q noteapp)
scripts/backup.sh \
  --container "$nestory_container" \
  --volume noteapp_noteapp-data \
  --image "$(docker inspect --format '{{.Image}}' "$nestory_container")" \
  --app-version "$(git rev-parse HEAD)" \
  --output "$PWD/backups/before-update"
```

看到 `Verified backup` 表示备份校验完成。完整保留生成的备份目录，并把 `.env`、`compose.yaml` 一起保存到部署设备以外的位置。

## 恢复

从备份目录的 `manifest.json` 中找到 `image_id`，将下面的 `IMAGE_ID` 替换为该值。恢复使用备份时的镜像，目标必须是新建空卷。

```sh
docker volume create noteapp-restored
scripts/restore.sh \
  --volume noteapp-restored \
  --image IMAGE_ID \
  --backup "$PWD/backups/before-update"
```

恢复成功后，在 `.env` 中设置：

```dotenv
APP_VOLUME_NAME=noteapp-restored
APP_IMAGE=IMAGE_ID
```

这里的 `IMAGE_ID` 同样替换为备份清单中的镜像ID。启动并检查恢复后的内容：

```sh
docker compose up -d --no-build --force-recreate
```

确认正文和附件正常前，保留原数据卷与备份。恢复旧版本时也使用这一流程，不要直接让旧镜像读取升级后的数据库。

<a id="块唯一正文升级schema7"></a>

旧版 Markdown 数据库（schema6 及更早）需要额外的离线转换，新安装无需处理。已有此类数据时，请先阅读[旧正文迁移说明](implementation/2026-10-25-block-migration-tool.md)。
