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

# loop节点 v1
只需要记住三句话：
## 1.Loop 是受控的环：只有回到 Loop 底部 loop 入口的边才合法，其他环照样禁止。
只有回到 Loop 的环才是“受控”的，其他环照样禁止
## 2.状态跟着一次运行走：处理到第几个记在 Context 里，不记在执行器上。
所以 Context 现在有三个“抽屉”：
variables  工作流里的变量
nodeOutputs  每个节点的输出
nodeStates（新增）  节点自己的临时记忆（Loop 处理到第几个）
## 3.Loop 自己不循环：它每次只判断走 body 还是 done，真正的“绕回去”是 Scheduler 顺着回边走出来的。
节点返回一个出口名（nextHandle），Scheduler 就去找从这个出口出去的那条边

# Code 节点 v1（暂无docekr沙箱）
code节点执行架构和llm类似，code执行器不关心代码具体如何run，只关心输入是什么，以及调用代码执行的能力（llmExecutor->llmService->provider）
## 一次执行的完整时序 
```Scheduler 走到 code 节点
 → CodeExecutor 校验配置， 得到 input
 → CodeRunnerService.run()：new Worker(复制 code + input，env 为空，限内存)，启动外层计时器
   → Worker：createContext({ input }) → 包成 async 函数 → runInContext(内层超时)
   → postMessage({ ok, output })
 → Service 收到message（正常返回/代码报错） / error（崩溃/内存超限 / 退出 / 超时（先到先得）→ terminate
 → CodeExecutor：setVariable(outputVariable, output)，返回 { output }（没有 nextHandle）
 → Scheduler 走唯一的出边到下一个节点
```
### 如何对照说：
问题：Node 是单线程的。NestJS 处理所有请求都靠一个主线程加事件循环。如果在主线程里直接跑用户的 while (true) {}，整个 API 卡死，其他用户的请求全部没有响应； setTimeout 写的超时都触发不了，因为定时器回调也要等主线程空闲才能执行
worker线程：在同一个进程里再开一个线程，和主线程只能通过消息通信（复制数据），不共享变量；主线程可以随时 worker.terminate() 强制杀掉它

## work核心概念（隔离、超时、内存限制、跨线程通信）
一句话：用户代码不可信，Worker 把它关进另一个线程，管住时间、内存和数据进出

# 工作流执行和校验重构
## 问题：随着执行器增加，workEngine里constructor的执行器实例 越来越长，Validation 越来越散、越来越难维护
## 本节课是把执行器查找和执行器校验从Scheduler和Engine里抽象抽象出来,ExecutorRegistry,WorkflowValidator（两个模块已经分别拥有了清晰、独立且不断增长的职责）
```WorkflowEngine 职责不变
   ① new WorkflowGraph(canvas)    建索引，同时检查输入完整性
   ② validator.validate(graph)    所有可以静态检查的工作流配置问题都会在执行前暴露：之前是在执行时判断是否存在该节点的执行器，现在提前到执行前的校验了
   ③ new ExecutionContext(input)
   ④ scheduler.run(...)           不关心有哪些 Executor
      循环：registry.get(node.type) → executor.execute(node, context)
         → 存 output → 按 nextHandle 选边 → 下一个节点
```

# Sprint 7 一次 Workflow Execution 应该如何被持久化
问题： 目前工作流能跑，但是不能持久化，需要回答，这次 Run 到底发生了什么？执行到哪个节点？哪个节点失败？一共跑了多久？最终输入输出是什么？等
## 核心变化：post run 不再只是"调用一个函数",而是在系统里产生一个真正的执行实例（一次生命周期）
理解run和workflow是什么关系：workflow描述怎么执行，run表示这张workflow某一次具体执行，所以每次run都是独立版本，workflow:run=1:n
```数据关系：谁归谁
Workflow（工作流定义）
  └─ WorkflowRun（一次完整执行）整次工作流运行的状态、输入、最终输出、总错误。
       └─ NodeRun（一次节点执行事件）某个节点某一次真实执行的顺序、输出、状态、错误。

Workflow 1 : N WorkflowRun
WorkflowRun 1 : N NodeRun
```
### 持久化实现
Prisma 设计RunStatus，NodeRunStatus,WorkflowRun ,NodeRun （都是为了回答问题，落库保存，可持久化）
```当前架构【真正的执行过程】
POST /workflows/:id/run
          │
          ▼
WorkflowController
          │
          ▼
WorkflowService
  └─ 查 Workflow、拿 canvas
          │
          ▼
ExecutionService
  ├─ create WorkflowRun
  ├─ mark WorkflowRun RUNNING
  └─ Engine.execute(canvas, input, workflowRunId)
       └─ Scheduler 循环：
            当前 Node
              ├─ 创建 NodeRun RUNNING
              ├─ Registry 找到对应 Executor
              ├─ Executor.execute(Node, Context)
              ├─ NodeRun 更新为 SUCCESS / FAILED      
              └─ Scheduler 选择下一个 Node
  └─ WorkflowRun → SUCCESS / FAILED
```
### 三层不要混在一起
WorkflowRunService（ NodeRunService同理，但是对象是单次节点执行记录）
= 怎么把 WorkflowRun 存进数据库

WorkflowEngine
= 怎么解释并运行工作流图

ExecutionService
= 怎么把“数据库中的一次 Run”与“Engine 的一次执行”串成完整生命周期

# API 和执行进程分离的异步
按“问题 → 方案 → 关键设计 → 结果”讲
## API阶段：Redis + BullMQ：把 Run 放进真正的执行队列
问题： 当前同步状态下，长任务会阻止run接口返回状态。方案：需要redis异步执行run，马上提交执行状态。将提交run和执行run分开
PostgreSQL 和 Redis 分工： PostgreSQL：WorkflowRun / NodeRun，业务真相。Redis + BullMQ：等待执行的 Job。
### 架构重构：execute()，从API 同步执行工作流”变成了“API 提交任务，队列等待 Worker 执行”。
```createRun()提交任务
创建 Run
↓
加入 Queue
↓
返回状态:PENDING
```
```Worker（消费者） 拿到 Job , 状态：RUNNING（下一节课，暂未实现worker）
runId
↓
PostgreSQL
↓
查询 WorkflowRun + Workflow
↓
执行
```
ExecutionService 也确实重构了。它从“执行工作流的人”变成了“提交工作流任务的人”。真正的执行工作以后会移动到Worker

## Worker阶段：独立 Worker App + BullMQ Consumer + Workflow Engine 共享
上一节课已经把任务放进队列，这节课将任务从队列取出来，执行
### 最终架构
```
                    React
                      │
                      ▼
                ┌──────────┐
                │   API    │
                └────┬─────┘
                     │
           create WorkflowRun
                     │
                     ▼
                PostgreSQL
                 PENDING
                     │
                     ▼
                  BullMQ
                   Redis
                     │
                     ▼
              ┌────────────┐
              │   Worker   │
              └─────┬──────┘
                    │
              mark RUNNING
                    │
                    ▼
             WorkflowEngine
                    │
          ┌─────────┼─────────┐
          ▼         ▼         ▼
        HTTP       LLM       Code
          │         │         │
          └─────────┼─────────┘
                    ▼
               NodeRun[]
                    │
                    ▼
          SUCCESS / FAILED
```
结果：以后即使浏览器：刷新，断网，关闭，Worker还是能继续运行。这说明的是：工作流的生命周期，已经和浏览器页面、HTTP 请求的生命周期解耦了。浏览器只是“提交者”，不是“执行者”。Worker 以后就是一个持续运行的后台进程。
开发时可能是2个终端：A:API 进程,B：Worker 进程；生产时更常见是两个 Docker 容器：
   Container: api
   Container: worker
   Container: redis
   Container: postgres
