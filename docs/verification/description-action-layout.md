# “使用卡片描述”位置修复 — 2026-11-12

输入：本卡描述“位置不对”和用户截图中的箭头。目标是将按钮移到指令框下方、添加图片操作行右侧。

变更：`ImageAttachments` 接受可选 trailing action；新建会话及新建卡片的启动表单共用该位置。保留既有图文快照、加载中禁用、错误处理和发送逻辑。操作行使用 React Native flex wrap，按钮靠右；没有新增字符串、依赖、版本或服务端行为。

## 通过

- `npm run typecheck`：exit 0；最后一次在局部缩进整理后运行。
- `npx vitest run client/session.test.ts shared/description-images.test.ts server/description-images.test.ts client/onboarding-logic.test.ts shared/i18n.test.ts --exclude '.test-data/**' --reporter=dot`：exit 0，5 文件 / 112 通过。前一次未排除旧 worktree，10 文件 / 224 通过，不能视为双倍覆盖。
- 布局 detector：无发现；`git diff --check`：exit 0。
- typecheck 后 reload `flowly`，安装路径仍为当前仓库，状态 running；未重启 daemon。
- 独立 headless Chromium 实际弹窗：1700px、750px 各通过 6 项，按钮在指令框下方、右边缘对齐、位于弹窗内、与图片控件不重叠，重复点击可替换自定义文字并复制描述图片。没有提交新会话或向 agent 发送消息。
- 仅使用 `docs/promo/shot-lib.mjs` 生成截图和页面文本，没有操作用户的两个 Paseo 窗口。[桌面截图](description-action-layout/desktop.png)已目视确认；[750px 操作区域](description-action-layout/compact-action.png)受该库排除左侧 320px 的隐私边界限制，不是完整弹窗截图，完整几何检查见 [results.json](description-action-layout/results.json)。
- fixture 卡片和项目已从插件移除，原生项目和工作区回读均已清理，fixture 目录最终删除。各轮资源 ID 保存在本目录的 JSON 中。

## 失败与未完成

- `npm test -- --reporter=dot`：exit 1，2733 通过 / 65 失败 / 33 跳过 / 4 errors。该命令额外收集了先前任务保留的 `.test-data/session-context-pr-check` worktree，计数受重复测试污染。
- `npm test -- --reporter=dot --exclude '.test-data/**'`：exit 1，1356 通过 / 29 失败 / 7 跳过，2 个 Windows Unix-socket errors。失败涉及 agent-service、artifacts、auto-review、error-report 等；本次没有修改其断言，也没有做基线精确比较，因此不宣称全部为既有失败。原始失败日志：`.test-data/description-action-project-tests.log`。
- 390px 实际检查未完成：响应式导航后未找到预期弹窗按钮，15 秒超时；不计为布局通过。最终 UI harness exit 1，12 项功能检查和 3 项清理检查通过。Android/iOS 实机、新建卡片启动表单实际 UI、深色主题及独立精确提交验收未运行。
- 早期 harness 的 Playwright/Chromium 发现、中文 selector 和一次外部页面导航超时已记录在 JSON 中，不作为产品通过证据；每轮创建的插件及原生 fixture 均清理。仅保留验证报告/截图及 git-ignored harness，不保留 fixture 项目。

## 交付边界

本次只修正入口位置，既有 onboarding tip 和 tour 的图文复制说明仍然准确，无新概念或值得再次弹出的时机，因此不新增引导或提示。没有新增开关或核心动作，沿用原 session 计数，无 telemetry 字段变更；测试进程使用 `NODE_ENV=test` / `FLOWLY_TELEMETRY=0`，未改用户 daemon 配置。

首次交付时变更尚未提交。保留工作区里其他任务对 repos、single-root spec 和进度记录的修改。本项目禁用 In review，使用 result 回执交付，卡片停留 Test。没有发现值得另提的后续功能建议。

## 提交与本地安装 — 2026-11-13

- 用户授权只提交本卡并安装。修复依赖当前 `feat/session-context` 分支里的描述图片功能，在该分支单独提交本卡改动；共享进度文件只暂存本卡段落，其他会话的修改保留。
- 提交前再次运行 `npm run typecheck`：exit 0；同一 focused 命令：exit 0，5 文件 / 112 通过。本轮未重复全量、UI 或独立验收，上一轮的失败及未完成项仍按上文记录。
- `paseo plugin install 'F:\Project\Paseo_plugins\Flowly' --id flowly`：exit 1，原因是同 ID 已配置在此目录；保留现有安装，通过 `paseo plugin reload flowly` 加载本地修复，回读状态为 running。没有新建其他插件 ID 或重启 daemon。
