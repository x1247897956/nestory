# 汇总页直接打开对象详情

根因：详情路由总是渲染所属对象类型的列表/日历，关闭也固定跳回类型列表，未保留项目汇总来源。

修复：汇总对象链接带同项目overviewProject导航状态，详情保留汇总背景（inert/aria-hidden），不渲染所属类型列表或日历；关闭/Escape返回汇总。导航状态保留在浏览器历史中，刷新和后退可恢复。直接URL和列表入口保持原类型背景及返回列表行为。来源状态校验同项目且只在三种具体对象路径有效，不控制权限和数据范围。显式点击面包屑仍可进入对应列表。原有未保存保护保持使用App的路由blocker。

验证：先用上版镜像在独立容器复现三种对象均失败，随后运行构建、单元和浏览器回归。所有测试只在独立容器/数据卷执行。保留工作区已有品牌和设计素材改动。

实际结果：构建及71项单测通过；完整浏览器回归91通过、1失败。旧项目汇总用例在URL已变化但浮层未就绪时使用全局“汇总”链接定位到背景，改为显式限定dialog中的链接并等待返回URL；应用镜像未改变，最终相关11项全部通过（15.2秒），含三种对象来源、刷新/历史/直接访问、详情保存和删除保护。完整日志保留原失败，不将其写成全量92项一次通过。

复现：npm test --prefix web -- --run；npm run build --prefix web；PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' sh scripts/audit/run_browser.sh noteapp:overview-dialog-origin-20261026。

部署：镜像overview-dialog-origin-20261026更新至本机18084，smoke7/7通过；before-overview-dialog-origin和after-overview-dialog-origin备份校验成功，13张业务/schema表逐行相同、附件清单相同；recent_visits保留同样58条标识，其中2条访问时间正常推进。无后端/schema/依赖改动。
