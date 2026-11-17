# 分支整合与上游移植记录

候选：728570d95e6b375eb9bd746e8e147f06e2ea5ac9；基线：26f6fbdf2ec005a78f21f0519a2233c05c16554d；upstream/main：61511d7cc4666160fec168273c99b16c5ced5782。

## 分支盘点

以下引用均在候选的祖先图中；已交付功能取最新共享实现，历史 squash 分支仅保留历史归属，不回滚新契约。文件存在不是行为验收，行为证据另列。

| 引用 | 原提交 | 处置 |
| --- | --- | --- |
| refs/heads/feat/board-right-drag | c20b087a1d45 | TAPD/看板拖动，保留共享树最新实现 |
| refs/heads/feat/card-description-images | b4d00bb8adda | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/heads/feat/lazy-workspace | f6d7ef3a4afc | 保留首次会话创建工作区 |
| refs/heads/feat/session-context | 79752aa21a30 | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/heads/feat/session-controls | 4987342d6497 | 保留最新会话控件与Runtime兼容 |
| refs/heads/feat/tapd-inputs | 0195caf1388a | TAPD title-only / My to-dos最新实现 |
| refs/heads/fix/windows-regression-gate | 9c5399e54d45 | 保留main已合入的Windows修复 |
| refs/remotes/origin/chore/paseo-0.15-addhook | 5f1254f72acb | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/remotes/origin/chore/release-v1.7.0 | 07b1f75b67d2 | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/remotes/origin/chore/release-v1.7.1 | c12a6304ea69 | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/remotes/origin/chore/release-v1.7.2 | d846f1d807f6 | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/remotes/origin/ci/github-actions | dcff409fb28d | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/remotes/origin/docs/agents-pr-follow-through | 00e4721bc1d8 | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/remotes/origin/feat/auto-wrapup-new-installs | 3612c5565578 | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/remotes/origin/feat/azure-devops-connector | aa49444181aa | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/remotes/origin/feat/board-right-drag | c20b087a1d45 | TAPD/看板拖动，保留共享树最新实现 |
| refs/remotes/origin/feat/card-description-images | b4d00bb8adda | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/remotes/origin/feat/default-permission-mode | 7a005a355ffe | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/remotes/origin/feat/guardrails | 39f6af00fd90 | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/remotes/origin/feat/mobile-header | 78790330d7e9 | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/remotes/origin/feat/open-card-lane-reveal | 4830631e9c0a | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/remotes/origin/feat/running-dot-sweep | 91c92bdbed9f | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/remotes/origin/feat/search | 0ce2308378a7 | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/remotes/origin/feat/search-focus | d8fca8656e96 | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/remotes/origin/feat/search-highlight | edea580b932d | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/remotes/origin/feat/session-context | 79752aa21a30 | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/remotes/origin/feat/session-controls | 4987342d6497 | 保留最新会话控件与Runtime兼容 |
| refs/remotes/origin/feat/session-header-dot-sweep | 0da7f3eca225 | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/remotes/origin/feat/tapd-inputs | 0195caf1388a | TAPD title-only / My to-dos最新实现 |
| refs/remotes/origin/feat/telemetry | 51022a72cc20 | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/remotes/origin/feat/telemetry-errors | 6d507cd57571 | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/remotes/origin/feat/unwrap-in-place | ffd20111ce4a | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/remotes/origin/feat/whats-new | 910a153e1c89 | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/remotes/origin/fix/auto-review-linked-root | 254da1ec18dc | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/remotes/origin/fix/background-workspace | 88ad14018570 | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/remotes/origin/fix/queue-row-and-send-echo | d9909e7da2af | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/remotes/origin/fix/section-titles-one-line | da8e83d35f51 | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/remotes/origin/fix/telemetry-errors | 57821f7925ea | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/remotes/origin/fix/ui-ux-polish | be1cc9d469a4 | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/remotes/origin/fix/windows-regression-gate | 9c5399e54d45 | 保留main已合入的Windows修复 |
| refs/remotes/origin/kanban/summary-next-move-ideas-session-9c13bf | c27df512db68 | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/remotes/origin/off-main | 40b92a03de60 | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/remotes/origin/perf/running-dots-css | 9a6197313a44 | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/remotes/origin/perf/web-dot-sweep-css | f2d02183c5ea | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/remotes/origin/refactor/paseo16-background-agents | 84b20733c64a | 由上游最终0.16实现覆盖试验版本 |
| refs/remotes/origin/refactor/remove-progress-history | 8e5605e0a2ff | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/remotes/origin/refactor/simplify-ui | db7868ebfb2f | 已交付/历史分支，当前主线契约优先，原提交保留 |
| refs/remotes/origin/release | 40b92a03de60 | 已交付/历史分支，当前主线契约优先，原提交保留 |

