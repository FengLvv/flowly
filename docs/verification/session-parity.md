# 聊天配置对齐验收 — 2026-11-16

## 交付范围

输入：用户本卡描述及截图；Paseo 公开插件文档；安装的 plugin/client/protocol 0.15.0 类型；本机 Paseo CLI 0.16.0-beta.2。用户已明确批准服务端短连接例外，见 [契约](../SESSION-PARITY-SPEC.md)。

- 在现有会话内切换同提供方模型；按真实会话数据呈现 toggle/select 功能，因此 Codex 的 Speed（`service_tier`）及 Plan（`plan_mode`）均可直接修改。保留推理强度和权限控制。
- 服务端刷新会话、校验活动卡片/项目及 workspace 归属，验证模型目录和功能值；连接建立后再次授权。每会话锁、客户端共享操作锁、失败状态回读与连接 finally 释放；不创建替代会话、不发提示词、不修改卡片状态。
- 新增原会话重载（运行中须确认）及消息复制按钮。模型/特性菜单有高度上限及内部滚动，紧凑界面使用内联菜单。
- 同步全部九份翻译、README、More features 与一次性 session-controls 提示。没有版本、What's new、持久化 schema 或依赖变化。未增加遥测字段：这些是已有原生会话动作的入口，没有新的 Flowly 设置或上报模型/功能 ID。

## 通过

- 实现者最终 `npm run typecheck`：exit 0。
- 实现者聚焦 `npm test -- server/session-settings.test.ts client/onboarding-logic.test.ts shared/i18n.test.ts client/session.test.ts client/session-input.test.ts client/session-chips.test.ts client/focus-ring.test.ts --exclude '.test-data/**' --reporter=json`：exit 0，**156 passed / 0 failed**。
- 已安装插件真实 RPC + 界面：`node docs/verification/session-parity-live.mjs`，exit 0，**16/16**。真实 Codex 会话验证两个模型往返、Speed/select 和 Plan/toggle 的修改及回读、未知功能和不存在卡片拒绝、桌面和 750px 紧凑界面修改模型、原会话空闲重载、插件重载后状态保持、零 page errors。界面 Speed/Plan 操作也实际回读原生状态。
- 本次真实会话 `c9e69c62-b564-4cfe-aef1-8fa27f2287f0`：未发送任何模型消息，ID/workspace 保持；最后只删除自己带 ownership label 的会话，并确认卡片/workspace 保留。所有较早测试尝试也执行了 finally 清理。使用独立浏览器和安装的 renderer，没有操作用户两个原生窗口，没有重启 daemon 或重载 infinite-canvas。
- 结果：[JSON](session-parity/results.json)、[桌面](session-parity/desktop-models.png)、[紧凑](session-parity/compact-models.png)。截图使用 `docs/promo/shot-lib.mjs`。在菜单打开动画尚未完成时截图可能偏淡；选择操作和原生回读另行断言，不以截图冒充运行证据。
- 运行状态回读：flowly、infinite-canvas 均 enabled/running。此状态本身不作为行为验收。

## 失败与边界

- 初始 `npm test` 默认扫描了其他任务留下的 `.test-data` 检出，重复执行旧代码及 fixtures：5649 passed、172 failed、87 skipped；该结果不能代表本卡精确提交。随后显式排除了这些目录。
- 当前共享工作树全量 `npm test -- --exclude '.test-data/**' --reporter=json`：exit 1，**1472 passed / 34 failed / 8 skipped**。包含 Windows 路径/套接字/权限与同时进行的工作区延迟创建改动；没有放宽断言或将其称为全量通过。原始结果在 `.test-data/session-parity-tree.json`。独立精确提交/父基线对照由独立会话另写，见下节。
- 测试代码 `server/linked-projects.test.ts` 的子进程 mock 只识别 `/paseo`，Windows `.cmd`/应用运行器会绕过它。已要求独立测试后续使用隔离 PASEO_HOME。日常 native registry 观察到若干 `ultra-linked-*` 下的 Shop-Stack/Edit 项目；缺少运行前基线，不能归因或删除归属不明记录。此历史测试基础设施问题单独列出，不冒充聊天配置的失败或擅自清理用户资源。
- UI 脚本早期失败分别是 Playwright 缓存路径未自动发现、项目 tab 的 accessible name 定位、resize 后须从概览重新打开会话、menuitem 被误作 button；最终同一套检查完整重跑通过。没有通过强制点击绕过禁用状态。
- 未跑 Android/iOS 真机、运行中重载确认的实际中断、真实剪贴板复制、模型配额/网络故障注入，以及所有其他提供方逐一验证。错误和并发路径有自动化回归，但不能替代所有提供方实测。
- SDK 仍未开放可嵌入原生聊天页。原生语音/听写、任意附件、富工具批准详情、原生 slash/skill/plugin 命令、rewind 和宿主 timeline 插件等保留 **Open in Paseo**。这次交付不能称为原生聊天全部功能 100% 等价。

## 独立验证与 Git

- 生产代码冻结：`60f32208f285f1fa0a3e00d504838f6b7f9dc81e`，父提交 `a45f4f50f4c3983c30657619c90158fbd3703c56`。用私有 index 从 origin/main 构建，只包含本卡修改；未切换共享 main、未改主 index，也未把 TAPD/拖动面板/延迟工作区等并行工作带入。
- 指定模型实际可用：`claude/claude-haiku-5-5`，会话 `323181c4-229a-42d2-baaa-232966545650`，创建时 `bypassPermissions`。其自己的临时 detached 检出位于卡片目录内，不创建新的 native workspace，不复用共享 node_modules。
- 独立结果由该会话写入 [独立报告](session-parity-independent.md)；主实现者不修改其证据。
- 独立结论：typecheck exit 0；八文件聚焦 exit 1，163 passed / 4 failed（均为父基线已有 error-report 测试）；隔离全量 exit 1，1378 passed / 28 failed / 7 skipped，父基线 1362 passed / 同一组 28 failed / 7 skipped。新增失败集合为空，未发现 High。未重现的低风险备注：onChanged 若改成会 reject 的回调，finally 的拒绝需要额外处理；当前调用者是 React Query 默认不抛错的 refetch。
- 独立检出及其真实 node_modules 已移除，旧任务检出保留。验证会话在收到完成通知并回读 idle 后删除，ID 保留在报告。
- 已推送生产代码分支，创建 [PR #5](https://github.com/FengLvv/flowly/pull/5)。当前没有 CI workflow runs、commit statuses 或 CodeRabbit review；未启用会绕过所需审查的自动合并，未合并、未移动共享 main。此项继续等待仓库审查配置/用户决定。
