# Windows 测试原生资源隔离 — 2026-11-16

会话：`2278f331-f62c-4b18-b161-c8e5e00fe37d`；卡片：`b9490a95-ce3b-4072-87fb-0b763bddbcf2`。
验证对象：共享未提交工作树，HEAD `a45f4f50f4c3983c30657619c90158fbd3703c56`；包含其他卡片的并行修改，不能冒充精确提交验证。

输入：本卡要求、AGENTS.md、SINGLE-ROOT / PROJECT-PICKER / PROJECT-REMOVE / UI-REFRESH 规范、PROGRESS 对应记录；前卡本机 `session-parity.md` 及其 `test-runs/session-parity-tree.json` 历史结果（由其他卡片拥有，不随本提交发布）。本报告以下是首轮未提交工作树的历史证据；后续精确提交独立验收另记。

## 修改与保护边界

- 新 [隔离契约](../WINDOWS-TEST-ISOLATION-SPEC.md)。未修改 `server/paseo-cli.ts` 或产品行为。
- 两处原子进程 mock 的 Unix 路径判断和真实 CLI 回退被共同替身替换。识别裸命令、POSIX 路径、Windows `.cmd` / `.bat`、桌面 `Paseo.exe + runner + node-script + CLI entry` 及 npm `node + bin/paseo`。解析固定前缀，不在任意参数中搜索 `project`。未知程序/操作/runner、缺少或错误 home 直接失败；只有 Git 可运行实际子进程。保留原创建、删除、错误、CAS、目录/链接归属断言。
- `vitest.config.mjs` 统一 run/watch 默认排除规则，保留 Vitest 内置排除并新增 `.test-data/**`。每次运行 global setup 创建一个 `flowly-vitest-*` home，workers 通过 provide/inject 共用；setup 在产品模块导入前设置 `PASEO_HOME`、假 CLI、`NODE_ENV=test`、`FLOWLY_TELEMETRY=0`，清掉继承的 host/agent/workspace 及 Flowly data/link 覆盖。teardown 删除自己创建的 home。没有复制日常 pid 或凭据。
- 测试辅助目录不进入 npm 包。无 UI/onboarding 或新计数动作，无需 tour/tip 或 telemetry 字段变化；未变更版本、What's new、依赖，未安装/重载插件或重启 daemon。
- 第一次用 `.ts` 配置引入 Vite 的 DOM 全局类型，typecheck 失败；已改为 `.mjs`，最终 typecheck 恢复通过，没有修改产品类型或断言来掩盖该问题。

## 原生注册逐项核对

运行测试前先执行只读 [审计脚本](windows-test-registry-audit.mjs)：读取 native 项目创建元数据、全部 93 个 workspace（含归档及 background），并通过运行中的 Flowly `board.read` 查项目原生 ID、项目根、卡片 workspace/source/repo 引用。这些审计连接是显式只读访问日常 daemon，不属于隔离单元测试。

本机 `windows-test-registry-before.json` 记录于 `2026-11-16T13:03:06.343Z`；`windows-test-registry-after.json` 记录最终审计时间。原始快照含无关项目绑定，仅保留本机，不随代码提交。14 个候选均为 `C:\Users\vilolu\AppData\Local\Temp\ultra-linked-<suffix>\linked\<name>`：

| Native ID | suffix / name | createdAt (UTC, 2026-11-16) | 所有 workspace / board project / card 引用 | 决定 |
| --- | --- | --- | --- | --- |
| prj_398b171c0cb86bd4 | XkrkmR / Shop-Stack | 11:57:23.108 | 0 / 0 / 0 | 保留 |
| prj_32c75ee96238a35d | wkYFeB / Edit | 11:57:25.219 | 0 / 0 / 0 | 保留 |
| prj_cabb637b27b3be29 | lilIS2 / Shop-Stack | 11:59:08.143 | 0 / 0 / 0 | 保留 |
| prj_f64b83f2bd3bc5e7 | IgyxG5 / Shop-Stack | 11:59:08.266 | 0 / 0 / 0 | 保留 |
| prj_0804a3ff94749a2f | 2vxdcd / Shop-Stack | 11:59:08.316 | 0 / 0 / 0 | 保留 |
| prj_b6f3f537bc055c59 | ogHH1d / Edit | 11:59:09.982 | 0 / 0 / 0 | 保留 |
| prj_1a82c294b4a12f42 | e23uDk / Edit | 11:59:10.392 | 0 / 0 / 0 | 保留 |
| prj_ce1f82f3cd90326d | WmJhOF / Edit | 11:59:10.917 | 0 / 0 / 0 | 保留 |
| prj_28f8ccf706480c51 | xUGxG3 / Shop-Stack | 12:02:55.653 | 0 / 0 / 0 | 保留 |
| prj_783a3cc181e1643e | nnSV0p / Edit | 12:02:57.621 | 0 / 0 / 0 | 保留 |
| prj_4c1c1e78c2eea4a5 | CPzQeJ / Shop-Stack | 12:15:00.756 | 0 / 0 / 0 | 保留 |
| prj_819d1feee0d329b2 | k2U4oj / Edit | 12:15:20.097 | 0 / 0 / 0 | 保留 |
| prj_93bdc7ba5d5dd52d | cPzDgQ / Shop-Stack | 12:16:07.186 | 0 / 0 / 0 | 保留 |
| prj_fd12228435c6b401 | lnJaXi / Edit | 12:16:08.747 | 0 / 0 / 0 | 保留 |

