# Windows 工作区目录包含关系 — 独立验证报告

- 卡片：28af5145-e398-4325-be8d-c14e3fe6959e
- 验证会话 ID：0db511d6-f0fe-4ce0-b547-65f27612e57b（由实现者 create_agent 回执确认）
- 候选精确 SHA：6005d4f（父 a597cc8，worktree：`.test-data/windows-containment-28af5145/candidate`）
- 基线精确 SHA：a597cc8（worktree：`.test-data/windows-containment-28af5145/baseline`）
- 环境：NODE_ENV=test，FLOWLY_TELEMETRY=0；两个 worktree 的 node_modules 为指向主检出的 junction（未修改、未删除）。
- 未执行 UI、安装、reload；未修改实现、卡片状态或 workpad；未 commit/push。

## 命令与结果

| 运行 | 树 | 退出码 | 结果 |
|---|---|---|---|
| `npm run typecheck` | 候选 | 0 | tsc 无错误 |
| `npx vitest run server/repos.test.ts server/repos-platforms.test.ts server/service.test.ts server/store.test.ts --exclude '.test-data/**' --testTimeout=15000` | 候选 | 0 | 4 文件，33 pass，0 fail |
| `npx vitest run server/repos.test.ts server/service.test.ts server/store.test.ts --exclude '.test-data/**' --testTimeout=15000` | 基线 | 1 | 3 文件，27 pass，3 fail（不含新增的 repos-platforms） |
| `npm test -- --exclude '.test-data/**'` | 候选 | 1 | 文件：155 中 136 pass，1 skip，18 failed（含 1 个文件级失败）；用例：1319 中 1284 pass，7 skip，28 failed（测试失败）；另有 2 个 unhandled errors |
| `npm test -- --exclude '.test-data/**'` | 基线 | 1 | 文件：154 中 133 pass，1 skip，20 failed（含 1 个文件级失败）；用例：1316 中 1276 pass，7 skip，33 failed（测试失败）；另有 2 个 unhandled errors |

**文件级失败与错误（与测试失败分开计）**
- `shared/i18n.test.ts`：文件级收集失败，两棵树都有。候选日志为 `ENOENT: no such file or directory, scandir 'F:\F:\Project\...\candidate\client'`（`shared/i18n-keys.ts:12`），即测试路径拼接在 Windows 上把盘符重复，属于环境/测试本身问题，与本卡改动无关，未修改。
- 2 个 unhandled errors（两棵树相同类型）：`server/local-daemon.test.ts:54` 的 `listen EACCES: permission denied ...\flowly-ld-*\d.sock`，即 Windows 下 Unix socket 监听被拒，属于环境限制。
- 与上述不同，`repos.test.ts` 本身没有文件级失败。

未对命令参数追加额外 `--exclude`（未加 `docs/verification/**`）。两棵树的文件数只相差新增的 `server/repos-platforms.test.ts`，未见 docs/verification 内文件被误收集。

## 失败身份比较

- **候选失败身份 ⊆ 基线失败身份**：候选没有任何基线不存在的失败身份（按 `FAIL` 行的文件 + 用例名逐条比较）。
- **基线独有的 5 个失败身份**，在候选全量运行中消失：
  1. `server/repos.test.ts` › matches canonical subdirectories and external Git worktrees without path-prefix false positives（本卡原有失败，候选聚焦运行通过；该用例创建真实 Git 仓库与外部 worktree 并检查 worktree 本身及其子目录）
  2. `server/service.test.ts` › existing workspace inside a child repo is eligible through common project root（本卡原有失败，候选聚焦运行通过）
  3. `server/service.test.ts` › new card cannot link workspace in secondary legacy repo or outside root（本卡原有失败，候选聚焦运行通过）
  4. `server/agent-service.test.ts` › wrong, missing, archived actors and missing/incompatible/archiving workspaces are rejected
  5. `server/auto-review.test.ts` › linked root: commands run only in the repositories this delivery changed, all of them when none did (§6.3)
- 第 4、5 项不属于本卡范围，且在两棵树上都**不稳定**：基线重跑两次（同样的两个文件），失败集合分别为 5 个与 4 个；候选重跑一次为 3 个。因此它们的消失不归因于本修复。
- **本卡原有 3 个失败已确认消失**（第 1–3 项）。
- 候选仍有 28 个测试失败（与基线共有），以及 `shared/i18n.test.ts` 文件级收集失败（见上）；这些均不在本卡范围内，本次未调查原因。

## 只读审查

- `server/repos.ts` `contains()`：改为 `startsWith(\`..${sep}\`)`，Windows 下 `relative()` 使用 `\` 分隔，判断正确；`..valid-child` 不再被误拒，`..` 与 `..\\sibling` 仍被拒。跨盘（`D:\`）与不同 UNC 服务器的 `relative()` 返回绝对路径，被 `isAbsolute` 拒绝。`repo-other` 这类同前缀兄弟目录返回 `..\\repo-other`，被拒绝。
- `repoMatcher` Git common-dir 分支：通过 `git rev-parse --git-common-dir` 比较，同仓库的外部 worktree 与其 root 得到同一 common-dir，可匹配；非 Git 路径返回 null，不会匹配。未验证 common-dir 相同但并非 root 所属工作树的极端情形（本次未设计专门用例）。
- `server/repos-platforms.test.ts` 用 mock `realpath` 与 `execFile` 覆盖 Windows/POSIX 的边界，并不替代真实 Git 测试（真实 Git 测试在 `repos.test.ts`）。
- legacy scope：通过的用例包括 `server/service.test.ts` 的 "legacy card retains saved two-directory context and workspace"，以及 `server/store.test.ts` 中的 legacy 迁移与 scope 保留用例。仅确认用例名与通过结果，未逐行审读断言内容。

## 未运行 / 未覆盖

- 已执行（不是未运行）：`repos.test.ts` 的真实 Git 仓库 + 外部 worktree + worktree 子目录检查（实现者已有测试，本次未新增）。
- 未验证（实机）：真实跨盘路径（如 `D:\`）与真实 UNC 共享（如 `\\server\share`）未在 Windows 实机上检查，`repos-platforms.test.ts` 与 `repos.test.ts` 中的跨盘/UNC 用例只用 `path.win32` 与 mock 的 `realpath` 验证字符串判断。
- 未运行：UI、安装、reload、手机端检查（卡片未要求）。
- 未对 common-dir 分支做"common-dir 相同但不属于 root 工作树"的极端情形测试。
- 基线全量与候选全量的失败原始输出保存在主检出 `docs/verification/windows-containment-candidate.log` 与 `windows-containment-baseline.log`（均被 `.gitignore` 的 `*.log` 忽略）。
- 28 个候选失败与 `shared/i18n.test.ts` 文件级失败未逐一分析原因。
- 未清理 worktree 与 junction（按要求保留，由协调方统一处理）。
