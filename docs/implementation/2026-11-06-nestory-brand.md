# Nestory 名称与图标接入

使用现有定稿 design/nestory/final：Nestory / Chalk，底色#F3EFE6，符号#302E2C。侧栏、网页标题、SVG/ICO favicon、Apple touch icon统一接入，README与现行产品说明同步名称。设计探索文件保留在工作区，提交仅包含定稿资源与说明。

工程命令、Go模块、API、localStorage键、Docker服务及数据卷保持原名noteapp，现有安装继续沿用同一数据卷。此次不迁移数据、不清空草稿。

验证：前端构建、Docker镜像noteapp:nestory-20261106构建通过；本机容器同卷重建并healthy，7项smoke通过。Brave实际打开工作台，验证标题Nestory · 个人工作空间、侧栏Nestory、图片加载完成，4个图标地址均200且返回正确图片MIME。备份：backups/2026-11-06-before-nestory。未重复运行与此次显示资源无关的全套业务测试。
