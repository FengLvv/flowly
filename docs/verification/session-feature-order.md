# 聊天工具栏顺序 — 2026-11-16

- 用户反馈：原生 Paseo 的 Speed / Plan 位于最右侧。规范先补充为：左侧模型、推理、权限；右侧独立功能组，保持提供方顺序（Codex 为 Speed、Plan）。实现只调整 `client/session-settings.tsx` 的分组和顺序，左侧可在自己的宽度内换行，右侧保持靠右；配置、授权、图标和操作不变。
- 生产提交 `244ff554dcb1f9f76d8b967e62604a155468a50d`。`npm run typecheck` exit 0；五文件相关回归 `npm test -- server/session-settings.test.ts client/onboarding-logic.test.ts shared/i18n.test.ts client/session-chips.test.ts client/focus-ring.test.ts --exclude '.test-data/**' --reporter=json` exit 0，**144 passed / 0 failed**。环境 `NODE_ENV=test`、`FLOWLY_TELEMETRY=0`、隔离 `PASEO_HOME`。[JSON](session-feature-icons/order-focused.json)。
- `FLOWLY_ORDER_ONLY=1 node docs/verification/session-feature-icons-live.mjs` exit 0，**9/9**。对真实安装的界面分别测量桌面、750px 和 680px：权限在 Speed 之前、Speed 在 Plan 之前，Plan 右边缘与工具栏右边缘相差不超过 1px。零 page errors。首轮跨断点后过早判断概览是否出现，测试未重新打开会话；增加布局过渡等待后按原断言完整重跑通过。
- [结果](session-feature-order/results.json)、[桌面](session-feature-order/desktop-rightmost.png)、[750px](session-feature-order/compact-750-rightmost.png)、[680px](session-feature-order/compact-680-rightmost.png)。截图使用 `docs/promo/shot-lib.mjs`，本机保留。
- 测试会话 `cb5d697c-d9b2-4aeb-810b-cfac50d89e98` 未发送模型消息，已删除；卡片/workspace 保留，独立浏览器关闭。早期尝试也执行 finally 清理。私有 index 和空临时目录清理，共享 main/index/其他工作不动。
- typecheck 后已重载 flowly。未重启 daemon、未重载画布、未操作用户的原生窗口。本轮为顺序/对齐的小幅 UI 修正，未重复全量、独立会话或真机测试；不宣称此前 28 项基线失败修复。现有引导仍准确，无新文案、翻译、tip、遥测、版本变更。延续 PR #5；尚未合并。
