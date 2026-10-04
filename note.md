# NestJS 依赖注入：用 Token 让 Workflow 依赖 LLM 能力，而不是具体实现
具体模型厂商接口实现在llm里，workflow只关心用到llm能力，llm里面provider登记具体的类和token，workflow通过token取出容器里的模型实例，使用他的能力

# API first
接口是后端对外承诺的功能清单：用什么动作、访问哪个路径、带什么数据。
DTO 规定了前端提交数据的格式；Swagger 根据代码自动生成接口说明书，还能直接在页面上调试接口。
API First：先定义好接口这份约定，前后端就能同时开工，后端内部实现以后可以随时替换。
## swagger 是什么
Swagger 是一个根据你的代码自动生成的接口说明书，同时也是一个测试工具，就是你打开的 http://localhost:3000/docs 那个页面。

# Prisma 接入 Nest：数据流向要分三条线理解
Module 和 generate 都不在请求的数据路径上，不要把它们串成一条链。

## 开发时：改了 schema 才需要
schema.prisma 定义模型 → `prisma migrate dev` 修改数据库表结构 → `prisma generate` 生成 PrismaClient 代码（给后端用的api）。
`prisma.workflow.create()` 这些方法不是 Prisma 写死的，而是 generate 根据 `model Workflow` 自动生成的。改了 schema 就要重新 generate。

## 启动时：Module 负责装配
PrismaModule 登记并导出 PrismaService（@Global，全项目可用）；Nest 启动时自动把 PrismaService 注入到 WorkflowService 的构造函数里。

## 每次请求：真正的数据流向
```text
Swagger/浏览器 → WorkflowController（收请求）→ WorkflowService（业务逻辑）
→ PrismaService（就是 PrismaClient，把调用翻译成 SQL）→ PostgreSQL（执行 SQL、存数据）
```
结果按原路返回，最后变成 JSON。

# 列表分页与搜索
列表接口不能一次返回全部数据，要分页：GET /workflows?page=1&pageSize=10&keyword=xxx
- 分页：skip = (page - 1) * pageSize 跳过前面的，take = pageSize 取接下来的；必须配合 orderBy 固定排序。
- Query DTO：URL 参数都是字符串，@Type(() => Number) + transform: true 转成数字；@Max(100) 防止一次查太多。
- 搜索：contains 相当于 LIKE '%xx%'，mode: 'insensitive' 不区分大小写，OR 表示任一字段匹配即可。
- 并发：列表和总数互不依赖，用 Promise.all 同时查，总耗时取决于较慢的那个。
- 返回格式：{ items, pagination }，items 渲染表格，pagination 交给分页组件，接口设计要考虑前端好不好用。
- 原则：没有实际问题就不提前抽象（暂不做统一响应格式）。

# 服务器数据应该怎么被 React 管理？
TanStack Query 是一个专门管理"服务器数据"的前端库。
以前你用 useEffect 手写的那套"请求、存储、同步"逻辑，TanStack Query 已经帮你做好了，而且处理得更完整。
读取：useQuery（从服务器读数据，按 Query Key 存进缓存，并且会自动决定什么时候重新读）  修改：useMutation（调用你写的函数去改服务器上的数据）  同步缓存：invalidateQueries（告诉缓存"你已经过时了"，正在使用的数据会立刻重新读取）
Query Key 是一个数组，TanStack Query 会从左往右逐项比较。可以把它想成文件夹路径
Query Key 的层级设计：调用 invalidate 时，哪些会失效：invalidateQueries 默认按前缀匹配：只要缓存 key 的开头和你传入的 key 一样，就算匹配上。
```
点击 Create
   ↓
createMutation.mutate(input)     → isPending = true，按钮显示 Creating...
   ↓
POST /workflows                  → 数据库新增一条
   ↓
onSuccess
   ↓
invalidateQueries(['workflows']) → "workflows 这份副本过期了"
   ↓
useQuery 发现自己的数据过期 → 自动 GET /workflows
   ↓
缓存更新 → 组件重新渲染 → 新数据出现在列表里
```

