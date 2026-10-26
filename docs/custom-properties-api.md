# 自定义属性API

所有路径以 `/api/v1` 开头，类型只能是 `tasks`、`pages`、`events`。沿用既有Host/Origin限制和本机/可信局域网使用边界。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/projects/{projectId}/property-definitions/{type}` | 共享定义，返回`definitions`数组 |
| POST | 同上 | 创建：`kind`或`source_id/source_version`，可选`name`、`request_id` |
| PATCH | `/property-definitions/{id}` | `version`以及`name`/`options` |
| GET | `/objects/{type}/{id}/custom-properties` | `fields`数组和`read_only` |
| PUT | `/objects/{type}/{id}/custom-properties/{definitionId}` | `version`、`definition_version`、`value` |

创建类型为`text`、`single_select`、`multi_select`或`url`。默认中文名为文本、单选、多选、网址；同名自动编号。定义只属于一个项目的一种对象类型；所有对象读取时自动获得定义，未填值为null、值版本为0，不为旧对象批量补行。相同`request_id`及规范输入重试返回同一创建结果，跨范围或不同输入复用该ID返回409。

例如先创建文本定义：

```json
{"kind":"text","request_id":"client-unique-request-id"}
```

得到定义ID与version=1后，命名为备注：

```json
{"version":1,"name":"备注"}
```

新定义version=2，给某个对象填写值（不增加正文版本）：

```json
{"version":0,"definition_version":2,"value":"仅属于这个对象的备注"}
```

返回的field含`definition`、`value`和独立`version`（此时1）。后续修改必须提交该值的当前version及定义的当前definition_version；冲突返回409，不覆盖旧值。通用`GET /objects/{type}/{id}`也返回`custom_properties`数组。

单选/多选定义的选项示例：

```json
{"version":1,"options":[{"id":"choice-a","name":"研究","color":"blue"},{"id":"choice-b","name":"生活","color":"green"}]}
```

选项ID最长64个ASCII字母/数字/连字符，名称1–80字符、同一属性内不重复；稳定ID可以重命名，不能删除已有ID。定义名称在项目与对象类型内不重复，不能覆盖同类型固有属性。类型固定，PATCH传kind会400。

值格式：文本/网址为字符串；单选为一个选项ID；多选为不重复的选项ID数组。显式`value:null`清空，空字符串/空多选也规范化为null；清空仍保存递增版本，避免重用旧版本覆盖。缺失value、类型错误、非法选项、超限或非HTTP(S)网址400；不存在404；归档/范围/版本冲突409。网址不允许内嵌用户名密码。

上限：每项目每类型64定义、100选项；名称80字符、文本4000字符、网址2048字符。后端在真实SQLite事务内同时检查对象存在/项目可写/定义范围/两个版本，再原子写入；复合外键进一步阻止跨项目/类型引用。正文仍由原生PATCH版本控制，两者互不覆盖。定义与值版本参与删除预览指纹；对象软删除后值保留，按原批次恢复后可见。备份脚本自动包含新增表。


## 颜色及同项目跨类型复用

选项可选 `color`：`gray`、`brown`、`orange`、`yellow`、`green`、`blue`、`purple`、`pink`、`red`。缺失/空值为默认中性色。非法颜色400，修改颜色与选项名称共用定义版本锁。

向当前类型创建一份同项目其他类型的定义：

```json
{"source_id":"existing-note-definition-id","source_version":2,"request_id":"unique-import-intent"}
```

复制模式不能同时指定 `kind/name`，来源必须属于同项目另一类型且版本匹配。复制名称、类型、选项和颜色，生成新的定义ID/version1，不复制对象值；目标类型全部对象自动获得该定义。此后两种类型的定义独立管理。目标已有同名属性409；来源版本过期409；来源范围错误400。所有验证与创建在同一SQLite事务中完成，支持丢响应幂等重试，保持原64定义限制。
