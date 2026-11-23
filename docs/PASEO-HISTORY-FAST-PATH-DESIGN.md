# Paseo 只读历史快路提案

状态：**设计提案，未实现，待决定实施范围**。2026-11-17；卡片 `1010127d-0664-4709-8617-1eadc7ce608b`。

## 1. 推荐方案与边界

由 **Paseo daemon 保存规范化的最近历史快照，提供独立、严格无 provider 启动的分页接口**。Flowly 继续用宿主 SDK，不直读 Codex 私有文件、不创建第二条连接、不补丁已安装 app.asar。

建议先做范围 A：命中现有内存或持久快照时快速打开；完整 provider 历史改为用户主动动作。范围 B 再解决“没有快照的旧会话第一次也快速打开”。若没有规范化快照，也没有受支持的离线读取器，就没有可直接返回的历史；不能用缓存命中速度承诺所有存量旧对话首次速度。

## 2. 已核查证据

实测慢请求 total 6802.2 ms，scope 2.3 ms、SDK timeline await 6799.9 ms，仅一页/11 条。见 [前轮证据](verification/transcript-retention.md)。没有细分 app-server 启动、读取和重放各自占比。

本机安装包 server 为 **0.16.0-beta.2**；本轮只读上游固定 HEAD **`0bac18f3593297c7ccbf24d8a831c7b8b557f27c`**，根包 0.16.0。Flowly 共享树当前依赖 0.16.0，不代表本机宿主也已升级。GitHub tree API 遇到限流，关键上游文件改用固定 SHA 的 raw URL 成功核查；未创建 checkout。

| 源码位置（安装包行号） | 事实及含义 |
| --- | --- |
| `server/session.js:6338`，`handleFetchAgentTimelineRequest` | 无条件先 `ensureAgentLoaded(... purpose: "history")`，再 fetchTimeline；减小 limit 不会跳过恢复。 |
| `agent/agent-loading.js:24` | 未加载时 resume provider，然后 hydrate 历史。 |
| `agent/providers/codex-app-server-agent.js:3109`，`readArchivedHistory` | 起临时 app-server、读线程/子线程历史，最后 dispose。 |
| `agent/providers/codex/thread-history.js` | 通过 app-server client 的 thread/read 或 thread/items/list 读历史；没有现成的离线 reader。 |
| `agent/agent-manager.js:362,365,3105,3165` | 内存 store 加可选 durableTimelineStore；接口有 fetchCommitted/getCommittedRows/bulkInsert。接口存在不代表实际启用。 |
| `server/bootstrap.js:696`；固定上游 `packages/server/src/server/bootstrap.ts` | 两者构造 AgentManager 都未注入 durable store；安装包 server 源码扫描未找到具体 durable 实现。因此当前正常构造路径没有已接通的持久历史服务。 |
| `InMemoryAgentTimelineStore.initialize` | 默认随机 epoch；内存与存盘序号空间不能直接混合。 |
| `AgentManager.initializeAgentTimelineForRegister/buildManagedAgentForRegister` | durable 有行可能令 historyPrimed=true。**有限窗口不能伪装成完整 durable store 注入**，否则更早历史可能不再 hydrate。 |
| client `index.js:334`；上游 `packages/client/src/index.ts` | refetch 返回 agent 时更新 handle；新 snapshot 结果不能伪造 loaded/live 状态。 |
| `session.js:727–775,1051` | timeline subscribe 登记观察者，用 getLoadedTimelineHead/getAgent 比较已有状态；所查路径不调用 ensureLoaded。重连后的历史补读仍须单独约束。 |

