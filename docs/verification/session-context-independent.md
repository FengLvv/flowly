# 会话上下文独立验证 — f996043 (2026-11-12)

- 验证会话 ID：2e9502dd-de41-4355-890d-40c844290088（Haiku 5.5 独立验证会话，未修改任何实现文件）。
- 候选提交：`f99604395a5b88b3940f953898a8a0d6819222f4`（分支 `feat/session-context` 上的 `f996043`）。
- 基线提交：`a597cc881c61af00bbd1d76e2680ec49d43cdcee`（`a597cc8`）。
- 环境：`NODE_ENV=test FLOWLY_TELEMETRY=0`；候选与基线各自为临时 `git worktree`（位于 `.test-data/indep-candidate` 与 `.test-data/indep-baseline`），`node_modules` 通过 Windows junction 指向主检出的依赖，未安装或修改依赖。

## 命令与结果

| 命令 | 工作树 | 退出码 | 结果 |
|---|---|---|---|
| `npm run typecheck` | 候选 | 0 | 通过 |
| `npx vitest run server/session-context.test.ts client/session.test.ts client/onboarding-logic.test.ts shared/i18n.test.ts --reporter=dot` | 候选 | 0 | 4 文件、115 测试通过 |
| `npm test -- --reporter=verbose` | 候选 | 1 | 1337 通过、32 失败、7 跳过、2 个 Unix socket 错误 |
| `npm test -- --reporter=verbose` | 基线 `a597cc8` | 1 | 1277 通过、32 失败、7 跳过、2 个 Unix socket 错误；另有 1 个文件在收集阶段失败 |

## 失败身份对比

- 候选与基线的 32 个失败测试名称完全一致（比较的是 `FAIL` 行的测试标识），属于 Windows 环境既有失败，与本提交无关。
- 唯一差异：基线中 `shared/i18n.test.ts` 收集阶段失败，错误为 `ENOENT ... F:\F:\Project\...`。这是基线临时工作树的路径拼接问题（`i18n-keys.ts` 使用了工作目录路径），不是提交缺陷；候选中该文件通过。因此基线的 "33 失败" 中多出的一项不能作为本提交的回归。

## 代码审查（只读，未修改）

- 归属与边界（`server/session-context.ts`）：源会话须属于本项目（原生项目或本项目的关联卡工作区），非归档、非内部、非摘要器；源工作区须存活。已在读取前后各重新授权，并覆盖"读取期间被改派到其他项目"的测试（`fresh authorization detects source reassignment`）。
- 文本裁剪与分页：仅保留 user/assistant 文本，按时间顺序输出；每页 100 条、最多扫描 1000 条；从最新端向旧端保留至多 60,000 字符；被截断的消息带 `[Earlier text omitted]` 标记。游标回退或不前进时抛错。未发现缺陷。
- 源不可变：读取只使用 `timeline.refetch` 与 `refresh`，没有任何写操作。
- 创建恢复（`client/session-create.tsx`）：先执行 prepared-agent 恢复，再读取源会话；指纹包含 `contextSource`。恢复路径不会重新读取或重发源文本。与规格一致。
- 轻微观察（非阻断）：
  - 输出头部（标题与说明）会使 `text` 超出 60,000 字符约数百字符；仍在 RPC 的 62,000 上限内，规格中的"60,000 字符"指对话正文，可接受。
  - 选择器在选项列表未加载时以 id 作为占位显示，只是视觉细节。

## 未运行（显式）

- 未做任何 UI、实机或 Paseo 窗口操作（按指令）。
- 未验证源会话与目标会话的端到端消息接收。
- 未在 daemon 上运行遥测检查（本提交未改遥测）。

## 清理

- 临时工作树与 junction 在本报告写入后移除，并验证主检出的 `node_modules` 仍存在。

## 最终集成提交复验 — 90a18dc

- 候选：`90a18dcb8d5255ed662d80b2c0ea12488fbdeac6`（`chore: integrate pending description image support`），临时 worktree `.test-data/indep-final`，`node_modules` 为指向主检出的 junction；`NODE_ENV=test FLOWLY_TELEMETRY=0`。

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npm run typecheck` | 0 | 通过 |
| `npx vitest run server/session-context.test.ts client/session.test.ts client/onboarding-logic.test.ts shared/i18n.test.ts shared/description-images.test.ts server/description-images.test.ts --reporter=dot` | 0 | 6 文件、128 测试通过 |
| `npm test -- --reporter=verbose` | 1 | 1350 通过、32 失败、7 跳过、2 个 Unix socket 错误 |

- 失败身份：90a18dc 的 32 个 `FAIL` 测试标识与 f996043 候选的 32 个完全一致；与基线相比，唯一差异仍是基线的 `shared/i18n.test.ts` 临时路径收集错误。未出现新的失败身份，因此未需要重跑聚焦套件。
- 合并后的 `client/session-create.tsx` 审查（只读）：
  - 说明图片 / 描述修订：`useDescription` 读取描述后替换图片、写入描述修订；提交前检查修订与当前卡片不符即报错，不创建会话。
  - 指纹包含 provider、模型、模式、思考、标题、正文、ordinary、`contextSource`、图片与描述修订，源或描述变化都会使重试指纹失效。
  - 顺序：恢复已准备会话（`attempt.current.prepared`）先于描述修订检查与源读取，恢复路径不重发指令、不重读源。
  - 上下文附件仍在创建参数中，与描述指令（`instructionText`）并存。
  - 选择上下文源时清除旧错误（`onChange` 中 `setError("")`），与"源变化后清除陈旧错误"一致。
- 结论：未发现真实缺陷。
- 未运行：UI、实机、端到端消息接收（与前次一致，本次未做）。

## 清理

- 最终复验的 `.test-data/indep-final` junction 与 worktree 在本报告写入后移除，并验证主检出 `node_modules` 仍存在。
