> 历史设计/实施记录：保留当时范围与验证结果。当前界面、正文格式及功能请以[项目介绍](../../../README.md)为准；旧Markdown三模式、多层笔记界面等描述不代表当前行为。

# Task Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development for isolated component/test tasks; root owns App integration and verification.

**Goal:** Provide interchangeable task list and stage Kanban views using the same persisted tasks.
**Architecture:** React view preference + TaskBoard component, existing Go task PATCH/CAS and query invalidation, no schema or dependency changes.
**Tech Stack:** Existing React19/TypeScript/Vite, native HTML drag/drop and select fallback.

## Requirements

- User now explicitly adds Kanban to the previous V1 scope. First iteration supports list and board, five fixed existing stages.
- Board shows each task exactly once in its own stage; children remain independent and show parent context.
- Same priority filter applies to both views. List grouping stays a list-only control.
- Persist view choice per project locally; blocked storage must not break the view. First use defaults to list.
- Card click opens existing centered details; closing returns to chosen board/list. Overview-origin behavior remains unchanged.
- Dragging across stages or using the accessible stage selector calls the existing CAS update. Busy/archived views disable mutations; failures keep server-consistent cards and visible recovery.
- Per-column create opens the existing task form with that stage preselected and visible. Global/list create defaults Todo. Default-stage creation payload compatibility remains unchanged.
- Board scroll is contained horizontally; long titles/parent names, empty/loading/errors and 390px touch usage remain operable.
- Preserve existing unrelated brand assets and worktree modifications. Tests only mutate temporary databases/volumes.

## Review Focus

1. Parent/child stages must never cascade; each matching task appears once.
2. A stale/failed PATCH must not falsely move cards or silently overwrite another update.
3. Switching projects must not leak the prior project's view or create-stage default.
4. Closing details, refresh, overview origin and unsaved body guards must retain current behavior.
5. Native DnD must reject foreign payloads and not be the only mobile/keyboard control.

## File map

- New web/src/features/task/TaskBoard.tsx + task-board.css: stage columns/cards, DnD, selector fallback, archive/busy states.
- New web/src/features/task/TaskViews.tsx: project-local preference and accessible view switch.
- App.tsx: integration, filtered data, stage creation input, shared existing mutation.
- New web/e2e/task-views.spec.ts: real API persistence, independent child state, view preference, errors, archive, responsive bounds.
- README + implementation record + evidence: actual checks, deployment/backup and known limits.

## Tasks

- [x] Create behavioral browser tests and observe old image failing the missing view control.
- [x] Implement isolated TaskBoard and root view preference/integration.
- [x] Run build/unit tests and focused browser checks; fix failures.
- [x] Fresh review of spec and code; full browser regression and appropriate Go API checks.
- [x] Backup, deploy local container, smoke/data check, documentation and local Git commit.

Ruling: Same-stage dragging does not reorder; native task order remains unchanged. Cross-stage movement is the first board operation. No custom stages, team functionality, recurring events or generic workflow engine are introduced.
