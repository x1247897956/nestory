> 历史设计/实施记录：保留当时范围与验证结果。当前界面、正文格式及功能请以[现行产品说明](../current-product.md)为准；旧Markdown三模式、多层笔记界面等描述不代表当前行为。

# 阶段 1 工具链与第三方依赖

核对日 2026-10-24。版本来自 Go 模块代理 / sumdb 与 npm 官方 registry 包元数据，固定直接依赖和锁文件。运行构建不引用浮动 latest。

| 工具/直接依赖 | 固定版本 | 许可 |
| --- | --- | --- |
| Go | 1.27.1 | BSD-3-Clause |
| Node | 26.9.0 | MIT（含其第三方许可） |
| npm | 11.19.1 | Artistic-2.0 |
| modernc.org/sqlite | 1.39.1 | BSD-3-Clause，SQLite 公有领域 |
| React / react-dom | 19.2.0 | MIT |
| React Router DOM | 7.18.4 | MIT |
| TanStack React Query | 5.90.5 | MIT |
| TypeScript | 5.9.3 | Apache-2.0 |
| Vite | 7.3.7 | MIT |
| @vitejs/plugin-react | 5.0.4 | MIT |
| Vitest | 4.1.12 | MIT |
| jsdom | 27.0.1 | MIT |
| Testing Library React / user-event / jest-dom | 16.3.0 / 14.6.1 / 6.9.1 | MIT |
| Playwright Test | 1.56.1 | Apache-2.0 |
| @types/react / react-dom / node | 19.2.2 / 19.2.2 / 24.9.1 | MIT |
| Alpine Linux | 3.22.2 | 混合，包含 musl MIT / BusyBox GPL-2.0 |

初始固定 Vite 7.1.12、Router 7.9.4、Vitest 3.2.4 后，npm audit 发现已知公告，已升级到上表修复版。更新后 `npm install` 报 **0 vulnerabilities**。这是执行时快照，不承诺未来无新公告。开发/测试工具不进入生产静态运行时。

完整前端传递依赖版本、integrity、license 保存在 `web/package-lock.json`，Go 版本与校验和在 `go.mod` / `go.sum`。Go 传递依赖许可证汇总见 `go-licenses.json`；前端汇总见 `npm-licenses.json`。这些是元数据记录，发布/分发时仍应保留依赖源包中的许可证和第三方通知。

Dockerfile 使用经 Docker registry 实际解析的 node、golang、alpine manifest digest。基础系统 APK 使用固定 Alpine 分支的安全更新，故 APK 内容会随仓库更新；不是逐包完全离线复现。

阶段 2 新增直接依赖（固定版本；npm lock 同步记录所有传递版本和 integrity）：

| 依赖 | 版本 | 许可 |
| --- | --- | --- |
| @uiw/react-codemirror | 4.25.3 | MIT |
| @codemirror/lang-markdown | 6.3.4 | MIT |
| @codemirror/view | 6.43.15 | MIT |
| react-markdown | 10.1.0 | MIT |
| remark-gfm | 4.0.1 | MIT |

Markdown 默认跳过 HTML；图片仅允许本应用附件 URL，服务仅内联检测出的 PNG/JPEG/GIF/WebP。传递依赖许可详见同步生成的 npm-licenses.json（保留各包 integrity）；完整许可文本随源包保留。

`rehype-highlight` 7.0.2（MIT）为预览围栏代码提供语法高亮；原始 HTML 仍禁用。

阶段 3：FullCalendar `@fullcalendar/core`、`react`、`daygrid`、`timegrid`、`interaction`、官方 `luxon3` 适配器统一固定 **6.1.19**（MIT）；`luxon` **3.7.2**（MIT）、`@types/luxon` **3.7.1**（MIT）。只使用标准日历插件，无 Premium 依赖。`package-lock.json` 与完整 npm 许可/integrity 清单同步；安装时 audit 为 0 vulnerabilities。命名时区由官方 luxon3 适配器处理，输入通过 Luxon 按部署时区生成带明确偏移的 RFC3339，拒绝夏令时跳时中不存在的墙上时间。

2026-10-25 发布审查修复：Go构建工具链更新1.27.3，运行时同分支补丁更新Alpine3.22.7；Node保持26.9.0。上述初始表保留历史版本，当前实际版本以Dockerfile/go.mod为准。基础镜像固定manifest digest；APK仍使用同分支仓库安全更新。来源与最终二进制检查见发布修复记录。
