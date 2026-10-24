# Noteapp 后端结构

后端保持轻量模块化单体：普通构造函数组装、显式SQL、SQLite专用表。数据模型与既有HTTP接口保持兼容。

## 职责和依赖

```text
app / asset/http.go        HTTP解析、响应和状态码映射
         ↓
objectquery               组合对象、项目只读状态、关联的应用查询
         ↓
task / page / event       类型专属操作和事务
relation / trash          跨对象关联、删除与恢复事务
workspace                 跨项目只读查询
         ↓
object / taskmeta         对象契约、固定属性描述、任务元数据
apperr                    不含HTTP状态码的应用错误
platform/database         SQLite连接、迁移
```

app仍是依赖组装入口。objectquery通过构造函数接收读取函数，HTTP handler不再负责跨模块查询编排。无需通用Repository或DI框架。

业务服务继续直接使用database/sql。这里明确保留了业务校验和SQL的局部耦合，尚未引入完整的独立领域层、存储适配层。

## 对象与属性

- object.Entity由任务、笔记、日程实现，AsObject生成统一读取结构。
- object.Describe声明固定属性，taskmeta提供任务默认值、允许值及阶段终结语义。创建、校验、config、属性选项和工作台筛选复用这些定义。
- SQLite的DEFAULT和CHECK仍作为第二层保护；真实临时数据库测试验证元数据、服务默认值及数据库约束一致。
- Object.Properties仅用作API输出结构。保存使用原有明确类型与专用事务，不以任意map写入数据库。
- 对象version描述其原生记录的内容/移动版本。关联采用独立的幂等增删操作，不递增对象version；统一对象读取是组合查询，不保证跨记录的事务快照。

## 事务边界

- 类型修改：读取当前对象、归档检查、业务校验、版本比较和写入在同一事务内执行。
- move：同一事务检查同项目、父级、防循环或一层子任务约束，再移动和排序。
- relation/trash：集中管理跨对象事务，避免服务相互开启嵌套事务。
- 附件：先预检项目并限额接收临时文件，完成流读取、类型识别及关闭文件后，再开启短事务，重新检查项目可写性、原子改名并写元数据。失败清理临时/目标文件。客户端上传流期间不占用数据库连接。

## 错误边界

apperr包含invalid、not_found、conflict和too_large类别。HTTP适配层统一映射为400、404、409和413，未知错误日志记录并返回脱敏500。httpx的兼容辅助函数保留原有错误身份与接口表现；业务模块不依赖httpx。

## 当前边界

单实例、单数据库连接的部署模型保持不变。尚未增加数据库抽象、多实例写入支持、通用属性写接口或自定义字段。

## 块正文

`internal/document` 定义三类对象共享的块文档写入规则：格式版本、块类型/ID唯一性、inline/table最小可读结构及规模限制。各类型服务在自己的事务中调用它，同时保存 `body_document`、当前 Markdown 投影 `body` 和首次转换前的 `legacy_body`。JSON 为权威正文；前端统一生成 Markdown 投影，后端不独立进行格式转换。旧客户端不能以单独变化的 body 覆盖块文档。属性编辑、归档、回收站和版本锁沿用原有边界，块不是新的业务对象，也不引入通用属性存储或协作服务。
