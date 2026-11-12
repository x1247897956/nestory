# 本机部署与数据管理

当前实例使用单个 Go 容器、SQLite 和附件数据卷。应用日常使用不依赖主机计划任务。

## 当前实例

| 配置 | 当前值 |
| --- | --- |
| Compose 项目 | `noteapp-v1-check` |
| 访问地址 | `http://127.0.0.1:18084` |
| 数据卷 | `noteapp-v1-check`，挂载 `/data` |
| 数据库与附件 | `/data/noteapp.db`、`/data/assets` |

根目录 `.env` 保留本机项目名、端口、数据卷和不可变镜像 ID，不提交到 Git。`deploy/local.env.example` 是参考模板。

## 日常保存和误删恢复

保存内容由应用写入 SQLite，附件保存在同一个数据卷。删除项目、任务、笔记或日程会生成软删除批次；从回收站选择「恢复」，恢复该批次原有对象及关系。父项目或父对象仍在回收站时，先恢复父级。回收站没有定时过期或清空机制。

日常使用不创建定时快照，不执行后台备份、不按数量清理历史副本，也不定期启动临时恢复实例。

## 手动迁移

换电脑或迁移实例时，在设置的「数据与维护」点击「导出工作空间」，自行保存 ZIP；在空实例中选择 ZIP，点击「恢复工作空间」。导入会校验数据并通过事务恢复，已有内容的实例会拒绝导入。详情见[设置与迁移](settings.md)。

已有历史备份仍保留在 `backups/`，其中 `backups/scheduled/` 是原方案留下的历史目录，现无任务向其中自动写入或清理。旧的 launchd 配置已从登录启动目录移除，归档于 `backups/retired-scheduler-20261112/`。

## 显式部署与系统时区

`local_deploy.py` 仅提供人工执行的配置、启动和查看状态命令，使用 Python 3.9+ 标准库与 Docker。配置和状态操作不执行备份，也不安装后台任务。

```sh
# 只准备 .env 的宿主机时区，不启动或重启容器
python3 scripts/local_deploy.py configure

# 显式启动或应用配置，自动读取当前宿主机时区，不构建新镜像
python3 scripts/local_deploy.py up

# 只读查看配置与运行实例
python3 scripts/local_deploy.py status

docker compose logs --tail=100 noteapp
```

应用运行时统一使用部署电脑的系统时区。时区在显式启动／部署时读取并注入容器；修改系统时区后，手动运行 `up` 来应用。没有后台轮询或自动重建容器。`sync-timezone` 是 `configure` 的别名，也只更新配置；真正应用到运行实例需要显式执行 `up`。

更新时先自行构建并验证候选镜像，再将 `.env` 的 `APP_IMAGE` 与 `APP_VERSION` 改为已验证版本，然后执行 `up`。它会应用当前配置，镜像、端口和数据卷须先确认；保留现有 `APP_VOLUME_NAME`，不要执行 `docker compose down -v`。

超出在线 ZIP 上限或需要离线迁移时，仓库的 `backup.sh` / `restore.sh` 仍可由操作者显式调用，见[部署说明](operations.md)。这些工具不参与日常回收站流程，也没有调度入口。
