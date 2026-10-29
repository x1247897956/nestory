# Noteapp 后端结构

当前产品行为见[现行产品说明](current-product.md)，以下技术约束与当前代码对应。

后端保持轻量模块化单体：普通构造函数组装、显式SQL、SQLite专用表。正文接口使用块JSON；其他对象属性与事务语义保持不变。

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

单实例、单数据库连接的部署模型保持不变。尚未增加数据库抽象或多实例写入支持。固有属性仍通过各类型专用事务写入；schema9自定义属性由customproperty模块管理定义和值，具体协议见[自定义属性API](custom-properties-api.md)。

## 块正文

`internal/document` 校验三类对象共享的块文档：格式版本、块类型/ID唯一性、inline/table最小可读结构及规模限制。各类型服务在自己的版本事务中只保存 `body_document`；新建省略正文时保存空块文档，更新省略时保持正文，显式null拒绝。HTTP输入拒绝`body`与`legacy_body`等未知字段，响应没有这两项。错误恢复复制块JSON，Markdown仅在客户端导入/导出时转换。

schema7校验/迁移全部对象（包含归档和回收站）后删除旧Markdown列。已有块数据原样保留；非空旧正文须先使用锁定BlockNote解析器准备，Go迁移检查源SHA256和块结构，在同一事务中复制、删列、删准备表及记录版本，失败回滚。数据库为块字段提供非null空文档默认值和JSON基础CHECK。完整应用级结构仍由document.Validate把关。

搜索使用SQLite json_tree从块的text与附件name读取文本，不保存第二份正文或Markdown投影；不会把块ID、类型名、附件URL或样式值当正文搜索。属性、移动、归档、关联和批次恢复沿用现有事务边界。当前JSON搜索适合个人规模，未引入全文索引。

## 稳定性边界（schema8）

`idempotency.Create`是创建操作专用的事务辅助函数：请求ID、作用域、规范化输入摘要和原始创建结果与对象插入在同一个SQLite事务提交。同ID同输入重放原结果；ID被其他输入或作用域使用时409；没有请求ID的旧API仍可调用。它不引入服务容器、队列或通用工作流。请求记录目前保留，不做会破坏旧重试语义的自动过期清理。

删除预览的fingerprint包含规范排序的对象类型、ID和版本，在删除事务内重新计算；数量和根版本相同也不能跳过成员快照校验。正文上限为序列化块JSON的2MiB，HTTP JSON请求外层上限3MiB，超限统一413并保证拒绝后原数据不变。

对象编辑器的未保存块草稿保存在当前浏览器localStorage中，带服务器基线、版本和窗口身份；服务器发生变化时暂停自动覆盖，保留本地内容供复制/处理。创建重试标识也在本机持久保存。窗口身份以sessionStorage/context name和启动时的BroadcastChannel探测隔离，复制标签页不会共享活跃窗口的创建身份。浏览器端副本是恢复缓存，不是另一种服务端正文格式，也不跨设备同步。

## 加载与传输性能

正文编辑器通过React.lazy/Suspense按需加载，集合页不初始化BlockNote；加载失败由局部边界显示重新加载入口。页面按需启用任务查询，笔记/日程页面不额外请求完整任务集合，但汇总来源浮层保留原背景所需数据。

HTTP Host/Origin校验后由httpx.CompressJSON处理GET JSON协商压缩，使用标准库gzip.BestSpeed、Vary: Accept-Encoding。不缓冲完整响应，不改变对象字段；写请求、静态文件、附件、Range、无正文响应和已有编码保持原行为。压缩不替代分页或限制解码内存，数据库和事务边界不变。
