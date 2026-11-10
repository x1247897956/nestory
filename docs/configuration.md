# 调整部署设置

默认设置可以直接用于本机部署。需要调整时，编辑部署目录中的 `.env`，再重建容器使其生效：

```sh
docker compose up -d --force-recreate
```

## 修改端口和时区

```dotenv
APP_PORT=8080
APP_TIMEZONE=Asia/Shanghai
```

将端口改为未被占用的值；时区用于日程显示和日期筛选。

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
