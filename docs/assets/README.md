# Nestory 产品素材

素材来自 `noteapp:nestory-20261106` 的真实界面，使用隔离容器与临时数据卷，内容为专门创建的中文演示项目，不包含用户日常数据。未修改产品CSS、按钮或功能显示。

- project-overview.png：任务、笔记和日程汇总。
- task-list.png / task-board.png：同一组任务的两种视图。
- block-note.png：块正文、清单、关联和自定义属性。
- calendar.png：月日历。
- product-tour.mp4 / product-tour.gif：视图切换、任务阶段拖动、打开笔记、展开属性、查看日历。无配音和音乐。

截图画幅1680×1120；视频由真实操作时连续采集的浏览器帧编码，5fps，导出1440宽MP4和960宽GIF。没有增加不存在的功能或合成界面。浏览器帧录制用于保留浅色界面的色彩，非原速性能基准。

复现需要本机Docker、已构建镜像、web依赖、Chromium和ffmpeg：

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/path/to/chromium' node scripts/media/capture-product.cjs noteapp:nestory-20261106
sh scripts/media/encode-product.sh
```

脚本只创建与清理自身 `noteapp-media-*` 容器/卷，不连接18084日常实例。当前示例日期为2026年11月；以后重拍时需更新示例日期或切换至对应月份。
