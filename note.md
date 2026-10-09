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
# 