# 状态放url还是useState?
useState 和 URL 都能存状态，区别是：useState 是这个组件自己的临时记忆，URL 是浏览器和用户都能看到、能保存、能分享的地址。id、页码和搜索词之所以放进 URL，不是因为技术上做不到用 useState，而是因为用户需要刷新不丢失、能分享、能后退。

# react-flow
画布是一份 JSON 的可视化编辑器。这份 JSON 里，position 是给前端画布用的，type 和 data 才是后端能执行的 DSL。保存时只挑出业务需要的字段，后端要做校验，数据格式也要带上版本号

## 自定义节点
nodeTypes 把 type 字符串映射到组件，是编辑器的扩展点（后端执行引擎同理按 type 选执行器）；Handle 用界面结构限制错误连线；所有画布操作最终都是修改 nodes/edges 数组；Canvas State（怎么跑）≠ （这次跑得怎样）。

## 画布持久
画布以 JSON 的形式整体存进 Workflow 的 canvas 字段，进入编辑器时用服务器上的画布初始化本地草稿，编辑只改草稿，点 Save 时去掉界面状态再写回数据库，并让缓存失效以保持一致

# canvas画布转graph图，进行后端的校验
后端不信任前端画布：执行前把画布 JSON 转成图，检查结构、检测环、排出执行顺序。这一步只生成"执行计划"，还不执行任何节点。
## 合法工作流的 10 条规则
1. 至少有一个节点
2. 节点 id 不能重复
3. 恰好一个 Start
4. 恰好一个 End
5. 边的 source / target 必须是存在的节点
6. Start 不能有入边
7. End 不能有出边
8. 不能有环（必须是 DAG 有向无环图）
9. 所有节点都能从 Start 走到（否则是孤立节点）
10. 所有节点最终都能走到 End（否则是死路节点）
前端的 Handle 已经限制了第 6、7 条，但前端限制只是体验，后端校验才是可信的边界。
## 如何转为graph图
WorkflowGraph 遍历一次节点、一次边，建出四样东西：
- nodeMap：id → 节点对象，按 id 查找
- 正向邻接表：每个节点的下游是谁（做完后通知谁）
- 反向邻接表：每个节点的上游是谁（把边倒过来存一份）
- 入度：每个节点还要等几个上游
## 三种检查各管什么
| 检查 | 用到的数据 | 发现什么问题 |
|---|---|---|
| 拓扑排序 | 入度 + 正向邻接表 + 队列 | 排出执行顺序；顺带发现环 |
| 正向可达 | 正向邻接表 + 栈 | 孤立节点（从 Start 走不到） |
| 反向可达 | 反向邻接表 + 栈 | 死路节点（走不到 End） |
### 拓扑排序（Kahn 算法）：排顺序 + 查环
入度为 0 的节点放进队列（"现在就能做的待办清单"）→ 取出一个放进结果 → 它的下游入度 -1 → 减到 0 的放进队列 → 直到队列为空。
排出来的数量 < 节点总数 → 有节点永远等不到 → 有环。环检测是拓扑排序的副产品，不需要单独的算法。
复杂度 O(V+E)：每个节点进出队列一次，每条边只处理一次。
### 双向可达：查孤立节点和死路节点
同一个函数：从起点出发 → 取出一个节点记为已访问 → 把它的邻居放进栈 → 直到栈为空 → 得到能碰到的所有节点。
- 正向：从 Start 出发，邻居 = 下游 → 不在结果里的就是孤立节点
- 反向：从 End 出发，邻居 = 上游（反向邻接表）→ 不在结果里的就是死路节点
例子：Start → End，Start → Dead。正向能走到 Dead（通过），反向从 End 只能回到 Start，走不到 Dead → 报 `Node Dead cannot reach end`。所以两个方向缺一不可。
visited 集合必不可少：避免重复处理，有环时也不会无限循环。