### Worker 实现后，WorkflowRun 和 NodeRun 的“写入责任”也分开了
WorkflowRun、NodeRun 都还是 PostgreSQL 里的记录；真正分离的是“谁在什么时机写它们”。
WorkflowRun的生命周期被拆成 API 和 Worker 两段，NodeRun 更彻底地迁移到 Worker 了
### Workflow Engine 共享
问题：引擎原来在 apps/api 里，并且 import 了 API 的 LlmService、ExecutionTracker（→ Prisma）、Nest 装饰器，没法给 Worker 用。
解决：把引擎抽成纯 TS 包（packages/workflow-core）。引擎需要、但依赖密钥 / 框架 / 数据库 / 进程资源的能力（LLM、代码执行、执行记录），用接口声明，由 Worker 实现后注入；HTTP 节点直接用 fetch，不抽接口。
结果：API（校验）和 Worker（执行）共用同一份引擎；引擎不依赖 Worker 也能独立编译和测试
#### 目录结构
```
packages/
  workflow-core/              ← 引擎：纯 TS，不认识 Nest / Prisma / BullMQ
    src/
      engine/                 Graph / Validator / Scheduler / Registry / Engine / Context / 错误类
      executors/              9 个节点执行器
      ports/                  引擎对外部的“需求清单”（只有接口）
        llm-client.ts
        code-runner.ts
        execution-observer.ts
      create-workflow-engine.ts   组装工厂
      index.ts                    对外公开的 API（唯一入口）
  shared/                     ← API 和 worker 之间的“约定”：队列名、Job 数据结构、错误归一化
apps/
  api/      生产者：建 run、入队、校验画布、查询结果
  worker/   消费者：实现 ports，组装 engine，消费队列
```

## 关键设计：
- 重复投递：BullMQ 保证“至少投递一次”，同一个 job 可能被处理多次
  - 先后重复：手动重试、worker 崩溃后重新投递 → sql先查后改也能挡住
  - 并发重复：锁过期被判定卡住，第一次还没跑完（本次指的是没更新状态前的阶段）又被取走 → sql先查后改挡不住（两次都读到 PENDING）
- 防护：并发 UPDATE 由行锁排队.更直接的说法是：同一行数据，同一时刻只允许一条 UPDATE 去改它；后来的那条必须等前一条改完，然后按改完之后的数据重新判断要不要改.

- 两层校验：API 提交时校验（结构错误直接返回 400，不创建 run）+ worker 执行时再校验（画布可能在入队后被修改）。

# 前端工作流轮询和历史ui展示
前端用轮询把异步执行的结果“拉”回来：创建运行后每秒查一次详情，到了终态就停止并刷新历史；历史只返回摘要，点进去再查完整的节点执行记录；页面刷新后能接着跟踪未完成的运行。
## 链路：
```
点击 Run
  ↓
POST /workflows/:workflowId/run
  ↓
后端：创建 WorkflowRun(PENDING) + 投递 BullMQ Job
  ↓
立即返回 202 + runId
  ↓
前端 setActiveRunId(runId)
  ↓
轮询 GET /runs/:runId     ← Detail
  ↓
PENDING → RUNNING → SUCCESS / FAILED
  ↓
停止轮询
  ↓
刷新 GET /workflows/:workflowId/runs（新加接口）   ← History
```
## 实现细节
1.什么时候停止轮询：运行到了终态（成功、失败、已取消）就返回 false，不再请求；否则会一直空转。 !!!
2.运行历史不轮询：只在两个时机刷新，一是刚启动一次运行时，二是当前运行变成终态时。轮询的只有单个 run 的详情。
3.刷新页面后接着跟踪：activeRunId 只存在 React 状态里，刷新就没了。现在会从运行历史里找最新的未完成运行继续轮询，所以 worker 慢、或者中途刷新页面，都不会丢失进度。!!!
4.两个 id 分开管理：activeRunId 是“正在跟踪的运行”，selectedRunId 是“历史里点开查看的运行”。看历史记录不会打断对当前运行的跟踪。
5.启动前的拦截：画布有未保存的修改时不能运行，因为 worker 执行的是数据库里保存的画布，不是你屏幕上看到的那份。
6.两种失败要分开显示：
   运行本身失败（状态是 FAILED）是业务结果，显示红色错误框和失败节点。
   轮询请求失败（网络或 API 出错）只是“暂时没拿到最新状态”，显示黄色提示，并且会自动重试。
7.执行记录和画布联动：点击某条节点执行记录，会在画布上选中对应节点，方便定位出错的节点。
## 暂未实现：一个更大的已知问题：异步 Run 的 Canvas 一致性
```
Run PENDING
↓
你再次编辑并 Save
↓
Worker 才消费旧 Run
```

# workflow retry and recovery safeguards（不知道怎么翻译）
一句话：工作流跑在异步 worker 里，失败分三类：节点临时出错、worker 崩溃、整个 run 失败。我的做法是只在节点级别、对安全的节点自动重试；worker 崩溃靠心跳和恢复扫描把卡住的 run 收尾成失败，不盲目重跑；整个 run 重来就创建新的 run。底层用 jobId 加数据库条件更新保证“一个 run 最多执行一次”。
## 把“重试”拆成三件不同的事
节点重试：只重试安全的（幂等）、临时的错误
   重试的实现位置：重试放在 Scheduler 的 executeNodeWithRetry 里，不写进每个执行器，避免重复代码
   不破坏 Context：成功之后才写：Scheduler 也只在成功后记录节点输出。所以失败的尝试不会改动 Context，重试时看到的是干净的状态。
基础设施恢复：
   1. RUNNING 卡死：worker 执行中途死了
      --心跳：worker 执行期间每 10 秒更新 heartbeatAt
      --判断：超过 60 秒没更新，就认为 worker 已经失联。
      --重启恢复扫描：启动时扫一次，之后每 60 秒扫一次（需要定时检查，保证最多一个扫描周期之后一定能发现）
   2. PENDING 卡死：数据库有记录，队列里没 Job
      --API 先插入 run（PENDING），再放进队列。如果在两步之间崩溃，就会留下 PENDING 孤儿，这是典型的双写问题。
      --判断条件是：超过 5 分钟，而且 BullMQ 里没有还活着的 Job。满足就标成失败
      ### 为什么不反过来，先入队再建 run？
      因为 Worker 可能比数据库插入更快拿到 Job，到数据库里查不到这条 run，问题反而更难处理。
      --混了两个不同的"等待，Job 状态 waiting（Redis（BullMQ）），run 状态 PENDING（PostgreSQL），Worker 不去数据库找 PENDING 的 run，它只盯着 Redis 队列，队列里一出现 Job 就马上取走。
      
