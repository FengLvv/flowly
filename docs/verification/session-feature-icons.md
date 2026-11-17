# Speed / Plan 独立图标 — 2026-11-16

- 用户反馈：Speed 和 Plan 要像原生对话一样各有独立图标。规范先更新于 `docs/SESSION-PARITY-SPEC.md`；本轮只改前端呈现，既有会话配置 RPC、授权、数据结构和模型列表均不变。
- 使用会话实际提供的 `icon`（Codex 为 `zap`、`list-todo`），转换为宿主 Lucide 名称；未知/缺失时用通用图标。Speed 图标打开独立选择菜单；Plan 直接切换并以真实状态高亮，包含名称、状态及辅助说明。功能不再列在模型菜单，也不再追加到模型名称。紧凑布局同样保留独立图标和内联菜单；桌面功能菜单按触发器右边对齐。
- 安装的 web renderer 不会从 `accessibilityState.checked` 生成 `aria-checked`，因此按项目 `AcceptanceRow` 的既有方式补上 React Native 的 `aria-checked` 别名。没有通过弱化断言将检查改为通过。

## 通过

- 生产代码提交：`c170d8c86a54d59a95eed16051cea5bbddb2c00c`（前置 UI 提交 `9436db4`）。主会话执行，未委派新的独立会话：这是前一阶段后的局部 UI 调整，不新增 RPC/schema，也不重复阶段级独立测试。
- 共享工作区 `npm run typecheck`：exit 0；七文件相关回归（排除其他旧 `.test-data` 检出）：exit 0，156 passed / 0 failed。
- 精确提交自己的 detached 检出：`npm ci --ignore-scripts --no-audit --no-fund --legacy-peer-deps` exit 0；`npm run typecheck` exit 0；`npm test -- server/session-settings.test.ts client/onboarding-logic.test.ts shared/i18n.test.ts client/session.test.ts client/session-input.test.ts client/session-chips.test.ts client/focus-ring.test.ts --reporter=json` exit 0，**151 passed / 0 failed**（七文件）。环境 `NODE_ENV=test`、`FLOWLY_TELEMETRY=0`、隔离 `PASEO_HOME`。与共享树计数不同，因为该提交不包含其他卡片的新引导测试。[JSON](session-feature-icons/exact-focused.json)。
- `node docs/verification/session-feature-icons-live.mjs` exit 0，**24/24**：实际 Codex 模型和功能 RPC、模型菜单排除功能项、两个独立无文本图标、Speed 菜单原生状态回读与边界、Plan 切换/checked/模型标签、桌面和 750px 紧凑布局两个图标的真实操作、空闲重载、插件重载保持、零 page errors。[结果](session-feature-icons/results.json)、[桌面](session-feature-icons/desktop-feature-icons.png)、[紧凑](session-feature-icons/compact-feature-icons.png)。截图通过 `docs/promo/shot-lib.mjs`，仅留本机，不上传日常看板图片。
- 测试会话 `5a2b7ff2-e759-48bd-a402-7d6fd4bb9c9d` 未发送模型消息。最终确认会话已删除、原卡片/workspace 保留、浏览器已关闭；早期失败尝试也执行了 finally 清理。
- 自有精确提交检出 `.test-data/session-feature-icons-check` 已删除并核对 worktree registry；先确认了绝对路径、预期 SHA 和真实 node_modules，无共享依赖 junction。临时空 home 和私有 index 已清理。主工作区 HEAD/共享 index 和其他会话修改未动。
- flowly 已按类型检查后的源码重载，flowly / infinite-canvas 均 enabled/running；未重启 daemon、未重载画布、未操作用户的原生窗口。

## 失败尝试与未运行

- 首次测试仍用旧的模型菜单定位；修正为独立图标。随后 checked 断言暴露宿主 web 的状态转发问题，修复后按同一套检查完整重跑。一次新浏览器连接尚未就绪导致导航超时；增加等待已连接的 Flowly sidebar 入口后完整重跑通过。
- 本轮未重跑全量或独立 Haiku。上一阶段隔离全量的 28 项既有失败没有被修复，也不宣称本轮全量通过。Android/iOS 真机未运行。
- 现有 Session controls 导览与一次性提示仍准确描述输入框下方控件，能力与入口区域未变，不再增加提示或重复文案；无新翻译键、遥测、版本或 What's new 变更。
- 延续 [PR #5](https://github.com/FengLvv/flowly/pull/5)，不另开 PR。CI/CodeRabbit 仍待仓库侧审查配置，未自动合并。