上游对应源码均在 `getpaseo/paseo`：`packages/server/src/server/`、`packages/client/src/index.ts`。持久接口类型在 `packages/server/src/server/agent/agent-timeline-store-types.ts:51`。公开 [SDK 文档](https://paseo.sh/docs/sdk/reference.md) 的 refetch 参数是 direction/cursor/limit/projection/wholeTurns/requestId，没有无启动保证；[插件契约](https://paseo.sh/docs/plugins/reference.md) 要求正常 Paseo 操作用共享 SDK。

## 3. 读与写分离

新 handler 先做现有认证、agent/provider 可见性和 workspace 授权，再读已存在的内存视图；没有则读 daemon 保存的快照；没有快照则立即返回 missing。关闭与读取竞争时返回快照或 missing，不恢复会话。

严格读取不调用 ensureAgentLoaded/resumeSession/streamHistory、provider availability 探测、session-open hook 或 spawn；不恢复工作区、不更新 attention/last activity、不标记 loaded。查询不创建/修复/补齐快照，不解析 provider 私有文件。损坏、超时、缺失、权限错误均不能偷偷转为旧路径。

快照写入只消费正常会话已经产生的规范化 timeline：coalesced 更新、turn 结束、关闭前 flush，以及已经完成的历史重放。每 agent 串行写、原子替换；失败保留上一份有效快照。不能每个 token 重写全部历史，也不为写快照额外起 provider。

范围 A 使用独立的有限快照存储，复用 TimelineProjection 与内容限制；不接通完整 durable store。初始预算建议每会话最近 1000 个 projected entries/最多 8 MiB、宿主合计 256 MiB，**待 fixture 测量决定，并非已批准常量**。淘汰只删快照缓存，不动 provider 原始历史、会话、工作区。不要先对原始行切页再分别投影，避免切坏 assistant/tool 合并项。

快照保存 agent/provider/持久线程身份指纹、schema/projection 版本、generation、seq 窗口、asOf 和覆盖信息，放 daemon 私有数据目录；客户端不能传文件路径。rewind/compaction/replacement 原子切换 generation；删除有 tombstone/代次防止晚到写入复活。归档保留快照，沿用归档读取权限。完整 durable 历史可另做，不与有限缓存混称。

## 4. 接口提案

新增 wire `agent.timeline.read_stored.request/response`，SDK `agent.timeline.readStored()`。不在旧 refetch 加可能被老宿主忽略的 noStart 参数；旧 refetch 语义保持原样。

```ts
readStored({ direction?: "tail" | "before" | "after", cursor?, limit? })
  -> { status: "hit", source: "memory" | "stored",
       identity: { agentId, workspaceId, provider },
       epoch, revision, entries, startCursor, endCursor,
       hasOlder, hasNewer, reset, staleCursor, gap,
       freshness: { asOf: string, current: "live" | "last-known" },
       coverage: { kind: "complete" | "window",
                   earlierHistory: "yes" | "no" | "unknown" } }
   | { status: "unavailable",
       reason: "missing" | "evicted" | "incompatible" | "corrupt" }
```

- limit 为正整数且有上限（建议 100），不接受 0=无限；Flowly 当前 turn 仍在一个插件 RPC 内分页、最多 300 条。A 不做 wholeTurns 无界扩页。
- 页与元信息来自一个原子视图；hasOlder/hasNewer 描述该视图内可读页面，coverage 描述视图外历史。hasOlder=false 不能代替“完整历史”。完整空会话返回 hit/空页，与 missing 区分。
- 存盘使用独立、持久的 generation/epoch；追加增长 revision，替换/截断更换 generation。来源切换或 epoch 变化返回 reset，清除旧窗口再读，不能跨内存/存盘直接 merge 序号。保持 sourceSeqRanges、turnId、collapsed 的投影身份。
- last-known 只说明截至 asOf 已保存的内容，不能证明 provider 外部没有变化。SDK 不用该结果更新 handle 的 loaded/live 状态。identity 从当前授权记录取得，不能信快照内旧 workspace；读取后身份/删除代次改变则拒绝返回。
- 认证、权限、未知会话、传输失败走正常错误通道。新 daemon 宣告 capability（暂名 storedTimelineRead），新 SDK 在内部检查；老 daemon 立即得到 typed unsupported，不把未知 RPC 超时当 missing。不要求 Flowly 读取未暴露的 server_info。仅方法存在不能证明 daemon 支持。
- 插件 subprocess IPC、远程 host、普通客户端必须传播新消息和结构化错误；SDK 正常连接复用，不新增私有连接。

Flowly 的 sessions.tail 加 source/freshness/coverage/unavailable，保留新鲜 scope 校验和瘦身分页。无启动模式下首次、after、Load earlier、重试和重连补读都用 readStored；polling 不能绕回 refetch。live 监听只消费已发生事件，来源/epoch 改变后重读。

missing、窗口外历史或 unsupported 时保留已有输出，提供明确的“按原路径加载历史”动作；只有用户选择该动作才允许普通 refetch 启动 provider。发送消息仍走正常新鲜授权/交互启动。**旧会话没有快照时会多一次显式选择，这是待决定的产品取舍**；若保留原自动加载模式，也不能声称该模式保证无启动。

## 5. 仓库和改动边界

| 仓库 / 包 | 范围 A |
| --- | --- |
| `getpaseo/paseo` → packages/server | 快照 store/写入队列、agent-manager 生命周期接点、bootstrap 注入独立快照服务；session handler、授权、来源选择、替换/删除与恢复测试。 |
| 同仓库 → packages/protocol | 新请求/结果 schema、source/freshness/coverage、capability；消息 union/dispatch/权限分类及校验。 |
| 同仓库 → packages/client | DaemonClient 关联请求、timeline.readStored、能力检查和 typed unsupported；不更新 loaded handle；relay/远程 host/重连测试。 |
| 同仓库 → packages/plugin 与 server 插件 IPC | 核查共享 SDK 的新消息是否可直接透传，必要时改桥接/导出/类型和文档；不另造插件私有历史协议。具体文件以实施 checkout 核查为准。 |
| `JasprW/flowly` | server/session-tail.ts、shared/session-tail.ts/rpc.ts、client/session-timeline.ts/session-transcript.tsx 的来源/状态/游标和显式旧路径动作；规范、i18n、onboarding 判断与测试。宿主 API 发布后才更新 SDK pin/兼容范围，不在本轮 bump Flowly。 |
| Paseo packages/app、packages/desktop | A 无须改原生聊天页；需随正常宿主构建分发新 daemon/SDK。原生页采用该接口另定范围。 |
| `openai/codex` | A 不需要修改。B 若依赖官方稳定离线协议才涉及其上游能力，不能视为当前已有。 |

最少是两个产品仓库：Paseo monorepo 先提供 API，Flowly 后消费。当前卡片可写范围只有 Flowly；本轮安装包和上游源码均只读。实施前另定 Paseo checkout、基线及可写范围，不能直接改安装目录。

## 6. 旧对话首次加载的范围 B

| 方案 | 首次无 provider 启动 | 取舍 |
| --- | --- | --- |
| A：用户主动首次完整加载后保存 | 尚无快照的旧会话不能；保存后可以 | 推荐第一阶段，通用、不耦合 Codex 私有格式；必须如实显示 missing。 |
| Paseo 新增 Codex 离线 importer | 支持相应存储版本时可以 | 要另查 JSONL/较新 paginated 存储、线程索引、子会话、attachments、tool lifecycle、迁移/rewind，并复用规范化 converter；只读源文件、未知格式返回 unavailable。当前未验证此 reader。 |
| Codex 官方稳定 offline history API | 取决于是否无需 app-server | 上游依赖，当前未确认提供。 |
| 后台批量启动 provider 预热 | 不能 | 搬移等待和资源成本，不符合无启动保证，不纳入推荐。 |

“所有存量旧对话第一次也快开”必须算 B 的额外目标。单改 Flowly 缓存、加 SDK 参数或接空的 durable 钩子均不能保证。

## 7. 后续实施验收（本轮未执行）

1. provider factory/resume/streamHistory/session-open/spawn 设置为一旦调用就失败的 spy；覆盖 unloaded/closed、daemon 重启、provider 不可用，以及 hit/missing/unsupported/错误。证明零调用、零 spawn、状态/attention 不变；subscribe/reconnect 也覆盖。
2. fixture 覆盖原子写失败/崩溃、损坏/旧版/淘汰、完整空页/局部窗口/长 turn、跨页投影、append/rewind/replacement、epoch 切换及 delete-vs-read/write；部分历史不得标完整，失败保留原始历史。
3. SDK/IPC 新旧版本矩阵、fresh task/workspace/agent scope、跨项目和已删除拒绝、归档读取；显式完整加载和发送保持原授权。断言 missing 后不会隐式 refetch。
4. 隔离 host 用同一 fixture 对比旧冷读与快照 hit，分开 daemon read、SDK 往返、插件瘦身与首屏，记录 p50/p95、条数/字节和预算。候选目标本机服务 p95 <100 ms、桌面首屏 p95 <300 ms，待实际测量接受；不以源码/假时钟宣布达成，miss 单独报。
5. 在批准的 checkout/同卡工作区和隔离基线上，由独立 full-access codex/gpt-6-luna 拥有证据；desktop/compact、错误、持久性及清理完整覆盖。手机收益另需真机测量。

## 8. 本轮交付和未做项

完成固定版本源码/构造路径/SDK 核查、两档范围、契约提案、仓库清单、数据完整性/兼容边界及验收设计。只读 Luna 意见和一次补查提示了不能以文件名推断接口缺失、不能以可选 store 推断已注入等风险；最终事实依据是上方主会话成功读取的源码，不把其未成功读取的路径当独立证明。

协作者原生 session `ee2e5c2f-8f83-4a88-bde8-06501ae42029` 在同一 workspace/full-access 创建，已按精确 ID 删除（deletedCount=1）。无其他 fixture/workspace/worktree；无日常 UI 操作。

未执行 host/SDK/Flowly 产品代码实现、旧 Codex 文件读取或 provider 实验、性能 A/B、完整测试、安装/重载、提交/推送。文档检查不等于速度验证；本轮无新产品文案、onboarding、采集或版本变化。