手动重跑：整个 run 失败了，用户想重来，创建一条新的 run
## 总流程
```
worker 取到 Job
（首次：从 waiting 正常取出；重复：BullyMQ锁过期,worker没续锁，重新投递）
        │
        ▼
查 run 状态 ── 已结束 ────────────────▶ 跳过            ← 只有重复投递会遇到
        │
        ├── RUNNING ── 心跳新鲜 ──────▶ 跳过            ← 只有重复投递会遇到
        │          └── 心跳过期 ──────▶ 失败：WORKER_INTERRUPTED
        │
        └── PENDING ── 条件领取 ── count=0 ─▶ 跳过      ← 首次投递的正常入口  
                         │ count=1
                         ▼
                 RUNNING + 开始心跳
                         │
                 Scheduler 逐个执行节点
                         │
                  节点出错？── 允许重试且错误可重试且未满 3 次 ──▶ 退避后重试同一节点
                         │ 否
                         ▼
         SUCCESS / FAILED（仅当状态还是 RUNNING 才写入）
	
        时机                                          防的是什么
状态还是 PENDING 才改成 RUNNING                 两个 worker 同时领取同一条运行
状态还是 RUNNING 才改成 SUCCESS 或 FAILED       假死的 worker 和恢复扫描同时去结束同一条运行
***假死的 worker 和恢复扫描同时去结束同一条运行
心跳过期，只能说明“60 秒没收到它的消息”，不能证明它真的死了。它可能正在等一个很慢的 LLM 调用，而写心跳的那条 SQL 一直超时，但是可能因为扫描到心跳超时，数据库被写入失败。这时 worker 进程其实还活着，工作流也还在执行。等网络恢复，它把剩下的节点跑完，然后照常调用 markSuccess，想把结果写成 SUCCESS
***
worker 不区分这是第几次投递，每次都先看数据库状态再决定做什么，所以重复投递天然无害
```

# 对API 和执行进程分离的异步 和 重试机制的 模糊点的笔记
行锁让同一行的 UPDATE 排队；WHERE 条件决定后到的那个能不能改；count 告诉我自己有没有改成（count=0就代表本worker的sql没执行，被其他worker抢占执行了）。心跳过期不代表 worker 死了：恢复扫描先写入 FAILED 后，假死的 worker 写结果会得到 count = 0，结果被丢弃，但它的节点还会继续跑，却不能写入成功了。后续改进。

# 给工作流执行加“可观测性”和更完整的运行界面
本节新增 ExecutionLog，NodeRun：核心执行记录，写失败就让运行失败，因为追踪和重试判断依赖它。，ExecutionLog 回答“执行过程中按时间发生了什么”,给用户看的过程日志，写失败只警告，不影响执行。这就是“写日志失败不等于执行失败”。
能说清楚哪些写入是关键路径、哪些是尽力而为，比会建一张日志表重要得多。
```
ExecutionLog：
10:00:01  节点开始执行
10:00:02  节点执行失败，500ms 后重试
10:00:02.5 节点开始执行
10:00:03  节点执行成功
```

# WorkflowVersion
把“草稿”和“版本”在数据模型上分开，Run 绑定 Version
## 问题：
1.工作流 run01 pedding中，画布发生变化 run02，工作流读取是修改后的Workflow run02
2.历史工作流画布没有保存，只展示当前工作流画布

## 工作流模型
```
Workflow= 这个工作流本身
├── name
├── draftCanvas= 你当前正在编辑的草稿
└── versions= 某一次发布产生的不可变快照
      ├── v1
      ├── v2
      └── v3
```

## 数据库迁移
加新结构，保持兼容 -> 新写入走新结构 -> 旧结构停止使用 -> 必要时清理旧字段

## publish 发布不可变版本
流程：检查是否归档 → 检查有没有草稿 → 静态校验 → 创建version（最大版本号 +1，复制 draftCanvas 存为快照，status 改为 PUBLISHED）
只有草稿保存后才能点击发布，且发布前要对草稿校验
- 校验逻辑不变，以前 Validator 用 registry.has() 判断节点类型（281行），导致 API 只想校验也得造执行器；现在改为只依赖类型清单，执行器注册表只给 Scheduler 用
## Run 绑定 Version 正式运行跑的是发布版本
run跑到的是最新版本，"最新"在创建 run 时就确定了，不是在 worker 执行时才去读
- 例子：run 绑定 v1 后排队 → 改草稿、发布 v2 → worker 启动，执行的仍是 v1
## Draft Run执行 draftSnapshot（创建运行时复制的画布快照）
排队和执行链路两者共用，Worker 只根据 source 选择执行哪份画布，source=PUBLISHED选择执行version，source=DRAFT选择执行draft
### 一致性问题
Draft Run 也能保证一致.现在两种运行Run/Draft Run都在创建 Run 的那一刻固定下画布。
那一致性靠什么？靠的不是"已保存的草稿"，而是快照：创建运行的那一刻，就把这份画布复制一份存进 run.draftSnapshot，Worker 只执行这份快照。之后你继续改画布、保存、甚至发布，都动不到这次运行要执行的东西。
#### 快照 vs revision
简单说：revision 和快照是两套机制，各管各的，没有直接关系。快照是在**创建运行时（API 收到请求的那一刻）**生成的，不是 Worker 真正执行时。
revision：给"已保存草稿"计数
--判断有没有未发布的修改
### 用修订号revision判断有没有未发布的修改并防止并发发布
--判断： 用修订号比较，draftRevision（每次保存加 1）大于最新版本记录的 draftRevision，就是"有未发布的修改"。
--保护：
同一修订号重复发布，返回 400；
发布校验期间草稿又被保存，返回 409，保证发布出去的就是刚才校验过的那份画布；（校验前读了一次revision，检验完后又读了一次revision）
## 历史版本画布的只读预览
同一个 React Flow 通过切换数据源来只读展示历史版本，草稿状态不受影响
同一份画布，数据分离
## 总结目前所有，并发操作引发的问题+解决办法
```
| 场景 | 问题 | 解决 |
|---|---|---|
| 同一个 Job 被投递多次 | BullMQ 至少投递一次，两个 worker 可能同时领取同一个 run | 带条件领取：`WHERE status=PENDING` 才改成 RUNNING；行锁让两条 UPDATE 排队，count=0 说明被别人抢了，直接跳过 |
| worker 崩溃 | run 一直停在 RUNNING | 执行期间每 10 秒写一次心跳，超过 60 秒没更新由恢复扫描标成失败（WORKER_INTERRUPTED） |
| 假死 worker 和恢复扫描同时结束同一个 run | 结果被重复写或互相覆盖 | 只有状态还是 RUNNING 才写 SUCCESS/FAILED，后到的那个 count=0，结果丢弃 |
| 先建 run 再入队，中间崩溃（双写） | 留下没有 Job 的 PENDING 孤儿 | 入队失败立即标失败；恢复扫描：超过 5 分钟且队列里没有活着的 Job，就标成失败 |
| run 排队期间画布被修改 | 点的时候是 A，跑的却是 B | 创建 run 时就固定画布：正式运行绑定 version，测试运行存 draftSnapshot；worker 不读 draftCanvas |
| 发布校验期间草稿被保存 | 发布出去的画布没经过校验 | 修订号检查：事务里读到的 draftRevision 和校验时不一样就返回 409，用户重试 |
```

## External Workflow API
从今天开始，Workflow 不只是一个编辑器里的东西，而是一项可以被别的程序调用的能力。今天做出来的接口只能用于本地开发，不要直接暴露到公网
接口url换一下即可，@Controller('api/v1/workflows')ExternalWorkflowService：不要重新写一套执行逻辑
### 重要规则：External API 永远只运行 Published Version
本课完成后的架构
```
                    FlowMind
                       │
          ┌────────────┴────────────┐
          │                         │
          ▼                         ▼
     Editor / UI              External API
          │                  /api/v1/...
          │                         │
          └────────────┬────────────┘
                       ▼
               ExecutionService
                       │
                       ▼
                  WorkflowRun
                       │
                       ▼
                    BullMQ
                       │
                       ▼
                    Worker
                       │
                       ▼
              WorkflowVersion
                       │
                       ▼
               WorkflowEngine
```

# API Key + 外部 API 认证
## 问题
外部 API 谁知道 workflowId 谁就能调用，也能读取任意运行的结果。

