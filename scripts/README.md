# 主机维护与开发工具

这些脚本不进入生产运行镜像，也不是第二套后端。日常应用由Go程序提供API与静态前端，误删由回收站恢复。所有脚本只在操作者显式调用时运行，没有计划备份或后台调度。

| 工具 | 用途 | 需要的环境 |
| --- | --- | --- |
| backup.sh / restore.sh | 调用operations.py备份或恢复完整数据卷，检查数据库和附件一致性 | 主机Python3.9+、Docker |
| smoke.sh | 调用operations.py检查已运行实例的健康和基本接口 | 主机Python3.9+ |
| local_deploy.py | 显式配置宿主机时区、启动已验证镜像和只读查看状态，无调度／备份入口 | 主机Python3.9+、Docker；详见[本机部署](../docs/local-deployment.md) |
| audit/ | 使用独立临时容器/卷进行容量、故障、迁移和恢复检查 | 按脚本需要Python、Docker，浏览器测量另需Node/Chromium |
| tests/ | 验证归档安全、备份恢复、运行边界及迁移准备工具 | Python unittest或Node test |
| prepare-block-migration.mjs | 只为旧Markdown数据库离线准备块正文，使用和前端相同的BlockNote解析器 | Node、前端锁定依赖；新安装不用运行 |
| media/ | 为README准备独立演示数据、真实截图和视频 | Node、Docker、Chromium、ffmpeg |

Python工具只使用标准库：tarfile处理归档，hashlib校验SHA，sqlite3离线检查备份，subprocess管理明确指定的Docker容器。它不监听业务端口，不处理对象的正常读写，也没有pip依赖。

JavaScript工具使用.mjs（ES模块）或.cjs（CommonJS）运行于Node，扩展名表示模块加载方式，不是另外两种前端语言。浏览器测试本身在web/e2e中使用TypeScript。

保留既有脚本路径，避免破坏已记录的部署和旧数据恢复命令。对真实卷使用维护脚本前先确认目标；测试和演示脚本只操作其新建的隔离资源。
