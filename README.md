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

草稿、版本与运行：

```
草稿 draftCanvas（可编辑，每次保存 draftRevision + 1）
  ├─ 测试草稿  POST /workflows/:id/test-run → DRAFT 运行，执行创建时的画布快照 draftSnapshot
  └─ 发布      POST /workflows/:id/publish  → 不可修改的 WorkflowVersion v1、v2 …
                 ├─ 编辑器运行  POST /workflows/:id/run              → PUBLISHED 运行，绑定当时的最新版本
                 └─ 外部调用    POST /api/v1/workflows/:id/runs（API Key）→ 同上，并记录使用的 Key
```

运行一次工作流的链路（job 里只有 runId，执行什么画布由 run 自己决定）：

```
api 创建 WorkflowRun(PENDING，已绑定版本或快照) + 入队 → 返回 202
        ↓ Redis (BullMQ)
worker 取 job → RUNNING → 按 run.source 取画布 → 执行引擎 → 写 NodeRun → SUCCESS / FAILED
GET /runs/:id（编辑器）或 GET /api/v1/runs/:id（外部）查看结果
```

一致性规则（有单元测试和数据库约束保护，改动前先看这里）：

1. `draftCanvas` 是唯一可编辑的草稿；只有保存会增加 `draftRevision`，测试、运行、发布都不会。
2. `WorkflowVersion` 只增不改，代码里没有任何 update / delete。
3. 发布只发布服务端已保存的草稿，校验通过后在短事务里比对 `draftRevision`，期间草稿被保存则返回 409 `DRAFT_CHANGED_DURING_PUBLISH`。
4. DRAFT 运行执行创建时的 `draftSnapshot`；PUBLISHED 运行执行创建时绑定的 `workflowVersionId`。数据库 CHECK 约束 `WorkflowRun_source_canvas_check` 保证二者互斥。
5. worker 只通过 `resolveRunCanvas()` 取画布，从不读取 `draftCanvas`。
6. 外部 API 只能创建 PUBLISHED 运行；API Key 只能访问所属工作流及其运行。

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

生成模型凭证的加密主密钥，填入 `CREDENTIAL_ENCRYPTION_KEY`（必填，缺少或格式不对 API 会拒绝启动）：

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

这个值生成一次后就不要再改，并单独备份：数据库里的凭证都用它加密，丢失或更换后所有已保存的凭证都无法解密。

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
2. 发布：前端点"发布"，或 `POST /workflows/{工作流ID}/publish`，返回 `version: 1`。没发布过的工作流不能运行（400 `WORKFLOW_NOT_PUBLISHED`）。
3. `POST /workflows/{工作流ID}/run`，body：`{"input": {"name": "FlowMind"}}`，返回 202 和 `status: "PENDING"`，记下返回的 `id`（运行 ID）。
4. `GET /runs/{运行ID}`：`status` 应为 `SUCCESS`，`workflowVersion.version` 为 1，`nodeRuns` 按 `sequence` 列出每个节点的执行记录。

注意区分：`/workflows/{id}` 用工作流 ID，`/runs/{id}` 用运行 ID。`GET /workflows/{工作流ID}/runs` 可以列出某个工作流的全部运行记录。

## 外部调用（External API v1）

供其他系统调用已发布的工作流。Swagger 中的分组：Workflows / Runs / API Keys 是编辑器用的内部接口，External API v1 是对外接口。

1. 发布工作流，在工作流详情页"API 密钥"中创建密钥。完整密钥只显示一次，数据库只存前缀和哈希。
2. 提交运行（异步，立即返回 202）：

```bash
curl -X POST http://localhost:3000/api/v1/workflows/<工作流ID>/runs \
  -H "Authorization: Bearer fm_xxx" \
  -H "Content-Type: application/json" \
  -d '{"input":{"name":"FlowMind"}}'
```

```json
{ "runId": "cm...", "workflowId": "cm...", "version": 2, "status": "PENDING" }
```

3. 用返回的 `runId` 轮询结果，直到 `status` 为 `SUCCESS` / `FAILED` / `CANCELLED`：

```bash
curl http://localhost:3000/api/v1/runs/<runId> -H "Authorization: Bearer fm_xxx"
```