## 方案
给每个工作流发 API Key=fm_<prefix>_<secret>，外部请求带 `Authorization: Bearer <key>`：
- Guard 负责认证：Key 是真的吗？失败返回 401
  Authorization: Bearer fm_371352f419f04e4d_5-z1Wv...
    ↓
  ① 用正则拆出 prefix = 371352f419f04e4d
  ② 按 prefix 查到唯一一行：{ keyHash, revokedAt失效时间, workflowId }
  ③ 已撤销？→ 失败
  ④ 对客户端发来的整串 Key 做 SHA-256，得到一个新哈希
  ⑤ 新哈希和库里的 keyHash 一样吗？一样 → 认证通过
- Service 负责授权：Key 能访问这个工作流或这条运行吗？失败返回 403

# 模型凭证
先分清三个概念
--Provider（供应商）：这是哪一类服务、用什么协议？ --OpenAI、DeepSeek、OpenAI 兼容服务
--Credential（凭证）：用什么连上去？ --API Key + Base URL （本课重点：创建Credential表存这些"凭证"）
--Model（模型）：具体调用哪个模型？  --gpt-4.1-mini、deepseek-chat
关系是 Provider → Credential → Model：一个凭证下面可以调用很多模型，所以凭证里不存模型。
## "加密"和"密钥边界"
一句话：让用户能在系统里保存多个模型供应商的 API Key，而且这些 Key 在数据库里、接口返回里、工作流定义里都不能以明文出现。
最核心的一条边界：工作流里只存凭证Credential id（查Credential表），不存 Key。定义里只放"引用"，真正的 Key 只放在 Credential 表里一处。
### 新知识一：哈希 vs 加密（最容易混
哈希不需要解密（单向，算不回去），加密（双向，有钥匙就能解开）
### 新知识二：AES-256-GCM 怎么理解（本节课加密算法）
```用一个保险箱来比喻
名词                |                比喻                  |          存在哪            |         保密吗
Master Key（主密钥，32 字节）| 保险箱钥匙                   | 本地环境变量               |必须，绝不进数据库
明文（plaintext）           |箱子里的东西，即 sk-xxx        |不存，只在内存里出现一下     | ----
密文 encryptedSecret        |锁好的箱子                     |数据库                     |不用，没钥匙打不开
IV secretIv（12 字节）      |每次上锁时随机拨的转盘位置       |数据库                     |不用，但每次必须不同
Auth Tag secretAuthTag（16 字节）|封条                      |数据库                     |不用，作用是发现箱子被动过
```
名字拆开看：AES 是加密算法，256 指钥匙长度是 256 位（32 字节），GCM 是工作模式，它不只加密，还会生成一个"封条"（auth tag）。
1.步骤是：随机生成 IV → 用"主密钥 + IV"加密明文 → 得到密文和封条 → 三样东西都转成 base64 存进数据库。
2.解密流程：拿主密钥 + IV + 封条去开密文。只要有一点不对（密文被改过、封条被改过、钥匙不对），decipher.final() 就会直接报错，绝不会返回一个错误的结果。
3.为什么每次都要换一个随机 IV？ 这样同一个 Key 加密两次，得到的密文也不一样，攻击者没法通过"这两条密文相同"推断出"这两个凭证用的是同一个 Key"

# 模型中心
一句话概括：上节课的凭证解决"用什么连上供应商"，这节课解决"连上之后能调用哪些模型"。整条链路是 Provider（供应商）→ Credential（凭证）→ Model（模型）。以后 LLM 节点只保存 modelId，运行时顺着这条链找到密钥，再去调用供应商。
model表（以及存入credential id，工作流定义不需要credential id，用Model id反查credential id即可）
## 运行链路：
modelId → Model → Credential（检查撤销）→ 解密 → 调用供应商

# LLM 节点 v2（从 provider + model 改为只存 modelId）
一句话总结：上节课建好了模型中心，这节课让 LLM 节点真正用上它。节点不再保存"哪个供应商、哪个模型名"，只保存一个 modelId。运行时再顺着 modelId → Model → Credential → 供应商 这条链去找真正要调用的东西。
## 两层校验：静态校验 vs 资源校验（本课重点）
- 静态（core，不查库）：有没有 modelId、prompt；旧版配置给专门提示 → WORKFLOW_INVALID
- 资源（API，查库）：模型存在？启用？凭证没撤销？→ MODEL_NOT_FOUND / MODEL_DISABLED / CREDENTIAL_REVOKED
也可以按另一个维度分类：
--运行前（校验 / 测试草稿 / 发布）
--运行时（worker 执行节点时）
## 职责拆分
LlmExecutor（依赖接口而不是具体实现） 只认 modelId → WorkerLlmClient 查库解析 → Provider 发请求
过渡：现在按 provider 类型取 .env，第 4 课换成解密凭证

# worker 在运行时解析凭证（真正接通模型中心
一句话总结：前三课分别建好了凭证、模型中心，并让节点只存 modelId。这节课补上最后一环：worker 执行 LLM 节点时，顺着 modelId → Model → Credential → 解密密钥 → 调用供应商 走完整条链。从此决定"用哪个 Key"的是数据库里的凭证，不再是 .env。
## 三层职责：谁该知道什么
```
层                              |知道什么                         |不该知道什么
workflow-core（LlmExecutor）    |modelId、prompt、temperature     |Prisma、凭证、AES、API Key、Base URL
worker 解析层（RuntimeModelResolver） |查模型、查凭证、解密         |HTTP 协议细节
供应商适配器（OpenAICompatibleProvider）|baseUrl、apiKey、modelName、请求格式、超时|数据库、.env 里的密钥
可以这样记：
core 定义接口 
Resolver 负责"调用谁"：把 modelId 变成一份完整的调用配置（baseUrl + apiKey + model + prompt）。
Adapter 负责"怎么调用"：拿到配置就发 HTTP 请求，自己什么都不查。
```
怎么理解供应商适配器：这些“不同大模型供应商的通信细节”，由供应商适配器负责。适配器负责把 FlowMind 内部统一的请求转换成上面这种供应商协议，也负责把响应统一回来

# 凭证测试 + 供应商验证 + 远程模型发现与导入
一句话总结：前四课接通了从节点到真实 LLM 的调用链路，这一课让凭证和模型的录入从"盲填配置"变成"可诊断、可发现、可导入"的完整闭环。

## 1. 三种动作的严格区分
| 动作 | 解决什么问题 | 调用协议 | 影响数据 |
|---|---|---|---|
| **Test Connection** | API Key、Base URL、网络和认证是否正确？ | `GET {baseUrl}/models`（10s 超时） | 纯诊断，**不写库**，失败不撤销凭证 |
| **Remote Model Discovery** | 供应商当前开放了哪些模型？ | `GET {baseUrl}/models` 并标记 `imported: true/false` | 纯只读，**不写库**，按需显式触发 |
| **Import Model** | 将选中的远程模型登记进模型中心 | 重新校验远程存在性后 `Prisma.$transaction` 批量创建 | 写 `Model` 表，作为 `CHAT` 类型模型 |

## 2. 为什么 Test Connection 不真的发 Chat？
- **不消耗 Token / 不扣费**：用户排查配置时可能点很多次，不能偷偷刷账单。
- **不触发模型限流**：避免刚测试就碰到 Rate Limit。
- **复用 OpenAPI /models 接口**：能返回合法模型列表，就证明网络通畅、认证成功、Base URL 合法。

