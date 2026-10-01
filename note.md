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
## 如何转为graph图
图用两张表表示：邻接表（每个节点做完后通知谁）+ 入度（每个节点还要等几个上游）。
## 如何校验
- 结构校验（validate）：画布格式、节点非空、恰好一个 Start、恰好一个 End
- 建图时：重复 id、边指向不存在的节点
- 排序时：环DAG有向无环图

拓扑排序（Kahn 算法）：入度为 0 的节点放进队列（"现在就能做的待办清单"）→ 取出一个放进结果 → 它的下游入度 -1 → 减到 0 的放进队列 → 直到队列为空。
排出来的数量 < 节点总数 → 有节点永远等不到 → 有环。环检测是拓扑排序的副产品，不需要单独的算法。
复杂度 O(V+E)：每个节点进出队列一次，每条边只处理一次。

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