上述临时根目录均已不存在，但这不是删除依据。标题、路径模式与 `linked-projects.test.ts` 一致，创建时间也接近前卡测试；已搜索前卡保存的 JSON/log，未找到精确 suffix 的逐项创建记录，前卡报告明确缺少运行前基线。因此不能证明这些 ID 的具体创建归属，本轮未删除任何 native 注册。没有为了“清干净”按名称或目录不存在批量删除。

三个受保护旧检出均存在且未修改或删除：`.test-data/description-action-push-check-79752aa`、`.test-data/session-context-pr-check`、`.test-data/tapd-mine-20261116/implementer`。

## 最终检查

| 命令 | exit | 结果 |
| --- | --- | --- |
| `npm run typecheck` | 0 | 通过 |
| `npm test -- server/linked-projects.test.ts server/project-remove-paseo.test.ts server/paseo-cli.test.ts server/testing --reporter=json --outputFile=docs/verification/windows-test-focused.json` | 0 | 28 passed / 0 failed / 0 skipped，五文件整组重跑 |
| `npm test -- --reporter=json --outputFile=docs/verification/windows-test-full.json` | 1 | 1488 passed / 31 failed / 8 skipped；166 文件，0 个 `.test-data` 文件；开始 13:08:14 UTC，约 116 秒 |
| `npm test -- server/ideas.test.ts server/memory.test.ts server/tool-server.test.ts server/auto-review.test.ts --maxWorkers=2 --reporter=json --outputFile=docs/verification/windows-test-failure-recheck.json` | 1 | 76 passed / 5 failed / 0 skipped；新增的三项超时及一次波动的 linked-root 断言在本组通过；未增大 timeout 或放宽断言 |
| `node docs/verification/windows-test-cli-isolation.mjs` | 0 | 真实已安装 CLI 在空 home 返回预期 exit 1、`DAEMON_NOT_RUNNING`；无 stdout、无 pid/credential、无 daemon 创建；临时 home finally 删除 |
| `npm pack --dry-run --json` | 0 | 包内无 `server/testing/` 或 Vitest 配置 |
| `node docs/verification/windows-test-registry-audit.mjs <before/after output>` | 0 | 前后 native 项目 ID、全部 workspace ID、Flowly project 绑定、14 项候选内容一致 |

首轮全量（在配置改为 ESM 前启动）：1491 passed / 28 failed / 8 skipped，exit 1。该轮不是最终代码的全量结果，不与后轮拼接为“全部通过”。通过项的临时 JSON 报告已清理；原始失败只保留在 [失败证据](windows-test-failures.json)，不重复保存每个命令的大型原始输出。

最终全量 31 个失败中，28 个名称在前卡历史共享树 `session-parity-tree.json` 的失败列表中出现；另三项为 ideas 的十条建议边界、memory 的拒绝集合及 tool-server 的 CLI 整组流程超时，均在上述四文件完整重跑中通过。其余涉及 Windows URL/分隔符、0600 权限、Unix socket、CRLF、只读权限模拟及并行 lazy-workspace 改动。隔离 home 改变了部分路径/上下文长度，但未降低其断言。完整失败名称和原始栈见失败证据。

## 证据边界与未运行

- 修复的 mock 与隔离回归 28/28 通过，旧 worktree 不再重复执行；真实 CLI 的空 home 拒绝和前后注册对照支持本轮测试没有使用日常原生资源。未进行系统级网络抓包，不能把注册不变单独当作零网络访问的证据。
- 本卡未创建 native project/workspace/session/card；自己创建的 Vitest/CLI 临时 home 已清理。未删除任何用户或归属不明目录。没有遗留测试子会话。
- 未运行独立 session 的冻结提交验证、Linux/macOS 执行、手机/桌面 UI。未提交或推送，未建 PR；没有将共享工作树的失败宣称为精确 HEAD 的基线结论。
- 本项目禁用了 In review lane，允许的 agent 阶段只有 Design / Development / Test；最终通过 result 回执交付并保持 Test，不擅自修改项目 lanes 或移到 Done。