## 3. 统一规则共享：为什么 Base URL 解析必须全系统只有一份代码？
在我们的系统里，有两个完全不同的独立进程会去请求大模型供应商
-- **1.API 进程（NestJS 后端）：**用户在网页上点“测试连接”或“发现模型”时，API 进程发 HTTP 请求。
-- **2.Worker 进程（后台任务队列）：**工作流真正在后台跑、执行到 LLM 节点时，Worker 进程发 HTTP 请求。
如果各自写各自的解析逻辑，用户体验崩溃：用户在控制台测了一万次都显示“连接成功”，但一跑工作流就莫名其妙报 404，找不出原因
我们把解析逻辑写成一个唯一的纯函数，抽象到 `@flowmind/shared` 包里

# Auth + Project + RBAC
本节课先做 Project 资源归属与隔离
## 问题：多用户情况下，这个 Workflow 到底是谁的？这个 Credential 属于谁？用户 A 为什么不能看到用户 B 的东西？
## 数据模型
```
User ──< ProjectMember >── Project
                               ├─ Workflow
                               └─ Credential ──< Model
ProjectMember = 谁在这个 Project 里，以及是什么角色
ProjectMember.role：预留 OWNER / EDITOR / VIEWER
```
## 接口
```
POST /projects
→ 创建项目
→ 当前用户自动成为 OWNER

GET /projects
→ 返回当前用户参与的项目列表

GET /projects/:projectId
→ 获取一个项目
→ 只有项目成员才能找到它
```
## 数据隔离
所有资源查询携带：projectId。项目 A 无法通过项目 B 的资源 ID 读取、修改或执行 B 的资源，通常返回 404

# Auth
这一课只解决“这次 HTTP 请求是谁发的？”
## 身份链路
```
Register
   ↓
User + Password Hash

Login
   ↓
验证密码
   ↓
签发 JWT

后续请求
Authorization: Bearer <token>
   ↓
验证 JWT
   ↓
request.user
   ↓
Current User
```
## 密码存储方式：hash,只需验证，不需要恢复。
## Register 时顺便创建 Personal Project
Create User
+
Create Personal Workspace = 一个名为 “Personal Workspace” 的 Project
+
Create OWNER Membership
## JwtAuthGuard：认证 + 从 Token 得到 Current User
```Bearer JWT 标准流程就是
Authorization: Bearer token
↓
验证签名
↓
验证 expiration
↓
取得 claims(jwt playload,例如用户id)
↓
挂到 request(例如将用户id挂到请求，使用用户id查数据)
```

# 真正阻止跨 Project 访问
上一课我们已经完成：“这次 HTTP 请求是谁发的。” 认证通过 ≠ 有权访问所有资源。这一课要补上， 当前登录用户，是否属于 URL 中指定的那个 Project,你能不能访问这个 Project？
## 最终请求链要变成
```
JWT
↓
Current User
↓
Project Membership Guard （即使用户伪造 URL / API 请求也不能访问）
↓
ProjectMember
↓
Resource Query
```
## 先冻结 5 条规则
```
Rule 1
所有 Management API 都必须先通过 JWT。

Rule 2
访问带 projectId 的资源前，必须确认当前 User 是 ProjectMember。

Rule 3
不是成员时，不返回 Project 是否存在。

Rule 4
即使 Guard 放行，Service 查询资源时仍然要带 projectId。

Rule 5
External API 不走 Project Membership Guard。
```
JWT Guard 解决：你是谁？,而ProjectMembershipGuard 解决：你是不是这个 Project 的成员？
## 形成了双层隔离
第一层：成员隔离
检查 User → Project
当前用户是不是这个项目成员？

第二层：资源隔离
检查 Resource → Project（所有查询带preject id）
当前资源是不是属于这个项目？

# RBAC 权限控制
本节课解决的是：同一个 Project 中，不同成员能做什么。
## 三种角色
| 角色 | 能做什么 |
|---|---|
| OWNER | 项目所有权限；可修改项目本身、后续可管理成员 |
| EDITOR | 可创建、修改、删除工作流、凭证、模型、API Key；可运行工作流 |
| VIEWER | 只能查看工作流、运行记录、日志、凭证和模型，不能修改或运行 |
## 请求经过的四层保护(能说清楚各自职责)
```
请求
  ↓
JwtAuthGuard
  ↓ 验证 token，得到当前 user
ProjectMembershipGuard
  ↓ 验证 user 是否属于 URL 中的 project
  ↓ 并把 membership 挂到 request.projectMembership
ProjectRoleGuard
  ↓ 根据接口要求，检查 OWNER / EDITOR / VIEWER
Service 资源隔离
  ↓ 查询资源时继续带 projectId
返回数据
```
ProjectRoleGuard 不再查数据库，而是直接读取上一步已经查出的 role：含义是：只有 OWNER 和 EDITOR 可以调用这个接口。

# 把多人协作真正做成产品能力
之前知道了“你是不是成员”，“你能做什么”，这一刻吧这套能力真正做成用户能操作的产品
## 准则
```
不能把最后一个 OWNER 降级

不能移除最后一个 OWNER

不能重复添加同一个用户

不能添加不存在的 User

成员管理只能发生在当前 Project
```
## Add Member 
```
email
↓
找 User
↓
不存在 → USER_NOT_FOUND
↓
检查是否已经是成员
↓
创建 ProjectMember
```
## Update Role DTO
如果这个人是最后一个 OWNER，不能把他改成 EDITOR / VIEWER
## Remove Member 同样保护最后一个 OWNER
## 暂未解决：并发问题：两个 OWNER 同时把自己降级怎么办？

# SSE 实时 Run 状态推送
## 1. 要解决什么问题？
之前前端**通过 Polling**每秒请求一次：GET /projects/:projectId/runs/:runId，缺点是状态有延迟，请求冗余，且无法及时推送节点状态和日志。
本节改为：Worker 状态变化后，主动推送给浏览器。
## 2. 为什么选 SSE，不选 WebSocket？
FlowMind 当前主要是：Server → Browser，即服务器单向推送 Run 状态、节点状态、日志。SSE 基于 HTTP，浏览器接收简单，适合单向实时通知；WebSocket 是双向长连接，当前没有必要提前增加复杂度。
## 通知架构
```Worker 执行期间/执行结束后，把状态变化通知前端
Worker
  │ publish “Run R1 SUCCESS”
  ▼
Redis Channel: flowmind:run:R1:events
  ▲
  │ API subscribe “我要监听 R1”
API Server
  │ SSE 推送
  ▼
Browser
  ↓
TanStack Query Cache
```
## SSE知识了解
```至少要掌握这四件事
普通 HTTP：
请求一次 → 响应一次 → 连接结束

SSE：
请求一次 → 连接保持 → 服务端可多次发送事件 → 客户端关闭时结束

WebSocket：
建立连接后 → 浏览器和服务端都能持续互相发消息

Polling：
前端定时重复发普通 HTTP 请求，主动查询状态
```
能回答出：SSE 是基于 HTTP 的服务端单向事件推送。浏览器先发起一个保持不断开的请求，服务端在状态变化时沿该连接持续发送事件。FlowMind 使用它把 Worker 的 Run 状态实时推到前端，同时保留数据库查询和 Polling 作为一致性兜底。

