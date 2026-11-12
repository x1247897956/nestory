# 调整部署设置

默认设置可以用于本机部署。需要调整时，编辑部署目录中的 `.env`，再更新容器使其生效：

```sh
docker compose up -d --no-build
```

## 修改端口

```dotenv
APP_PORT=8080
```

将端口改为未被占用的值。

## 设置时区

在 `.env` 中显式指定工作空间使用的 IANA 时区：

```dotenv
APP_TIMEZONE=Asia/Shanghai
```

也可使用 `UTC`、`Europe/Berlin`、`America/New_York` 等名称，不要使用 `UTC+8` 这样的偏移写法。示例模板使用 `Asia/Shanghai`；已有部署保留自己的配置。Compose 要求该变量非空，无效名称会使应用启动失败并在日志中报告 `APP_TIMEZONE` 错误。

修改后运行上方命令并刷新浏览器。只修改 `.env` 不会影响正在运行的容器，`docker compose restart` 也不会重新注入环境变量。部署与启动不会自动读取系统时区或覆盖此设置，宿主机或浏览器时区变化不会改变工作空间时区。标准 Docker 部署无需宿主机 Python。

时间戳继续使用 UTC 存储，日历、日程显示和日期筛选使用指定 IANA 时区及其夏令时规则；修改时区不会改变已保存日程的时间点。

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

## 统一入口与镜像

`APP_PORT` 只映射前端入口；Go API 在 Compose 内部网络中运行。`APP_IMAGE` 是后端镜像，`APP_FRONTEND_IMAGE` 是前端镜像；两者可分别指定标签或固定镜像 ID。前端 `BACKEND_UPSTREAM` 默认为 `noteapp:8080`，Compose 已设置此地址。前后端都会使用 `APP_ALLOWED_HOSTS`，修改后统一更新两个服务。

开发通过 Vite 的 `/api` 代理使用同一浏览器来源。当前 Compose 配置使用 HTTP；在外层增加 HTTPS 终止代理时，须显式配置后端允许的外部来源（现有 `APP_DEV_ORIGIN` 精确来源覆盖可用于单个可信 HTTPS 来源），同时保留 Host。不能仅传入 X-Forwarded-Proto 或放开 CORS 来绕过来源检查。
