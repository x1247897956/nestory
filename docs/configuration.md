# 调整部署设置

默认设置可以用于本机部署。需要调整时，编辑部署目录中的 `.env`，先同步系统时区，再重建容器使其生效：

```sh
python3 scripts/local_deploy.py up
```

## 修改端口

```dotenv
APP_PORT=8080
```

将端口改为未被占用的值。

## 跟随系统时区

应用的日程显示和日期筛选使用部署电脑的系统时区。部署工具从系统配置读取 IANA 时区，自动生成 `.env` 中的 `APP_TIMEZONE`，不需要手动填写地区。

首次部署前运行 `python3 scripts/local_deploy.py configure`；它只更新配置，不启动或重启应用。对已有镜像运行 `python3 scripts/local_deploy.py up`，会读取当前系统时区并显式启动或更新容器。修改系统时区后，再次运行 `up` 应用即可。没有后台检查、定时任务或自动重启。

系统时区无法确定时会明确报错，不回退到预设地区。时间戳继续使用 UTC 作为存储格式，显示与日程边界使用系统 IANA 时区及其夏令时规则。

## 局域网访问

允许同一受信任网络中的设备访问时，修改以下设置，将示例IP替换为部署设备的实际IP：

```dotenv
APP_BIND=0.0.0.0
APP_ALLOWED_HOSTS=localhost,127.0.0.1,::1,192.168.1.20
```

其他设备使用部署设备的IP和已配置的端口访问。Nestory 当前没有登录功能，仅向受信任的设备开放。

## 附件大小

默认每个附件最多20 MiB。需要调整时，设置字节数：

```dotenv
APP_UPLOAD_LIMIT=20971520
```

其他部署变量见仓库的 [.env.example](../.env.example)。更新或恢复时涉及的数据卷与镜像设置见[部署说明](operations.md)。
