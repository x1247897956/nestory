# Custom Properties Implementation Plan

> 执行方式：本会话直接按任务实施（executing-plans），不为已授权的普通实现细节反复确认。

**Goal:** 四种自定义属性在同项目同类型对象间自动共享定义，各自保存值。
**Architecture:** 独立Go模块，schema9两表；独立值版本防止正文覆盖，统一对象视图聚合；React复用useAutosave。
**Tech Stack:** 现有Go/SQLite/React/TypeScript，锁定依赖不变。
**Spec:** docs/superpowers/specs/2026-10-26-custom-properties-design.md

## Global Constraints

四类型text/single_select/multi_select/url；归档只读；跨项目/类型拒绝；空值默认；既有正文/原生版本不改；名称80、定义64、选项100、文本4000、URL2048。类型不可转换、选项不可删除。

## Review Focus

- 幂等重试不能重复创建；同名并发409。
- 同项目不同对象/类型不得串值；外键和真实SQLite验证。
- 正文保存与属性保存不能互相覆盖；值版本冲突保留草稿。
- 定义选项修改使用稳定ID；删除批次恢复保留值，预览并发变化必须409。
- 导航/关闭及强制关页恢复、恶意URL、归档、备份恢复和schema8升级真实验证。

### Task 1: 后端与迁移

Files: migrations/009_custom_properties.sql, embed.go, database.go；internal/customproperty/{service,definition,value}.go；internal/object/object.go；internal/app/custom_properties.go；objectquery及trash指纹。
Interfaces: Spec中的5个HTTP接口；Service Definitions/Create/Update/Fields/Set；共享object.CustomProperty定义和值结构。
- [x] 先写API测试：继承、隔离、四类型、版本、只读、幂等、删除恢复与指纹；运行红灯。
- [x] 实现schema9及服务事务、API、对象聚合；测试绿灯，race/vet通过。
- [x] 更新迁移版本断言；测试原数据不变和复合外键拒绝错误引用。

### Task 2: 完整前端

Files: web/src/components/object/CustomProperties.tsx, PropertyField.tsx, PropertySettings.tsx, properties.css；ObjectProperties接入，api持久创建intent。
Interfaces: type-first创建默认名→自动命名；属性值/定义自动保存，fields查询缓存聚合，独立草稿key。
- [x] 写浏览器用例覆盖同类型已有/新建对象继承、异类型/项目隔离、全部值、选项编辑、版本冲突、正文不丢、归档。
- [x] 实现紧凑字段、菜单与各状态、自动保存及恢复，单测/构建/浏览器测试。

### Task 3: 验收与部署

Files: README.md、实施记录、执行证据；scripts/audit迁移演练schema9。
- [ ] 全包Go测试/race/vet、前端单测/构建、完整E2E、运维备份恢复。
- [ ] 真实schema8备份副本升级9，原12表除迁移记录外逐值一致、附件SHA一致；干净卷恢复自定义值。
- [ ] 备份实际实例、构建并本地部署；检查数据，更新复选框并本地提交，不推送。