## 面试话术
我在工作流执行平台中**使用 SSE 实现 Run 状态的实时推送**。Worker 在数据库成功更新 Run 状态后（数据库），通过 Redis Pub/Sub 发布（推送）标准化事件；API 按 Run 订阅 Redis Channel，并通过 SSE 推给浏览器。  
数据库始终是事实来源，Redis Pub/Sub 只负责短生命周期通知，**因此 Redis 发布失败不会影响工作流执行**。**前端首次建立连接会收到数据库 Snapshot**，保证刷新页面后可以恢复当前状态。**后续状态事件直接更新 TanStack Query 缓存**；Polling 暂时保留，作为 SSE 断线或漏事件时的一致性兜底。
### Redis 发布失败不影响工作流
因为工作流已经真实完成，Redis 只是通知没发出去。前端暂时没有立刻变绿，但之后仍可通过两种方式恢复：本质是请求数据库
方式 1：Polling 再次 GET Run
方式 2：重新打开 SSE 时收到 Snapshot
### 后续状态事件和 Snapshot 的区别
Snapshot 到底是什么: 当浏览器刚建立 SSE 时，API 先读数据库当前值，再推送一条“当前状态快照”
```
RUN_SNAPSHOT
= 从数据库读取的当前全量状态
= 用于首次连接、刷新、重新进入页面
解决首次连接时,redis没连接成功，导致redis丢失状态

RUN_STATUS_CHANGED
= Worker 刚刚发出的增量变化通知
= 用于让页面尽快从 RUNNING 变 SUCCESS
后续实时更新状态
```

# SSE 重连、Polling 兜底与一致性
上一节课：有 SSE，且保留旧 Polling
本节课：明确何时该用 SSE、何时该启动 Polling 兜底
## 不是重新写一个 Polling，而是补上连接不可靠时的完整策略
```
SSE 正常
→ SSE 更新状态

SSE 断开 / 重连中
→ 启用 Polling

SSE 恢复/重连完成
→ 停止 Polling

Run 结束
→ 停止 Polling 和 SSE
```
SSE 重连（重新建立新的sse连接）由 fetch-event-source 协助处理，但业务层仍需决定哪些错误可以重连、连接恢复（首次连接）后如何从数据库重新对账，以及什么时候开启 Polling 兜底。

# NodeRun 实时事件与<mark>**画布执行覆盖层**</mark>
前面只知道这个 Workflow Run 是否正在运行 / 是否成功，本节课进一步知道：
--当前执行到哪个节点？
--哪些节点成功、失败、等待？
--这个节点是循环执行了多次，还是重试了多次？
最终画布会实时显示
## 概念：Workflow Node ≠ NodeRun
一个 Workflow Node 可以对应多个 NodeRun。因为有 Loop 和 Retry。
## 后端新增：发布 NodeRun 实时事件
```Worker 的执行链路变成：
Workflow Engine
  ↓
ExecutionObserver
  ├─ PostgreSQL NodeRun（事实来源）
  └─ Redis Pub/Sub（实时通知）
        ↓
     API Server
        ↓ SSE
     Browser
        ↓
TanStack Query Run Detail Cache
        ↓
NodeRun 聚合
        ↓
Canvas Execution Overlay
```
## 前端如何处理 Node 事件
```收到 NODE_STATUS_CHANGED 后：
按 nodeRunId 查找已有缓存记录 **为什么不能用 nodeId 更新***同一个 nodeId 可能有多个 NodeRun

不存在
→ append 新 NodeRun
→ 例如节点刚开始 RUNNING

存在
→ 更新同一条 NodeRun
→ 例如 RUNNING → SUCCESS
```
### 未执行节点如何显示
```开始 Run 时，很多节点还没有 NodeRun：表示它尚未执行到。
Run 仍在运行 + 节点没有 NodeRun
→ Pending

Run 已结束 + 节点没有 NodeRun
→ Not executed

Not executed 常见于：
IF 走了 true 分支
↓
false 分支节点从未执行
```
### NodeRun 聚合
<mark>**同一个 nodeId 的多个 NodeRun**</mark>
↓
取 sequence + attempt 最新的那条
↓
决定这个画布节点当前显示什么

# 实时日志与 Debug Panel
上一节课不能回答：为什么失败？这一轮重试发生了什么？节点输入、输出是什么？执行过程中产生了哪些日志？
本节课补上：
Canvas = 执行概览：哪里出问题()
SSE实时Debug Panel = 执行详情：为什么出问题
## Debug Panel点击节点后的流程
```
用户点击 Canvas Node
↓
确定 selectedNodeId
↓
从该 nodeId 的 NodeRuns 中找最新 sequence + attempt
↓
设置 selectedNodeRunId
↓
请求 NodeRun Debug API
↓
右侧 Debug Panel 展示详情

如果节点从未执行：
selectedNodeRunId = null
↓
不发无意义 API 请求
↓
显示“此节点在当前 Run 中未执行”
```
## 实时日志如何更新 Debug Panel
```前端部分链路
收到 LOG_APPENDED（SSE）
↓
检查这个 nodeRunId 的 Debug Detail 缓存是否已存在
├─ 已打开过 Debug Panel
│  → 缓存存在
│  → 直接 append 这一条日志，右侧实时更新
│
└─ 从未打开 Debug Panel
   → 缓存不存在
   → 不创建、不缓存、不请求数据库
```
```之后用户再点击某个节点、打开 Debug Panel：
点击节点
↓
useQuery 发现该 NodeRun Detail 没有缓存
↓
GET /projects/:projectId/runs/:runId/node-runs/:nodeRunId
↓
数据库读取 NodeRun + ExecutionLog
↓
返回完整、已脱敏的 input / output / error / logs
↓
Debug Panel 显示
```

# 关于涉及SSE部分梳理

## 1. 一条 SSE 事件如何影响页面

```text
SSE 事件
  ↓
更新 <mark>**TanStack Query 的 Run Detail Cache**</mark>
  ↓
├─ Canvas Overlay：读取 nodeRuns，节点变色
├─ 底部「运行」面板：读取同一份 run / nodeRuns，状态和追踪更新
└─ 右侧 Debug Panel：按需读取某个 NodeRun Detail
```

<mark>**重点：Canvas 和底部「运行」面板不各自维护一份实时状态。**</mark>

它们都读取同一个 <mark>**Run Detail Cache**</mark>。因此收到一次节点状态事件后，多个 UI 会自然同步更新。

## 2. 各个 UI 与 SSE 的关系

| UI | 是否直接受 SSE 影响 | 怎么更新 |
| --- | --- | --- |
| Canvas | 是 | <mark>**NODE_STATUS_CHANGED**</mark> 更新 `nodeRuns`，节点状态变化。 |
| 底部「运行」当前 Run | 是 | 同一份 <mark>**Run Detail Cache**</mark> 变化，整体状态、追踪、耗时随之变化。 |
| 运行历史列表 | 间接 | Run 结束后刷新 History，显示 `SUCCESS` / `FAILED`。 |
| 右侧 Debug Panel | 是，但按需 | 已打开时，<mark>**LOG_APPENDED**</mark> 追加日志；节点结束后重新读取完整详情。 |
| 底部「日志」标签 | 不逐条 SSE 追加 | 打开时从数据库读取该 Run 的全量日志。 |

## 3. 为什么底部日志不逐条实时追加？

底部日志是一个 <mark>**WorkflowRun 的全局日志视图**</mark>：它可能包含 Start、HTTP、LLM、IF 等所有节点的大量日志。

右侧 Debug Panel 是 <mark>**一个具体 NodeRun 的局部调试视图**</mark>：用户已经明确点开这个节点，因此只为它实时追加日志最有价值。

```text
底部「日志」：这个工作流整体发生过什么？
右侧 Debug：这个节点这一次执行具体发生了什么？
```

这样可以避免把所有节点的大量日志都持续塞入前端缓存，同时仍能在用户正在调试某个节点时立即看到新日志。

