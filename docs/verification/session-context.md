# 会话文本上下文验收 — 2026-11-12

## 本地检查

- `npm run typecheck`：exit 0。
- `npx vitest run server/session-context.test.ts client/session.test.ts client/onboarding-logic.test.ts shared/i18n.test.ts --reporter=dot`：exit 0，4 文件、115 通过。
- `npm test -- --reporter=dot`：exit 1，1336 通过、33 失败、7 跳过，2 个 Windows Unix-socket 未捕获错误。前一次为 1337/32/7；不宣称全量通过。原始失败在本机 `session-context-tests.log`。

## 实际验证

进行中。使用独立 headless Chromium 和仓库 `docs/promo/shot-lib.mjs`，不操作用户的两个 Paseo 窗口。每次只创建专用 fixture 项目及其资源，结果与清理回执在 `session-context-live/results.json`。早期 harness 因 Playwright Windows 缓存发现和错误文本精确匹配失败，均已执行 fixture 清理后重跑；它们不计为产品失败或通过证据。

## 独立验证

待在实现提交的临时 worktree 上由指定 Haiku 5.5 会话执行；实现者不编辑独立报告。

## 未运行

- Android/iOS 实机。
- 整个 daemon 重启（只做插件 reload）。
- PostHog 端到端：本卡未改 telemetry；测试进程设置 `NODE_ENV=test`、`FLOWLY_TELEMETRY=0`。当前运行 daemon 的 `telemetry.status.forcedOff=false`，没有为测试重启用户 daemon 或更改其全局设置。
