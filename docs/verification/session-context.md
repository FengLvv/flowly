# 会话文本上下文验收 — 2026-11-12

## 本地检查

- `npm run typecheck`：exit 0。
- `npx vitest run server/session-context.test.ts client/session.test.ts client/onboarding-logic.test.ts shared/i18n.test.ts --reporter=dot`：exit 0，4 文件、115 通过。
- `npm test -- --reporter=dot`：exit 1，1336 通过、33 失败、7 跳过，2 个 Windows Unix-socket 未捕获错误。前一次为 1337/32/7；不宣称全量通过。原始失败在本机 `session-context-tests.log`。

## 实际验证

已完成11项功能/清理检查，另确认原有 Use card description 入口仍在。来源 Claude Haiku 5.5 的约定 VIOLET-5839 经新会话附件送达 Codex GPT-6-Luna，模型正确回复同一码；空来源显示错误并且没有创建目标会话；源会话保持、reload后仍可导出，fixture项目/卡片/会话均已清理。使用独立 headless Chromium 和仓库 `docs/promo/shot-lib.mjs`，不操作用户的两个 Paseo 窗口。每次只创建专用 fixture 项目及其资源，结果与清理回执在 `session-context-live/results.json`。早期 harness 因 Playwright Windows 缓存发现和错误文本精确匹配失败，均已执行 fixture 清理后重跑；它们不计为产品失败或通过证据。

## 独立验证

原实现 f996043 已由指定 Haiku 5.5 在临时 worktree 复核：类型检查0、115/115相关测试；全量1337通过、32失败，32个失败名称与基线完全一致。见 [独立报告](session-context-independent.md)，实现者不编辑该报告。集成描述图片分支后的最终提交将由同一会话追加复验。

## 未运行

- Android/iOS 实机。
- 整个 daemon 重启（只做插件 reload）。
- PostHog 端到端：本卡未改 telemetry；测试进程设置 `NODE_ENV=test`、`FLOWLY_TELEMETRY=0`。当前运行 daemon 的 `telemetry.status.forcedOff=false`，没有为测试重启用户 daemon 或更改其全局设置。

## 集成检查

为保留本机已交付但尚未合并的描述图片功能，本分支合入 PR #1（`feat/card-description-images`）；新PR以该分支为base，差异只包含本卡功能。集成后类型检查exit 0；6文件focused suite 128通过、exit 0。全量最终本地运行1349通过、33失败、7跳过，2个Windows socket错误，exit 1；原始日志 `session-context-integrated-final-tests.log`。PR尚待创建/检查。

桌面截图见 `session-context-live/desktop-selected.png`、`desktop-picker.png`。紧凑web为750×900，弹窗边界x=115/y=87.91/w=520/h=724.19，创建成功；截图器排除了左侧320px，所以紧凑截图本身不是完整弹窗视觉验收。未操作用户的Paseo窗口。
