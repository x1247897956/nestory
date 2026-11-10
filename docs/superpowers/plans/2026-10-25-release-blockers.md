> 历史设计/实施记录：保留当时范围与验证结果。当前界面、正文格式及功能请以[项目介绍](../../../README.md)为准；旧Markdown三模式、多层笔记界面等描述不代表当前行为。

# 独立发布审计 A01–A05 修复计划

> Use subagent-driven-development to implement independent fixes and perform scoped review. Preserve the original independent audit report and its evidence.

**Goal:** Close release blockers from docs/reviews/2026-10-25-v1-release-audit.md without changing the supported single-user modular-monolith scope.

- [x] A01: shared crypto.getRandomValues-backed UUID generator, replace direct randomUUID in app; HTTP non-localhost browser create/edit/recover/clone tests across task/page/event.
- [x] A02: explicit configured Host allowlist before all routes (GET and writes), safe loopback direct-run default, retain Docker container binding and documented opt-in LAN hosts; Origin checks remain; ignore untrusted forwarded host; API and browser tests reject rebinding-style unknown host.
- [x] A03: validate actual pinned BlockNote default schema's inline styles, block props, table/cell/header/width shapes before writes; reject malformed atomically; do not strip unknown values or rewrite already stored data; positive all-type/style/table round-trip/reopen fixtures and archived/deleted corpus checks.
- [x] A04: Page/Event pending callbacks, reload and recovery controls/handlers double guard busy/pending; Task handler equally protected; tests all3 slow upload/import/inflight save/error reload.
- [x] A05: verify official Go patched version and runtime package advisories, pin updated build/runtime digests, check final binary build info, govulncheck plus bounded Range/multipart regression; record OS candidates and dispositions, never claim exploitability from a version match alone.
- [x] Convert independent defect assertions into regressions; original report remains immutable historical evidence. Keep tests isolated, allow explicit lan.noteapp.test only in disposable service; audit.invalid must be rejected.
- [x] Go test/race/vet, frontend test/build/full browser + nonlocalhost regression suite, migration tools, Docker operations, independent final review.
- [x] Backup before real instance upgrade; isolated restored volume, final-image restore and data checks; deployment smoke and local Git commit only, no remote push.

Rulings: no new login/team/microservices. No schema migration is planned for these fixes. Runtime container must explicitly keep APP_ADDR=:8080 even when direct execution defaults loopback. Host config accepts exact hostnames/IPs without ports (request authorities may include valid ports), never blanket trust arbitrary private-looking names/forwarded headers. Environment default local names must preserve existing test harness host example.com only when tests explicitly configure it. Preserve invalid existing JSON for manual recovery; no startup data rewrite.

实际结果及最终镜像ID见 docs/reviews/2026-10-25-release-fixes.md；独立复核追加的空表格物理行和鼠标菜单关闭残影已修复，全部59浏览器、66单测、Go test/race/vet、运维恢复9项通过。
