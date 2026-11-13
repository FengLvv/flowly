# 图片数量与大小限制移除 — 2026-11-13

用户要求 Flowly 图片不限张数、不限尺寸；原始字节保持，宿主、模型、内存和传输约束仍可能报错。
范围：卡片描述、新卡片/新会话首条指令、会话预览发送和队列。移除 4 张与 5 MiB 校验及失败恢复截断；保留格式、非空 base64、描述图片签名、归属、字节数一致性和 SHA-256 校验。

## 实现者检查

- PASS：`npm run typecheck`，exit 0。
- PASS：`npx vitest run client/web-images.test.ts shared/description-images.test.ts server/description-images.test.ts server/composer.test.ts client/onboarding-logic.test.ts shared/i18n.test.ts --testTimeout=15000 --exclude 'docs/verification/**' --exclude '.claude/**' --exclude '.test-data/**' --exclude 'plugins/**'`，exit 0，6 文件 / 117 通过。
- FAILED：首次聚焦断言将带元数据的读取结果和仅含输入字段的对象比较而失败；改为逐项检查数量、顺序、名称、MIME、字节数和完整数据相等，未减弱内容校验，修正后重跑整套聚焦测试。首次还误收集了旧 checkout，341 项不算本次独立覆盖。
- FAILED：`npm test -- --exclude '.test-data/**' --exclude 'plugins/**' --reporter=json --outputFile=.git/image-limits-full.json`，exit 1，1360 通过 / 30 失败 / 7 跳过；2 个 Windows Unix-socket 未捕获错误。排除旧 checkout 和另一个会话的独立子插件，不修改其源码或测试。失败身份、准确提交与基线对比由独立报告记录；此处不声明全量通过。
- PASS：类型检查后 `paseo plugin reload flowly`，exit 0；官方 CLI 回读安装路径为本仓库，状态 running。未重启 daemon，running 不算 UI/模型验收。
- FAILED/继续中：第一次 UI harness 通过安装的 RPC 创建并保存 8 张图片（其中一张 >5 MiB）；截图器未发现 Windows npm 缓存中的 Playwright，尚未执行界面检查。插件项目/卡片及原生项目/工作区清理回读通过，目录第一次因 EBUSY 未能删除；后续检查见现场结果和最终补充。
- UNRUN：Android/iOS 实机、实际大图模型接收、无限量压力测试。不能承诺任意规模在外部服务成功。

## 引导与数据

更新 Description images 规格、会话图片规格、More features、README，以及新的 `image-limits` 一次提示和全部九种翻译；删除旧上限报错。无版本或 What's new 修改，无新增遥测字段、图片遥测或依赖。

## 交付

用户明确选择自己的仓库直接主线，不开 PR。主线的 Windows 修复与当前分支的已交付描述图片/会话上下文需保留；通过临时 Git index 构建提交，不切换或覆盖共享工作树。其他会话的未提交改动（含独立画布插件）不纳入本次提交。
独立验收报告、准确提交、现场检查与清理状态在本次完成后追加。

## 本机现场补充

- 初次与第二次截图器分别未找到 Playwright 和对应 Chromium；改为从本机 npm 缓存及浏览器缓存发现现有安装，传入 shot-lib 支持的环境变量，没有硬编码工具路径或新增依赖。前两次结果见 `image-limits-live/attempt-1.json`、`attempt-2.json`。
- 最终界面操作与清理回读：15 项通过，0 项功能失败。桌面 1700×1000、紧凑 web 750×1000：每轮完整复制 8 张描述图片，Add images 仍启用；一次文件选择追加 6 张（含 >5 MiB），总计 14 张，仍可继续添加；再次 Use card description 恢复完整 8 张。安装插件的 RPC 读取检查原始大图字节完全相等。没有提交任何会话或向模型发送消息。
- 截图通过 `docs/promo/shot-lib.mjs`，目视检查了桌面缩略图布局。750px 图被该库固定排除左侧 320px 的隐私裁切影响，仅作操作区域记录，不能充当完整弹窗视觉验收。未操作用户的两个 Paseo 窗口。
- 临时资源 ID 和检查结果见 `image-limits-live/results.json`，插件项目/卡片及原生项目/活动工作区均回读确认清理；3 次运行各自的资源均清理。第一次目录删除失败 EBUSY；最后明确核验绝对路径后用 PowerShell 删除同一个自建目录的请求被自动审批拒绝（`blocked by policy`，未提供更具体理由），没有用其他方法绕过。保留 `.test-data/image-limits-live-4c6242ed/fixture` 和测试 harness，绝不删除其他会话目录。
- 最终 harness 因目录清理问题 exit 1；15 项操作/注册表清理通过和磁盘目录保留分别记录，不将整次 harness 标为 exit 0。

## 准确提交与独立复核

- 用户指定直接提交自己的 `origin/main`，不走 PR。集成基线 `4465a2498ed0203dc29b6a02c3d9c5c82f620d57` 保留原主线 `812eb99` 与已交付功能分支 `79752aa` 的历史；唯一文本冲突是 PROGRESS，双方记录均保留，未提交的其他工作不带入。
- 实现提交 `000bc78f3e7dcdb01fb93914113258861b30bb1d`。独立会话 `c948d8d1-c094-4bea-befd-d05dce34929d` 在同一 Paseo workspace 中运行，创建参数为 `claude/claude-haiku-5-5`、`bypassPermissions`。准确提交通过 git archive 解出自有快照，而非新建 workspace 或 worktree；冻结单位为 commit，未创建文件哈希清单。
- 独立 PASS：候选 typecheck exit 0；聚焦 7 文件 / 123 项通过。
- 独立 FAILED：候选全量 exit 1，1361 通过 / 29 失败 / 7 pending；集成基线 exit 1，1355 通过 / 30 失败 / 7 pending。共有 29 个失败身份，无候选独有失败。基线独有一个 auto-review 失败未确认是否偶发。独立会话没有保存 Unix-socket 未捕获错误计数，不视为 0；实现者当前树记录有 2 个。
- 独立证据由测试员维护：[image-limits-independent.md](image-limits-independent.md)。测试员已删除自己创建的 snapshot、node_modules junction 和临时文件；父工作区依赖保留。报告曾错误写入父 session ID 并遗漏大图重载测试覆盖，已交回测试员自行核对修正，未修改实现或减弱测试。
- 在推送前 `git diff --check` 发现通过临时 stdin 写入的 PROGRESS 使用 CRLF；仅证据后续提交统一为 LF。实现源码保持独立验证的 `000bc78` 不变，不重复运行无变化的测试。最终 main 推送及本机分支回读在交付回执记录。
