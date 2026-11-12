# 性能检查

项目面向单人使用。性能验证使用新建临时实例，覆盖每类 100、1000、5000 个任务、笔记和日程，不连接日常使用的数据卷。

## 复现

准备测试镜像后，从仓库根目录执行：

```sh
mkdir -p .local/reports
python3 scripts/audit/backend_performance.py --image noteapp:test --properties --output .local/reports/capacity.json
```

工具每个端点预热，默认测量三轮、每轮二十个请求，输出原始样本、中位数和 nearest-rank p95。记录响应大小、gzip、并发搜索时的保存、数据库页统计和内存采样。参数见 `--help`，其他工具见[审计说明](../scripts/audit/README.md)。

测量期间避免同时执行其他基准、浏览器回归或构建。比较两个版本时，应固定数据、工具链、Docker 资源条件和请求方式。报告留在 `.local/`，不随源码提交。

## 当前实现与边界

- 搜索使用派生文本与 SQLite FTS5 trigram，保留 LIKE 子串语义。短查询及字面符号查询仍可能扫描派生文本。
- 当前前端集合使用 `include_body=false`，只读取属性。兼容的完整集合仍返回全部正文，不能把属性接口的结果推广到它。
- 搜索索引在源写入事务中同步更新，会增加数据库空间与正文保存成本。
- 重复样本文本的压缩率不能代表真实笔记；API 响应计时不能代表浏览器渲染时间。
- 单次并发样本、heap 或 Docker memory 采样不代表并发 p95、峰值内存或无泄漏证明。

旧的本机测量记录已清理。发布结论应来自目标版本的新测量，而不是照搬旧机器的数字。