## 4. 新 Run 时 Debug Panel 的自动定位（重要修正）

“打开 Debug Panel 后日志会实时追加”有一个前提：面板必须已经定位到 <mark>**当前 Run 的具体 `nodeRunId`**</mark>。

```text
selectedNodeId
= 画布中的定义节点，例如 HTTP

selectedNodeRunId
= 当前 Run 中 HTTP 的某一次具体执行实例，例如 nr-http-new
```

重新运行时，前端会清空旧的 `selectedNodeRunId`，避免错误地读取上一次 Run 的数据；但用户可能仍然选中了 HTTP 画布节点。

正确流程应为：

```text
用户仍选中 HTTP 节点
↓
新 Run 中 HTTP 产生 NodeRun
↓
Debug Panel 自动选择该节点在当前 Run 最新的 nodeRunId
↓
GET NodeRun Detail，建立详情缓存
↓
后续 LOG_APPENDED 事件直接 append 到该缓存
↓
右侧 Logs 实时增加
```

<mark>**不能只因为 nodeId 相同，就沿用旧 Run 的 nodeRunId。**</mark>

因为 `nodeId` 是工作流定义中的节点身份；`nodeRunId` 才是某一次 Run 中的具体执行实例。

如果 SSE 中途漏掉日志，节点进入 `SUCCESS` / `FAILED` 后会重新请求完整 NodeRun Detail，因此最终的 input、output、error、logs 仍以数据库为准。

# RAG数据底座搭建 KnowledgeBase
## 什么是RAG
```这条模式叫 RAG：
用户问题
  ↓（下一课才做）
问题 → Embedding 向量
  ↓
在知识库中找相似 Chunk
  ↓
把相关 Chunk 放进 Prompt
  ↓
LLM 基于项目知识回答
```
Retrieval       找最相关的几段资料
Augmented       把这几段资料交给 LLM
Generation      LLM 生成回答
它不是重新训练模型。模型本来不知道“你公司的报销规则”；RAG 是在每次提问时，先从你的知识库中找相关内容，再把内容提供给 LLM。

## 本课新增的核心数据关系
```
Project
├─ Workflow
├─ Credential
├─ Model
└─ KnowledgeBase：用户看到的知识库，例如“产品文档”“HR 制度”
   └─ KnowledgeDocument：知识库里的一份原始资料，例如 employee-handbook.pdf
      └─ KnowledgeChunk：把长文切成的小段；未来真正检索的是它
         └─ embedding：Chunk 对应的语义向量
```

## pgvector 是什么
pgvector 是 PostgreSQL 的扩展，它新增了 vector.(本项目没有引入 Pinecone、Milvus 等独立向量数据库，而是在 PostgreSQL 中启用 pgvector。)
## 为什么 Prisma 写 Unsupported("vector")
Prisma 能很好处理普通字段,但 vector 是 PostgreSQL extension 的自定义类型，Prisma 目前不把它当作普通字段完整支持.所以
```
普通 Knowledge CRUD
→ Prisma

将向量写入 embedding
相似度搜索 ORDER BY embedding <=> ...
→ Prisma $executeRaw / $queryRaw
```
这不是设计失败，而是明确的边界：普通数据交给 Prisma；pgvector 特有能力用少量 Raw SQL。

## 为什么 Vector Dimension 很重要
向量长度必须一致。当前的规则是
一个 FlowMind 部署→ 使用一套固定的知识向量维度
所有 KnowledgeChunk→ 使用相同维度
## Model 为什么多了 EMBEDDING
以前只有：CHAT Model → 输入文字，输出文字，现在多了 EMBEDDING Model → 输入文字，输出向量
## 一句话总结
本课把 Project 内的Knowledge 的骨架搭好了：
KnowledgeBase → Document → Chunk → Vector，
用 pgvector 存向量，
用 Embedding Model 生成向量，
下一步才是把文档真正切块、生成向量并检索出来。

# 让骨架动起来 Embedding Model 解析 + Provider 调用 + Vector 写入
本节课把“知识库表里能存向量”变成了“Worker 能调用 Embedding 模型，生成向量，并安全写进 pgvector”。
## 核心架构
```与 llm chat 不同的执行链路
KnowledgeEmbeddingService
  ├─ 校验 Project / KnowledgeBase / Chunk
  ├─ 保证 Chunk 顺序
  ↓
EmbeddingService：Chunk 文本 → 向量
  ├─ 校验模型类型（embedding/chat、是否启用、维度
    ↓ 调用
  RuntimeModelResolver
    ├─ Model
    ├─ Credential
    └─ 解密 API Key
    ↓
  ProviderRegistry = “这个 Model 的供应商是 OpenAI / DeepSeek / Compatible， 应该拿哪个适配器？”
    ↓
  OpenAICompatibleProvider.embed() 拆成能力接口embed（新增），generate(原来)  = “我知道如何按该供应商协议发 HTTP 请求”
  ↓
POST /embeddings 写入数据库
  ↓
KnowledgeVectorService
  ↓
KnowledgeChunk.embedding（pgvector）
```

# 把一篇文档可靠地加工成可检索知识： Document Ingestion + Chunking Pipeline 
这一课最重要的不是“怎么上传 PDF”，而是三件事：
1. 文档如何变成稳定的 Chunk
2. 中途失败时如何避免留下半套脏数据
3. ingestion 为什么应该异步执行
## 本节课流水线
```
前端 / API
  ↓
创建 KnowledgeDocument：PENDING
  ↓
BullMQ Queue（只放 documentId）
  ↓
Worker
  ↓
PROCESSING
  ↓
DocumentTextExtractor：文档 → 文本
  ↓
TextChunker：文本 → batch Chunk[]
  ↓
createMany：将每个Chunk 写入 KnowledgeChunk 表（此时已有 content / chunkIndex，embedding = null）
  ↓
查询 KnowledgeChunk表 （ORDER BY chunkIndex ASC按照顺序查询chunk
  ↓
EmbeddingService：Chunk 文本chunk → 向量
  ↓
KnowledgeVectorService：向量写入 pgvector
  ↓
KnowledgeDocument：READY
```

## 1. 为什么 Ingestion 必须异步
从http请求-解析文档-chunk-embedding-写数据库-响应
问题：请求容易超时；用户关闭浏览器不该导致任务停止；大文档会影响其他普通 API 请求
所以本课复用以前的 BullMQ + Worker
## Document 状态机
PENDING
→ PROCESSING
→ READY

PROCESSING
→ FAILED
只有 READY 文档的 Chunk，未来才允许被检索。中途失败时，数据库里可能确实留下半套数据；但 Document.status 保证它们对检索功能不可见。下次重试会删掉旧 Chunk，从头生成。
## <mark>当前 Chunker 的策略</mark>
按字符长度切分,不是 Token 切分，也不是高级语义切分。
chunkSize = 1200
overlap = 200 
### 为什么要 overlap
保留边界上下文
### 为什么优先自然边界
不是每 1200 个字符硬切，而是会优先找附近的：
-段落空行
-换行
-中文句号：。
-英文句号：. 
避免把一句话切成两半
### Chunk 中保存什么
documentId       属于哪个文档
chunkIndex       第几个 Chunk：0、1、2……
content          实际文本
metadata         辅助信息（字符范围，pdf第几页...）
embedding        向量
### 为什么要批量 Embedding
```Chunk 不是一个个发送，而是例如每批 32 个
[Chunk 0, Chunk 1, ..., Chunk 31]
  ↓
Embedding Provider
  ↓
[Vector 0, Vector 1, ..., Vector 31]
```
这样比一个 Chunk 一次 HTTP 请求更高效
### 为什么要特别保证 Chunk 和向量顺序
因为向量本身没有“我是属于哪个 Chunk”的名字，系统只能靠位置把它们配对
第 4 步：从 KnowledgeChunk 表查询这些 Chunk
↓
第 5 步：拿查询结果去调用 Embedding
↓
第 6 步：把向量更新到对应 Chunk 行
所以要保证返回向量的顺序要和查询chunk的顺序一致，才能把向量更新到对应 Chunk 行

