# Nestory product media / 产品素材

README media is captured from the real application in disposable containers with a temporary data volume. The fixtures are created specifically for the captures and contain no everyday user data. Product CSS, buttons, and feature visibility are not modified.

- `docs/assets/` contains the Chinese UI and Chinese demo content used by `README.zh-CN.md`. The existing Chinese media is retained.
- `docs/assets/en/` contains the English UI and English demo content used by `README.md`. Projects, task titles, note bodies, events, custom property names, and options all use an English fixture.
- `project-overview.png`: project tasks, notes, and events together.
- `task-list.png` / `task-board.png`: two views of the same tasks.
- `block-note.png`: block content, checklists, relations, and custom properties.
- `calendar.png`: monthly calendar.
- `product-tour.mp4` / `product-tour.gif`: switching views, dragging a task to another stage, opening a note, showing properties, and viewing the calendar. No narration or music.

Screenshots use a 1680×1120 viewport. The video is encoded from browser frames captured during actual interactions at 5 fps: 1440-pixel-wide MP4 and 960-pixel-wide GIF. Browser frame recording preserves the colors of the light UI; it is not a real-time performance benchmark.

## Reproduce

Run from the repository root with Docker, built backend and frontend images, installed `web` dependencies, Playwright Chromium, and ffmpeg available. Use a frontend image that includes both UI languages.

```sh
# English: writes five PNGs and the MP4 to docs/assets/en/.
node scripts/media/capture-product.cjs noteapp:test noteapp-web:test en
sh scripts/media/encode-product.sh en

# Chinese: writes to docs/assets/ (replaces the existing Chinese media).
node scripts/media/capture-product.cjs noteapp:test noteapp-web:test zh-CN
sh scripts/media/encode-product.sh zh-CN
```

The capture command accepts `[backend-image] [frontend-image] [zh-CN|en]`; images default to `noteapp:test` and `noteapp-web:test`, and language defaults to `zh-CN` for compatibility. The encoder accepts `[zh-CN|en]` with the same language default. Both scripts support `--help`; output paths are resolved relative to the repository, regardless of the current working directory.

Each screenshot and tour browser context seeds `noteapp:settings:v1` before the application loads. English captures set `language: "en"` and browser locale `en-US`; Chinese captures use `zh-CN`. Both keep the same independent calendar preferences: Asia/Shanghai browser time zone, Monday week start, 24-hour time, monthly view, and light theme. The browser date is fixed at November 6, 2026, while timers continue running, so the November 2026 sample events remain visible on later capture dates.

The script only creates and cleans up its own `noteapp-media-*` containers, network, and volume. It does not connect to the everyday instance. Temporary browser frames are stored outside the asset directories and removed on completion or failure. By default, it uses Playwright's installed Chromium; set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use another Chromium executable. Inspect the resulting screenshots and video before publishing.

## 中文说明

素材来自真实产品界面，使用隔离容器、临时数据卷和专门创建的演示项目，不包含用户日常数据。中文素材保留在 `docs/assets/`，英文素材单独写入 `docs/assets/en/`，两个 README 分别引用对应语言的图片、GIF 和 MP4。

复现时在原有两个镜像参数后追加 `en` 或 `zh-CN`；不传语言时保持中文默认行为。英文模式在首屏加载前写入 `noteapp:settings:v1` 的英文偏好，并使用 `en-US` 浏览器区域设置，演示内容本身也使用英文。脚本将浏览器日期固定在 2026 年 11 月 6 日以展示示例日程，时区、周起始日和小时制与界面语言分别设置。以上命令会覆盖所选语言目录下的同名素材，发布前应检查截图和视频的实际效果。
