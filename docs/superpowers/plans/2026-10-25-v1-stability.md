# V1稳定性修复 Implementation Plan

> Use subagent-driven-development for independent implementation and read-only review. Keep architecture: Go modular monolith + SQLite + React.

**Goal:** Fix audited draft durability, delete snapshot, upload/move race, ambiguous network outcomes and document limit mismatch before stable V1 acceptance.

## Contracts

1. useAutosave sixth optional argument is storageKey:string. Existing callers without key retain behavior. Key includes type+object ID; persist versioned {baseline,draft,version} synchronously on edit. Restore draft on mount. If server baseline changed, never silently overwrite: preserve draft and pause with recovery error. Storage failures visible. Clear only successfully saved snapshot, retain newer edits; no unmount deletion. Return discardRecovery() to clear recovery after explicit user-confirmed reload; caller invokes after reload success via optional callback before remount. Cross-tab records must not silently overwrite other tab's unsaved draft (per-tab/session owner or equivalent). Draft survives page/browser process reload. Readonly archived objects keep recovered content but never autosave.
2. Create inputs project/task/page/event add optional request_id. Durable request table schema8, lookup/hash/replay + create result must share native object transaction. Same key/scope/payload returns original object JSON, different payload/scope key collision409. Validate key length; no-key legacy API still allowed. Metadata updates must reject request_id or clearly ignore it? Prefer explicitly reject on update. Errors/rollback do not reserve request permanently. No HTTP middleware transaction nesting.
3. Frontend API auto attaches stable request_id to creation endpoints; same pending path+payload retry (incl reload) reuses ID; only clear known successful/explicit rejection. Preserve prior pending intents independently, do not conflate intentional later create with retried request. Network/500 retains ID. Calendar drag after response error must reconcile by GET before displaying final state; when unavailable show unresolved state and block further edits until explicit sync.
4. Delete preview includes fingerprint of canonical member identities/types/versions; recompute inside transaction, require exact same fingerprint + root version/count. Never trust submitted member list alone. UI sends fingerprint. Tests project A replaced C same count and descendant edit.
5. BlockEditor reports onPendingChange(boolean) to parent; TaskEditor disables move while any file upload/import pending and prevents remount race. Document JSON max2MiB shared frontend/API contract; HTTP max request envelope accommodates worst-case escaping + metadata and returns413 on overflow. Frontend stops oversized autosave with actionable error but retains draft. 1.1MB native doc saves; >2MiB rejects atomically. Backend validate compact document bytes (not whitespace) consistently if needed; tests define it.

- [x] Red tests for audited failures.
- [x] Persistent drafts + unit recovery/conflict/storage failure/serialized snapshots.
- [x] schema8 transactional idempotency + snapshot fingerprint + realSQLite tests.
- [x] Stable create retries + calendar ambiguous response reconciliation + tests.
- [x] Wire draft identity/discard controls, pending import/upload guard, limits + tests.
- [x] Go test/race/vet, frontend build/unit/fullE2E; browser fault injection for uploadmove/create response loss/crash-style recovery/stale delete/large docs.
- [x] Backup, isolated upgrade/restore checks and production deploy; document honest limitations; local commit only.

Ruling: 创建窗口身份不只信任sessionStorage，增加context name和启动时活跃身份探测；避免复制标签页合并独立意图。BFCache persisted pagehide保留探测通道。故障验证35/35，单测55/55、Go test/race/vet、Docker运维9/9通过；原卷升级及最终逐表比较完成。详情见docs/implementation/2026-10-25-v1-stability.md。
