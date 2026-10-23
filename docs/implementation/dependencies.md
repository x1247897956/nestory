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
