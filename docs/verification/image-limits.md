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
