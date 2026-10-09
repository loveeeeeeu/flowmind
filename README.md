# FlowMind

类 Dify / Coze 的 AI 工作流平台。pnpm monorepo：

```
apps/
  api/      NestJS HTTP 服务：工作流 CRUD、画布校验、创建运行并入队、查询运行结果（端口 3000）
  worker/   NestJS 后台进程（无 HTTP）：消费 BullMQ 队列，执行工作流，写 WorkflowRun / NodeRun
  web/      React + Vite 前端画布（端口 5173）
packages/
  workflow-core/  工作流引擎（纯 TS，不依赖 Nest / Prisma / BullMQ），api 用来校验，worker 用来执行
  shared/         api 与 worker 共用的约定：队列名、job 数据结构、错误归一化
```

运行一次工作流的链路：

```
web → POST /workflows/:id/run → api 创建 WorkflowRun(PENDING) + 入队 → 返回 202
                                   ↓ Redis (BullMQ)
                                 worker 取 job → RUNNING → 执行引擎 → 写 NodeRun → SUCCESS / FAILED
web / Swagger → GET /runs/:id 查看结果
```

## 环境要求

- Node.js 22+
- pnpm 11（`corepack enable` 或全局安装）
- Docker（运行 PostgreSQL 17 和 Redis 7）

## 首次启动

所有命令默认在仓库根目录执行（PowerShell 写法）。

### 1. 启动数据库和 Redis

```powershell
docker compose up -d
docker ps --format "{{.Names}} {{.Status}}"   # flowmind-postgres、flowmind-redis 为 Up
```

### 2. 安装依赖

```powershell
pnpm install
```

### 3. 配置环境变量

```powershell
Copy-Item apps/api/.env.example apps/api/.env
```

编辑 `apps/api/.env`，至少确认 `DATABASE_URL`、`REDIS_HOST`、`REDIS_PORT`；要用 LLM 节点再填对应的 `*_API_KEY`。

worker 读取环境变量的顺序：`apps/worker/.env`（可选，不存在就跳过）→ `apps/api/.env`。本地开发只维护 `apps/api/.env` 一份即可，密钥不要提交到 Git。

### 4. 构建共享包

```powershell
pnpm build:packages
```

api 和 worker 引用的是 `packages/*/dist`，没有这一步会报 `Cannot find module '@flowmind/workflow-core'`。

### 5. 生成 Prisma Client 并迁移数据库

```powershell
cd apps/api
npx prisma generate --config prisma7.config.ts        # 同时生成 api 和 worker 两份 Client
npx prisma migrate deploy --config prisma7.config.ts  # 应用已有迁移
cd ../..
```

schema 只有一份：`apps/api/prisma/schema.prisma`。修改 schema 后用 `npx prisma migrate dev --config prisma7.config.ts --name <名称>` 生成新迁移。

### 6. 启动三个进程（各开一个终端）

```powershell
# 终端 A：API（http://localhost:3000，Swagger：http://localhost:3000/docs）
cd apps/api; pnpm start:dev

# 终端 B：Worker（看到 "FlowMind worker started" 即就绪）
cd apps/worker; pnpm start:dev

# 终端 C：前端（http://localhost:5173）
cd apps/web; pnpm dev
```

开发时只启动一个 worker；多个 worker 会同时消费同一个队列。

## 日常开发

| 改了什么 | 需要做什么 |
|---|---|
| `packages/workflow-core` 或 `packages/shared` | `pnpm build:packages`，或另开终端运行 `pnpm dev:packages` 持续编译；api / worker 的 watch 会自动重启 |
| `apps/api/prisma/schema.prisma` | 在 `apps/api` 执行 `prisma migrate dev` 和 `prisma generate`（见第 5 步） |
| `apps/api`、`apps/worker`、`apps/web` 源码 | 对应的 watch 进程自动重新加载 |

## 测试

```powershell
pnpm test                                   # 先构建 packages，再跑所有包的单元测试

# 或单独运行
cd packages/workflow-core; npx vitest run   # 引擎
cd apps/api;               npx vitest run   # API
cd apps/worker;            npx vitest run   # Worker

# 类型检查
cd apps/api;    npx tsc --noEmit -p tsconfig.json
cd apps/worker; npx tsc --noEmit -p tsconfig.json
cd apps/web;    npx tsc --noEmit -p tsconfig.app.json
```

## 手动验证一次运行

1. 在前端画布搭建 Start → 模板 → End 并保存，或在 Swagger 创建工作流并 `PATCH /workflows/{id}/canvas`。
2. `POST /workflows/{工作流ID}/run`，body：`{"input": {"name": "FlowMind"}}`，返回 202 和 `status: "PENDING"`，记下返回的 `id`（运行 ID）。
3. `GET /runs/{运行ID}`：`status` 应为 `SUCCESS`，`nodeRuns` 按 `sequence` 列出每个节点的执行记录。

注意区分：`/workflows/{id}` 用工作流 ID，`/runs/{id}` 用运行 ID。`GET /workflows/{工作流ID}/runs` 可以列出某个工作流的全部运行记录。

## 常见问题

| 现象 | 原因与处理 |
|---|---|
| `Cannot find module '@flowmind/workflow-core'` / `'@flowmind/shared'` | 没构建共享包：`pnpm build:packages` |
| worker 报 `Cannot find module '../generated/prisma/client.js'` | 没生成 Prisma Client：见第 5 步 |
| run 一直是 `PENDING` | worker 没启动或 Redis 没运行；worker 启动后会消费积压的任务 |
| `GET /runs/{id}` 返回 404 | 填成了工作流 ID，应填 run 接口返回的运行 ID |
| 改了引擎代码但行为没变 | 共享包没重新构建 |
| 启动时报 `Invalid environment variables` | `.env` 缺少必填项（如 `DATABASE_URL`），对照 `apps/api/.env.example` |

## 已知限制

- worker 执行时读取工作流的最新画布，入队后修改画布会影响尚未执行的运行（后续用 WorkflowVersion 快照解决）。
- 提交运行时 API 只检查画布是否存在，结构错误要等 worker 执行时才标记为 FAILED。
- Code 节点使用 worker_threads + vm 隔离，不是安全沙箱，不要执行不可信代码。