## 上游21条提交

| 提交 | 内容 | 处置 |
| --- | --- | --- |
| d3144d0 | fix(markdown): keep intraword underscores in session and card Markdown (#101) | 手工移植；重叠处保留本地功能及Windows兼容 |
| 8ac89c6 | fix(telemetry): don't report project folder snapshot failures caused by the user's disk | 手工移植；重叠处保留本地功能及Windows兼容 |
| 75be261 | fix(insights): filter turn.after sessions before reading the turn timeline | 手工移植；重叠处保留本地功能及Windows兼容 |
| 6c9f018 | feat(connectors): support read-only Linear issue inputs (#102) | 手工移植；重叠处保留本地功能及Windows兼容 |
| 2f9539e | test: make git hermetic in the test suite (#98) | 手工移植；重叠处保留本地功能及Windows兼容 |
| dd76c73 | test: set hermetic git env in vitest.config.mjs so direct vitest runs are isolated too | 手工移植；重叠处保留本地功能及Windows兼容 |
| 2940426 | test: also exclude .worktrees from vitest so nested checkouts are not run | 手工移植；重叠处保留本地功能及Windows兼容 |
| 9cfa933 | test: wait for auto review before removing fixture dirs, retry rm on ENOTEMPTY | 手工移植；重叠处保留本地功能及Windows兼容 |
| 5aa17a7 | test: wait for memory reviews and hold the running digest instead of fixed sleeps | 手工移植；重叠处保留本地功能及Windows兼容 |
| 32e3314 | test: drop redundant fixed sleeps; wait for the run to start in the overlapping background-workspace test | 手工移植；重叠处保留本地功能及Windows兼容 |
| f0c2d9d | feat(auto-review): review the git worktree a delivery names (#105) | 手工移植；重叠处保留本地功能及Windows兼容 |
| 6108ecf | feat(auto-review): find the worktree from the delivered PR when none is named (#106) | 手工移植；重叠处保留本地功能及Windows兼容 |
| 2cc6a0e | feat(cards): images in card descriptions (#104) | 由本地descriptionImages等价提供；不引入第二套存储、5MB/8张限制或自动发送 |
| 5ea3f09 | fix(session): wrap markdown table cells within columns (#103) | 手工移植；重叠处保留本地功能及Windows兼容 |
| af9b69a | fix(auto-review): show waiting status before review starts (#108) | 手工移植；重叠处保留本地功能及Windows兼容 |
| 9c557d0 | feat(auto-review): choose review model reasoning effort (#110) | 手工移植；重叠处保留本地功能及Windows兼容 |
| 72c5a9e | feat(connectors): warn when a card's GitHub/GitLab item is from another project's repositories (#83) | 手工移植；重叠处保留本地功能及Windows兼容 |
| 9d3b75f | fix: compact agent tool outputs and chain write requests (#113) | 手工移植；重叠处保留本地功能及Windows兼容 |
| fb9e744 | refactor(paseo-0.16): temporary sessions as background agents; respect agent background work (#100) | 手工移植；重叠处保留本地功能及Windows兼容 |
| 7f66c31 | feat(composer): fill timeline next moves on mobile with Paseo SDK (#114) | 手工移植；重叠处保留本地功能及Windows兼容 |
| 61511d7 | feat: mirror card metadata and subscribe to board changes on Paseo 0.16 (#115) | 手工移植；重叠处保留本地功能及Windows兼容 |

## 验证

源码冻结于 `728570d95e6b375eb9bd746e8e147f06e2ea5ac9`；之后只整理文档与证据。

| 检查 | 命令 / 环境 | exit | 结果 |
| --- | --- | --- | --- |
| 实现者类型 | `npm run typecheck`，Windows | 0 | 通过 |
| 实现者聚焦 | 请求中完整23文件 `npx vitest run ... --reporter=json` | 0 | 348/348 |
| 实现者全量并发轮次 | `npm test -- --reporter=json`，与独立检查有重叠 | 1 | 1667通过 / 19失败 / 8跳过 |
| 实现者全量受控重跑 | `npm test -- --maxWorkers=1 --reporter=json`，无并发测试 | 0 | 1686通过 / 0失败 / 8跳过 |
| 实现者CI合约 | `npm run test:ci` | 0 | 4/4 |
| 独立Luna | 详见原文独立报告；同一源码提交、独立依赖/home | 0 | typecheck；focused348；full1686/0/8；test:ci4 |
| GitHub CI | Node22/24，精确728570d，run43984764985 | 0 | 类型、全量、test:ci均通过；Node24打包通过；Node24全量1687/0/7 |
| 独立Windows打包 | `npm run ci:package` | 1 | `spawnSync npm ENOENT`；helper与原main相同，未在本轮扩大修复 |

CI: https://github.com/FengLvv/flowly/actions/runs/43984764985

并发轮次大多为15秒超时，另有一项EPERM rename；停止并发后，同一SHA的全量重跑与独立全量均通过。这是两种条件下的实际结果，不把原失败记为通过，也不宣称已证明每项失败的底层原因。仅失败原始数据保存在 integration-20261117-failures.json。

实现过程中，首轮focused305/16失败来自合并残留（catalog复数、失效key、引导与Linear旧创建时机），修复后整套重跑。首轮full1683/3/8暴露两处Windows路径表示回归和POSIX mode断言。两处服务端实现已修复，路径/归属断言未放宽。Linear明确检查保存0次、首次ensure后1次；移除的是未采纳的替代card-images存储的测试，既有descriptionImages/图片安全测试保留。CLI的实际0600断言仍在POSIX运行；Windows的stat位不证明ACL隐私，CLI生产代码仍请求0600，测试额外确认常规文件，不宣称Windows ACL审计完成。

## 行为与文档边界

TAPD与Linear同时存在；Runtime、聊天控制与上下文、单根和首次会话创建workspace、无限量原图与显式描述复制均保留。上游SDK0.16后台agent/后台任务、元数据与推送、手机composer、审查worktree/PR解析和推理选项、Markdown/连接器修复均移植。descriptionImages现有存储与删除后保留备份字节的契约优先，上游替代目录及自动图片上下文不适用。README/指引/全部catalog已合并；无版本、What's new或新遥测字段。真实桌面/紧凑UI、手机、live原生资源与消息测试本轮未运行；历史上游/各卡片的截图和报告不作为本候选live通过证明。

## PR与审查

整合PR：https://github.com/FengLvv/flowly/pull/8 。#2代码早已进入主线，原PR仍堆叠在图片分支；#3/#4/#5的最新实现及各自提交都在整合候选中。为保留全部已盘点分支的祖先关系，本轮使用merge commit，未用squash抹去归属。最终GitHub状态与本地/远端SHA记录在卡片交付回执。

用户在知悉fork没有CodeRabbit检查、auto-merge关闭后，2026-11-17明确指令现在合并所有分支/PR。本次按该指令处理；CodeRabbit未运行，不代表通过。未变更仓库保护/自动合并设置，也未用--admin或force push。只写个人origin，未写upstream。

## 资源与隐私

共享目录通过私有index保存原始快照，整合在新worktree完成；同步前重新对照共享目录，拒绝覆盖后续改动。原始native-registry审计含其它日常资源身份/路径，保留本地并精确忽略，不上传。独立报告由Luna拥有，实现者未编辑其内容。

独立验收worktree及私有home的合并清理命令被自动审批以blocked by policy拒绝，无更具体原因；命令未执行，没有换工具/命令绕过。目录保留于 `.test-data/integration-20261117/verifier/`。没有该路径的残留测试Node进程；独立native会话已用官方 `paseo agent delete <exact-id>` 删除。父工作tree的收尾结果以最终回执为准；已有其它会话worktree、日常项目/workspace和数据不动。