# execute 执行
上一课只生成执行计划（排出顺序），这一课按计划逐个运行节点，第一次真正跑通工作流：输入 { name } → Hello {{name}} → 输出结果。
## 2个概念
- **ExecutionContext**：一次运行的共享内存。variables 存工作流里能用的变量（开始时是用户输入，后续节点可以写入新变量）；nodeOutputs 存每个节点的原始返回值
- **NodeExecutor**：所有执行器都实现 execute(node, context)。引擎里用一个 Map 把 type 对应到执行器（start / template / end），不写一长串 if-else。以后新增节点类型 = 新建一个执行器 + 在 Map 里登记一行。和 LLM 的 Adapter 是同一种思路：按类型选择具体实现。
## 主流程：execute()
```text
POST /workflows/:id/run  { "input": { "name": "FlowMind" } }
→ buildExecutionPlan（校验 + 拓扑排序）
→ 先检查所有节点类型是否都有执行器（不支持就直接报错，一个节点都不执行）
→ new ExecutionContext(input)
→ 按顺序：找到执行器 → await execute(node, context) → 记录 nodeOutput
→ End 的返回值作为最终结果
→ 返回 { result, variables, nodeOutputs }
```
现在是串行执行：先保证结果正确，并行属于以后的性能优化
## 错误与边界
- 校验错误（运行前就能发现）：图结构不对、节点类型不支持 → WorkflowValidationError
- 执行错误（运行中才发生）：变量不存在、节点缺少配置 → WorkflowExecutionError
- 引擎只抛自己定义的错误，由 ExecutionService 统一转换成 HTTP 400；（HTTP 状态码里，4xx 表示"请求方的问题"，5xx 表示"服务器的问题"）
- 先检查节点类型再执行：以后接入 LLM，避免先花钱调用了模型，后面才报错

# LLM的调用
## 1.1 做了什么
接口定义（输入输出格式），适配器（把统一格式翻译成厂商 API（/chat/completions），再把厂商响应翻译回统一格式 ），llm.service业务入口，只依赖接口，不知到背后是哪家模型，llm.module决定接口背后接哪个模型实现
## 1.2 LlmExecutor 的四步
校验（model / prompt / outputVariable 必填）→ 渲染 prompt → 调用 LlmService → 结果写入 outputVariable，返回 { text, model, usage }

## 2.1 多Provider 配置与路由
上面调用模型在程序里写死(Adapter 自己写process.env.LLM_BASE_URL,它永远只能拿一套配置)。这次改动是需要用户自己选择模型，所以正确职责变成：ProviderRegistry负责“deepseek 对应什么配置？”Adapter负责：这套配置怎么发请求（Adapter 现在完全不知道前端调用什么模型，只负责按对应配置请求，如按 OpenAI-compatible 格式请求）
```当前 Provider 架构已经升级成
                LlmExecutor
                    │
                    ▼
                LlmService
                    │
            providerId = deepseek
                    │
                    ▼
             ProviderRegistry
                    │
            ┌───────┼────────┐
            ▼       ▼        ▼
        deepseek  openai   custom
            │       │        │
            └───────┼────────┘
                    ▼
        OpenAICompatibleProvider
                    │
                    ▼
             External API
目前所有 Provider 共用一个 Adapter,如果以后某个 Provider请求格式完全不同,如未来某种 Anthropic-style API，那么我们再出现AnthropicCompatibleProvider,Registry 的配置里可以进一步增加protocol:'openai'|'anthropic'
```
## 3.1 LLM Runtime 稳定性v1
```链路升级成
LlmExecutor
   ↓
LlmService
   ↓
ProviderRegistry
   ↓
OpenAICompatibleProvider
   ↓
Timeout
   ↓
统一 Provider Error
   ↓
External API

本节课让 LLM 调用更稳定，分两部分：非重试和重试错误检测
启动校验（Zod + ConfigModule）：检查本地env配置写得对不对，写错了直接启动失败； -> 主要检测输入格式，是否缺少配置，这部分错误是不需要请求重试的
Timeout：请求最多等 LLM_TIMEOUT_MS，超时就取消，不会一直卡住；
错误分类：fetch是不会捕获2xx，4xx错误的，只会捕获未返回响应的错误5xx.5xx错误先定义成网络错误，状态码类的错误（401、429、500）：fetch 正常返回,表示外部服务接不接受：Key 是否有效、有没有余额、是否被限流、服务是否在线
```

