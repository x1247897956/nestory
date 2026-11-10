> 历史设计/实施记录：保留当时范围与验证结果。当前界面、正文格式及功能请以[项目介绍](../../README.md)为准；旧Markdown三模式、多层笔记界面等描述不代表当前行为。

# 正式 Docker 构建与重建验证

日期：2026-10-24。前三阶段实现基础上构建，最终版本仍需阶段5重建。

- `docker compose build` 完整多阶段构建实际退出0，包含容器内npm ci/build、go mod download、CGO_ENABLED=0 go build。
- 固定Node/Go/Alpine digest不变。Node与Go下载曾停滞，经相同digest的`docker.1ms.run/library/...`缓存拉取后完成；未修改Docker全局镜像源配置，Dockerfile仍引用官方源。
- 镜像 `noteapp:local` ID `sha256:7fa961cc1718ec08296289e02aa40b77aab5a52a894d7a97b643217e096ca8e8`。
- 命名卷 `noteapp-formal-check`，容器 `noteapp-formal-check`，绑定127.0.0.1:18083。
- 实际创建项目、Page中文正文、Done父任务/Todo子任务、跨日Event（含秒）、三组关系及文本附件。
- `docker stop`优雅退出，删除容器后相同正式镜像/同卷重建；API断言各正文/阶段存在，三端各2条关系，附件字节完全一致。
- 附件SHA256 `974a866e17d24f414a970e0658a2822a1b6ddc61e59cbdf8caaa4faee1fbaf11`。
- 容器`id -u`为10001。
- 验收数据project ID `e645d0c70fe7a9a4c1a6840f8ee970c9`、asset ID `44c54044a3e27866309eccbc0e0bf722`。
- 检查脚本执行时位于`/tmp/noteapp-formal-check.py`，最终可重复完整演练由阶段5脚本承接。
