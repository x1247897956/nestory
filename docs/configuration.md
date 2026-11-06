# Nestory 配置参考

[产品首页](../README.md) · [部署与维护](operations.md)

Compose 配置写入 `.env`；直接运行 Go 时通过环境变量传入。Go 进程不会自动加载 `.env`。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `APP_BIND` | `127.0.0.1` | Compose 主机绑定地址。 |
| `APP_PORT` | `8080` | Compose 主机端口。 |
| `APP_IMAGE` | `noteapp:local` | 构建与启动的镜像名称。 |
| `APP_VERSION` | `development` | 镜像源码版本标识。 |
| `APP_VOLUME_NAME` | `noteapp_noteapp-data` | 持久化卷；修改会切换数据集。 |
| `APP_TIMEZONE` | `Asia/Shanghai` | 日历、日期筛选及今日/本周的统一时区。 |
| `APP_ALLOWED_HOSTS` | `localhost,127.0.0.1,::1` | 允许访问的精确主机名/IP，不含端口。 |
| `APP_UPLOAD_LIMIT` | `20971520` | 单附件上限，默认 20 MiB。 |
| `APP_ADDR` | `127.0.0.1:8080` | 直接运行 Go 的监听地址；容器使用 `:8080`。 |
| `APP_DATA_DIR` | `./data` | 直接运行 Go 的数据库与附件目录；容器使用 `/data`。 |
| `APP_DEV_ORIGIN` | 空 | 额外允许的开发浏览器来源。 |

局域网访问需同时设置 `APP_BIND=0.0.0.0`，并把实际主机名/IP 加入 `APP_ALLOWED_HOSTS`。应用没有登录和团队权限，仅适用于受信任网络；Host 白名单不能替代身份验证。当前不直接信任 `X-Forwarded-*`。