# HTTP 节点
本节课新增了 HTTP 节点，让工作流可以调用外部 API，并能和 LLM 串成“拿数据 → 理解 → 输出”的链路
同样做了错误检测，按照请求前校验配置，请求失败（超时或网络）、状态码非 2xx”三个阶段做错误检测，做了基础的安全边界（只允许 http 和 https），并明确 SSRF 防护要等到上线前再补

# IF节点
本节课新增了if节点，带有2条出边，画布节点和边定义要调整，运行逻辑也要调整
## 画布节点和边定义要调整
if节点需要根据计算结果，返回ture/false，统一成nextHandle字段，下一节点需要按照nextHandle选择路径。
## Engine 执行逻辑的变化
| | 以前 | 现在 |
|---|---|---|
| 怎么执行 | 先拓扑排序得到 `[start, if, pass, fail, end]`，再按顺序全部执行 | 从 Start 出发，执行完一个节点再决定下一个走哪 |
| 有 IF 时 | pass 和 fail 都执行，结果被后执行的覆盖（错误） | 只执行被选中的那条分支 |
| 拓扑排序的作用 | 决定执行顺序 | 只用来检测环，以及给 `/validate` 返回顺序 |

Scheduler 的循环：
```text
当前节点 = Start
循环：
  找执行器 → execute(node, context) → 返回 { output, nextHandle? }
  记录 nodeOutput
  是 End？→ 返回结果，结束
  选下一条边：
    有 nextHandle（IF）→ 在出边里找 sourceHandle === nextHandle 的那条
    没有（普通节点）  → 取唯一那条出边
  当前节点 = 边的 target
```
分工：执行器只负责"算"（IF 只告诉你走哪个出口），Scheduler 负责"走"（拿出口名去图里找边、找下一个节点）。执行器拿不到图，所以不可能返回"下游节点"。

## 图校验和运行时校验
图校验回答的是“这张图有没有画错”。
运行时校验回答的是“现在的引擎能力够不够跑它”。如：节点类型是否都有对应的执行器

## 当前架构：
```一次 /run 请求的代码调用链
POST /workflows/:id/run
        │
        ▼
ExecutionService.execute          ← 调用 Engine，出错时翻译错误，也就是错误分类（图校验和各节点的校验负责发现错误并抛出）
        │
        ▼
WorkflowEngine.execute              图校验 → 运行时校验 → 创建 Context → 交给 Scheduler
  ├─ ① validateCanvas              【图校验】
  │     ├─ new WorkflowGraph        建索引，检查重复 id 和悬空边
  │     ├─ validateBasicStructure   1 个 Start、1 个 End
  │     ├─ topologicalSort          检测有没有环
  │     └─ validateReachability     从 Start 可达、能到 End
  ├─ ② 节点类型是否都支持            【运行时校验】
  ├─ ③ validateRuntimeGraph         普通节点 1 条出边，IF 有 true / false 两条
  ├─ ④ new ExecutionContext(input)
  └─ ⑤ WorkflowScheduler.run
          循环：
            executor.execute(node)  → { output, nextHandle? }
            context.setNodeOutput
            是 End？→ 返回结果
            selectEdge(nextHandle)  → edge.target → 下一个节点
```

# Variable System v2
之前已经把变量存入共享内存里了，但是取的时候只支持按response取出整个对象，本节课完善了对象引用。
对象引用 = 在共享内存里找到顶层对象，再一层层取属性。字符串转换 = 只有要把结果嵌进文字时才做。不是“对象一直在 JSON 字符串里转圈”。