```json
{
  "runId": "cm...", "workflowId": "cm...", "version": 2, "status": "SUCCESS",
  "output": { "greeting": "Hello FlowMind" }, "error": null,
  "createdAt": "...", "startedAt": "...", "finishedAt": "..."
}
```

`output` 只在 SUCCESS 时有值，`error`（`{ code, message }`）只在 FAILED 时有值。运行的是提交时的最新发布版本，之后再改草稿或发布新版本都不影响它。body 只接受 `input`，不能传画布或版本号。PowerShell 5 请用 `curl.exe` 并把 JSON 写进文件后用 `-d "@body.json"` 传入。

### 错误格式

所有 4xx 返回统一结构，调用方按 `code` 判断，`message` 只给人看、可能调整：

```json
{ "statusCode": 403, "error": "Forbidden", "code": "API_KEY_FORBIDDEN", "message": "API key cannot access this workflow" }
```

| code | 状态码 | 含义 |
|---|---|---|
| `VALIDATION_FAILED` | 400 | 请求体不合法（如 `input` 不是对象、多传了字段） |
| `INVALID_API_KEY` | 401 | 缺少、格式错误、不存在或已吊销的 Key |
| `API_KEY_FORBIDDEN` | 403 | Key 不属于该工作流 / 该运行 |
| `WORKFLOW_NOT_FOUND` / `RUN_NOT_FOUND` | 404 | 资源不存在（草稿测试运行对外部也视为不存在） |
| `WORKFLOW_NOT_PUBLISHED` | 400 | 还没有发布版本 |
| `WORKFLOW_ARCHIVED` | 400 | 工作流已归档 |

编辑器接口另有：`WORKFLOW_DRAFT_MISSING`、`WORKFLOW_INVALID`、`WORKFLOW_NO_UNPUBLISHED_CHANGES`、`DRAFT_CHANGED_DURING_PUBLISH`、`WORKFLOW_PUBLISH_CONFLICT`、`WORKFLOW_VERSION_NOT_FOUND`、`API_KEY_NOT_FOUND`、`CREDENTIAL_NOT_FOUND`、`CREDENTIAL_REVOKED`、`CREDENTIAL_BASE_URL_REQUIRED`，完整列表见 `apps/api/src/common/api-error.ts`。运行失败的原因不是 HTTP 错误，而是写在运行记录的 `error.code` 里（如旧版运行没有绑定版本时为 `WORKFLOW_VERSION_MISSING`）。

## 模型凭证（Credentials）

前端"模型凭证"页面（`/settings/credentials`）或 `POST /credentials` 保存连接模型供应商所需的 API Key：

| 供应商 | Base URL |
|---|---|
| `OPENAI` / `DEEPSEEK` | 可选，留空使用官方地址 |
| `OPENAI_COMPATIBLE` | 必填，如自建 vLLM `http://localhost:8000/v1` |

- 密钥用 AES-256-GCM 加密后存库（`encryptedSecret` + 随机 `secretIv` + `secretAuthTag`），任何接口都只返回 `id / name / provider / baseUrl / revokedAt / createdAt / updatedAt`。
- 修改时不传 `secret` 就保留原密钥，传了就重新加密覆盖；供应商创建后不能改。
- 删除是撤销（软删除）：已发布版本可能还引用着这个凭证 id，运行时会明确失败而不是找不到。
- 画布、版本、运行记录和执行日志只会保存凭证 id，永远不保存密钥本身。
- 和外部调用的 API Key 不同：那个只需要校验，所以只存哈希；模型凭证要在调用供应商时还原原文，所以只能加密。

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

- 编辑器使用的内部接口（工作流 CRUD、发布、API Key 管理、模型凭证管理）目前没有用户认证，只适合本地开发。
- LLM 节点暂时仍使用 `.env` 中的 `*_API_KEY`，尚未接入模型凭证；不支持更换加密主密钥（Key Rotation）。
- API Key 可以读取同一工作流下由编辑器创建的 PUBLISHED 运行结果。
- 版本化之前创建的运行（显示为"旧版运行"）保留只读，不会重新执行；若被重新执行会以 `WORKFLOW_VERSION_MISSING` 失败。
- Code 节点使用 worker_threads + vm 隔离，不是安全沙箱，不要执行不可信代码。