# 向量相似度检索与 Retriever Service
一句话概括：用户输入一句问题后，系统把问题转成向量，再从 pgvector 中找出语义最相近的文档 Chunk。
## RAG 的检索不能只靠关键词，需要语义相近
文本 → 向量
向量距离 → 语义相似度
## 整体链路
```检索业务编排：校验知识库、生成 query 向量、调用向量搜索
前端 / API 调用 Search
  ↓
POST /projects/:projectId/knowledge-bases/:knowledgeBaseId/search
  ↓
KnowledgeRetrieverService 
  ├─ 验证知识库属于该 Project
  ├─ 验证知识库已配置 Embedding 模型与维度
  ├─ 校验 query 非空
  ↓
KnowledgeQueryEmbeddingService
  ↓
ProviderRegistry → OpenAI-compatible Embedding API
  ↓
query vector
  ↓
KnowledgeVectorSearchService
  ↓
PostgreSQL + pgvector
  ↓
按余弦距离排序、取 Top K
  ↓
返回 Chunk + 文档信息 + score
```
## 为什么 Query 与文档必须使用同一个 Embedding 模型
1.向量维度可能不同，数据库无法比较；
2.即使维度碰巧相同，不同模型的向量空间语义也不一致；
3.相似度分数没有意义。

# Knowledge Retriever 节点，把检索结果交给 LLM
解决“把这些 Chunk 作为上下文注入工作流，让 LLM 基于资料回答”。
## 链路
```
Workflow Run 输入
  ↓
Knowledge Retriever 节点 Node Output: items(给debug pannel看score数据) + context
  ├─ 读取 query，例如 {{question}}
  ├─ 调用 Lesson 4 Retriever Service
  ├─ 得到相关 Chunk[]
  └─ 组装为 context，并写入工作流变量
       ↓
LLM 节点
  └─ 在 Prompt 中引用 {{retrieved.context}}
       ↓
基于检索资料生成回答
```
## Knowledge Retriever 节点在工作流中的位置
```
Start
  ↓
Knowledge Retriever
  ↓
LLM
  ↓
End
```

# Tool Contract + Tool Registry
这一课不是在做“智能 Agent”，而是在先修一条基础设施：让系统能够统一管理、描述和执行“可被 Agent 调用的能力”。
<mark>工具能力抽象</mark>
目前还没有 Agent 自动选工具、没有 MCP、没有工具循环。**只是先把“工具是什么、怎么找、怎么安全执行”定义好**

## 先分清：Node 和 Tool
Node（节点）= 工作流作者提前决定要执行什么
Tool（工具）= 未来由 Agent 在运行时决定是否调用
所以 Tool 不是画布上的固定步骤，而是 Agent 可选择使用的“能力”

## Tool 的最小组成、
├─ name：机器使用的稳定名字
├─ description：告诉 LLM 何时该用它
├─ inputSchema：告诉 LLM 参数结构
└─ execute()：真正执行能力
LLM 只需要看前三项；真正执行 execute() 是系统内部做的
## 为什么需要 Tool Contract （工具协议/统一约定）
不同来源的工具，底层实现可能完全不同
-Built-in Tool：FlowMind 自己写的工具
-MCP Tool：外部 MCP Server 提供的工具
-Workflow Tool：把另一个工作流当成工具
-HTTP Tool：调用受限制的外部 HTTP 能力
但未来 Agent 不应该分别学习每一种实现，所以先**统一成同一个接口**，这就是 Tool Contract（工具协议/统一约定）
## 为什么 input 是 unknown
Tool 的参数未来来自 LLM，LLM 生成的参数不可信，不能直接当成正确对象使用。然后每个 Tool 自己负责：
```
unknown 输入
  ↓
参数校验
  ↓
转换成可信的内部数据
  ↓
执行
```
## JSON Schema 的用途
inputSchema 主要不是给后端校验用的，而是给 LLM 阅读的“工具说明书”。
## Tool Registry 是什么
ToolRegistry 可以理解为“工具名册”,它只做三件事：
register(tool)       注册
get(name)            按名称找到工具
listDefinitions()    列出给 LLM 看的公开说明
## ToolExecutor 是什么
ToolExecutor 是 ToolRegistry 上面的一层统一执行器。
```
LLM 返回 ToolCall
  ↓
ToolExecutor
  ↓
检查是否在 Agent allowlist 中(Agent 不应默认拥有全部权限)
  ↓
ToolRegistry.get(name)
  ↓
Tool.execute(arguments, context)
  ↓
统一成 ToolCallResult
```
## 当前架构图
```
未来 Agent Node
  │
  ├─ 配置 allowedToolNames
  │
  ├─ ToolRegistry.listDefinitions()
  │   └─ 只把公开 metadata 交给 LLM
  │
  └─ LLM 返回 ToolCall
       │
       ▼
   ToolExecutor
       │
       ├─ allowlist 检查
       ├─ Registry.get(toolName)
       ├─ Tool 参数校验
       └─ Tool.execute()
            │
            ├─ EchoTool 是一个最简单的测试工具，像回声一样，把输入原样返回，所以叫 Echo。它存在的价值是验证整个通用工具链
            └─ SearchKnowledgeTool 复用 Sprint 12
                 │
                 └─ Sprint 12 RAG 检索能力
```
# 接入真实 Tool，并证明抽象可复用、安全、可控
# 外部 MCP Server 提供的工具，接入 FlowMind 原有的 Tool Runtime
本节课的 MCP Tool 是外部服务动态提供的能力：
GitHub MCP → search_issues
Notion MCP → search_pages
企业内部 MCP → query_customer
最终，未来 Agent 不需要区分它调用的是内置工具还是 MCP 工具。
```
Agent
  ↓
ToolExecutor
  ↓
Tool 统一 Tool 接口
  ├── Built-in Tool
  └── MCP Tool Adapter
         ↓
       MCP Client
         ↓
       Remote MCP Server
```
## MCP 是什么
MCP 可以先理解为一套统一协议.它让外部服务可以向 AI 应用声明:
“我有哪些工具”
“每个工具需要什么参数”
“怎样调用这些工具”
“工具执行后返回什么”

## Agent Node + LLM Tool Calling
这一课的目标是：让工作流里的 Agent 节点不只会“回答”，还能够由 LLM 决定是否调用已授权的工具，再根据工具结果生成最终回答。
## Agent Node 是什么
Agent Node 是一种工作流节点。它调用具备 Tool Calling 能力的模型，并协调模型和工具执行
它不是“一个工具”，而是一个编排者：
Agent Node
 ├─ 选择模型
 ├─ 把可用工具定义告诉模型
 ├─ 接收模型的 tool call 指令
 ├─ 执行工具
 ├─ 将工具结果交回模型
 └─ 保存最终回答
 本课实现的是“单轮 Agent”：最多两次 LLM 调用 + 一次工具调用

LLM 第一次：决定是否调工具
Tool：执行一次
LLM 第二次：根据工具结果给最终回答

## Tool Calling 到底是什么
支持 Tool Calling 的 LLM 可以返回一个结构化json，里面包含希望使用工具的信息

