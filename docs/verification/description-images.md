# 描述图片验收 — 2026-11-12

实现提交：`96e82444700a0fb0746b8b978d4b8f6f76fe2bf3`。PR：
<https://github.com/FengLvv/flowly/pull/1>。本机已通过官方 CLI 改为本地
`flowly` 安装并重载，数据和设置保留，未重启 Paseo daemon。

## 检查结果

| 检查 | 退出码 | 结果 |
|---|---:|---|
| `npm run typecheck` | 0 | 通过 |
| 独立 Haiku 5.5 的 7 文件 focused suite | 0 | 127 通过、0 失败、0 跳过；[独立报告](description-images-independent.md) |
| `npm test`，Windows / Node 24 | 1 | 1334 通过、32 失败、7 跳过，2 个 Unix socket 未捕获错误 |
| 基线 `a597cc8`，临时 detached checkout | 1 | 1273 通过、36 失败、7 跳过，同类 2 个 socket 错误 |

当前树与基线相比没有新增失败身份。现有 Windows 失败包括路径分隔符、
POSIX 权限位、Unix socket 和测试 URL 路径；本轮修正了 i18n 测试的
`fileURLToPath`，使九种语言的完整目录检查实际运行。没有跳过或削弱其他断言。
完整失败日志保留在本机 `description-images-tests-final.log` 和
`description-images-baseline-tests.log`。独立验收 session 已归档，测试 worktree
及其临时 node_modules junction 已移除。

## 实际界面与消息验证

使用独立 Playwright/Chromium 实例连接本机 daemon，未操作用户的两个 Paseo
窗口。截图使用 `docs/promo/shot-lib.mjs` 的 `launch`、`shot`，排除了宿主侧栏
和其他项目标签。桌面 1700×1000；紧凑 web 750×900（卡片可见宽度 430）。

- **通过**：New task 在描述下选图，使用卡片描述，首条指令文字与图片均出现。
  从首条指令移除图片不影响原描述，重新取用可恢复。
  [桌面截图](description-images-live/desktop-description-copy.png)。
- **通过**：Create and start 通过实际 SDK 创建会话，Haiku 5.5 回答
  `Red (#FF0000)`。测试文字没有透露颜色。
- **通过**：插件重载后，读取到的描述图片字节与重载前完全一致。
- **通过**：Edit task 移除已保存图片、加入替代图并保存；描述与图片仍能读取。
- **通过**：New session 复制描述图文，新增附图合计达到 4 张；第 5 张显示
  `At most 4 images per message.`，没有静默超限。再次使用描述恢复到描述的 1 张图。
  [桌面截图](description-images-live/desktop-new-session-copy.png)。
- **通过**：切换到紧凑布局后重新打开表单并取用描述，Create session 成功；
  实际模型先后回答 `Red (#FF0000)`、`#FF0000 (red)`。
  对话框实测边界 x=115、y≈87.91、width=520、height≈724.19，完整位于 750×900
  视口内。共享截图器仍排除左侧 320 px，因此没有把裁切后的紧凑弹窗图片当作
  完整视觉验收证据。[紧凑卡片](description-images-live/compact-card-after.png)。

会话 ID、纯最终回复、参考图校验值与具体结果保存在
[results.json](description-images-live/results.json)，不附模型推理内容。
初期 harness 的重复定位器、异步等待和布局切换问题已修正后重跑；上述通过
结论只引用完成的具体场景。跨布局切换会关闭当前启动表单，因此紧凑场景重新
打开表单后验证，不声称保留了跨布局草稿。

## 未运行与保留项

- Android/iOS 实机：未运行；`adb devices -l` 没有连接设备。手机新增选图仍不在范围内。
- 整个 Paseo daemon 重启：未运行；插件进程重载和新 store 读取已验证。
- 跨目录项目快照恢复、历史图片与删除备份：由 focused tests 验证，未对用户数据做人工恢复。
- PR 还没有 CI/CodeRabbit 的运行记录或评审；fork 返回自动合并未启用。没有绕过这些约定合并。
- 测试项目、卡片、原生项目和实际测试会话已通过官方接口清理；测试目录
  `F:\Project\Paseo_plugins\Flowly\.test-data\description-images-live-ac0c619d-77a6-4346-8503-09d5fc5b309f`
  的递归删除被自动审批以 `blocked by policy` 拒绝。目录保留，没有通过其他方式绕过拒绝。
