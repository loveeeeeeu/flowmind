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

编辑 `apps/api/.env`，至少确认 `DATABASE_URL`、`REDIS_HOST`、`REDIS_PORT`。供应商的 API Key 不写在 `.env` 里：启动后在"模型设置 → 模型凭证"添加凭证，再到模型中心登记模型（见下文"LLM 节点"）。

`.env` 只放 FlowMind 自身的部署配置（数据库、Redis、主密钥、超时）；凭证是产品配置，加密存在数据库里，运行时才解密。

生成模型凭证的加密主密钥，填入 `CREDENTIAL_ENCRYPTION_KEY`（必填，缺少或格式不对 API 会拒绝启动）：

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

这个值生成一次后就不要再改，并单独备份：数据库里的凭证都用它加密，丢失或更换后所有已保存的凭证都无法解密。

worker 读取环境变量的顺序：`apps/worker/.env`（可选，不存在就跳过）→ `apps/api/.env`。本地开发只维护 `apps/api/.env` 一份即可，密钥不要提交到 Git。worker 也必须配置**同一个** `CREDENTIAL_ENCRYPTION_KEY`（缺少会拒绝启动），否则解密凭证时运行会以 `CREDENTIAL_DECRYPTION_ERROR` 失败。

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
| `apps/api/src` | API 的 `pnpm start:dev` 会自动重新编译并重启。 |
| `apps/worker/src` | Worker 的 `pnpm start:dev` 会自动重新编译并重启。 |
| `apps/web/src` | Vite 自动热更新。 |
| `packages/workflow-core` | 先运行 `pnpm --filter workflow-core build`，再**手动重启 Worker**。 |
| `packages/shared` | 先运行 `pnpm --filter shared build`，再**手动重启 API 和 Worker**。 |
| 多个 `packages/*` | 运行 `pnpm build:packages`。也可另开终端运行 `pnpm dev:packages` 持续编译；但包编译完成后，仍要手动重启依赖它的 API / Worker。 |
| `apps/api/prisma/schema.prisma` | 在 `apps/api` 执行 `prisma migrate dev` 和 `prisma generate`（见第 5 步） |

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

编辑器接口另有：`WORKFLOW_DRAFT_MISSING`、`WORKFLOW_INVALID`、`WORKFLOW_NO_UNPUBLISHED_CHANGES`、`DRAFT_CHANGED_DURING_PUBLISH`、`WORKFLOW_PUBLISH_CONFLICT`、`WORKFLOW_VERSION_NOT_FOUND`、`API_KEY_NOT_FOUND`、`CREDENTIAL_NOT_FOUND`、`CREDENTIAL_REVOKED`、`CREDENTIAL_BASE_URL_REQUIRED`、`MODEL_NOT_FOUND`、`MODEL_DISABLED`、`MODEL_NAME_CONFLICT`，完整列表见 `apps/api/src/common/api-error.ts`。运行失败的原因不是 HTTP 错误，而是写在运行记录的 `error.code` 里（如旧版运行没有绑定版本时为 `WORKFLOW_VERSION_MISSING`）。

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
- 密钥在每次 LLM 调用时由 worker 从数据库读取并解密，只存在于这次调用的内存里，不缓存：修改密钥后下一次运行就用新密钥（已发布版本无需重新发布），撤销后立即失效。
- 和外部调用的 API Key 不同：那个只需要校验，所以只存哈希；模型凭证要在调用供应商时还原原文，所以只能加密。

## 模型中心（Models）

凭证只说明"怎么连上供应商"，模型说明"能调用哪些模型"。前端"模型设置 → 模型中心"（`/settings/models`）按凭证分组管理：

```text
Credential: OpenAI Production
  ├── GPT-4.1 Mini   (modelName: gpt-4.1-mini)
  └── GPT-4.1        (modelName: gpt-4.1)
```

| 接口 | 说明 |
|---|---|
| `POST /credentials/:credentialId/models` | 添加模型；已撤销的凭证不能添加（`CREDENTIAL_REVOKED`） |
| `GET /credentials/:credentialId/models` | 管理列表，包含已停用的模型（排在后面） |
| `GET /models/available` | 可选模型：`enabled = true` 且凭证未撤销，给节点配置用 |
| `GET /models/:id` | 模型详情，附带凭证的 `id / name / provider / baseUrl / revokedAt` |
| `PATCH /models/:id` | 修改 `name / contextWindow / supportsTemperature / enabled` |
| `DELETE /models/:id` | 停用（不是删除），返回 204 |

- `modelName` 是原样发给供应商 API 的模型标识（如 `gpt-4.1-mini`），`name` 只是显示名。同一凭证下 `modelName` 唯一（`MODEL_NAME_CONFLICT`），不同凭证可以重复。
- `modelName` 和所属凭证创建后不能改：之后 LLM 节点只保存模型 id，改了就等于悄悄换掉已发布版本调用的模型。要换模型就新建一个。
- 模型永不物理删除，数据库也禁止硬删除还挂着模型的凭证（外键 `RESTRICT`）。
- 两种"不可用"互相独立：

| 状态 | 新节点能否选择 | 已发布版本能否运行 |
|---|---|---|
| 模型停用（`enabled = false`） | 不能 | 能 |
| 凭证撤销（`revokedAt` 有值） | 不能 | 不能（运行失败） |

撤销凭证不会改动它下面模型的 `enabled`；凭证状态和模型状态分别看。

## LLM 节点

LLM 节点只保存模型中心里的模型 id，不再保存 provider、模型名、凭证或密钥：

```json
{ "modelId": "cm...", "systemPrompt": "...", "prompt": "{{prompt}}", "temperature": 0.7, "outputVariable": "answer" }
```

运行时按 `modelId → Model → Credential → 供应商` 解析。属性面板的模型下拉框只列出可选模型（`GET /models/available`），按凭证分组显示为"凭证 / 模型"；模型声明不支持温度时隐藏温度输入，运行时也不发送，但节点上的值保留。

两层校验：

| 校验 | 时机 | 失败时 |
|---|---|---|
| 静态校验（workflow-core） | 校验、测试草稿、发布 | `WORKFLOW_INVALID`：未选择模型、提示词为空、仍是旧版配置 |
| 资源校验（API 查库） | 校验、测试草稿、发布 | 400：`MODEL_NOT_FOUND`、`MODEL_DISABLED`、`CREDENTIAL_REVOKED` |

已发布版本不再做资源校验：模型停用后仍能运行；凭证撤销后运行时节点以 `CREDENTIAL_REVOKED` 失败且不重试。

运行时（worker）的解析链路：

```text
RuntimeModelResolver   modelId → Model → Credential → 解密密钥（不检查 Model.enabled）
ProviderRegistry       凭证供应商 → 协议适配器（目前三种都走 OpenAI 兼容协议）
Provider Adapter       baseUrl + apiKey + modelName → POST {baseUrl}/chat/completions
```

Base URL 优先用凭证里填的，留空时 `OPENAI` 用 `https://api.openai.com/v1`、`DEEPSEEK` 用 `https://api.deepseek.com`，`OPENAI_COMPATIBLE` 必须填写。

节点失败时的错误码（写在节点运行记录的 `errorCode`）分两类：

| 类别 | 错误码 | 是否重试 |
|---|---|---|
| 模型 / 凭证解析失败（配置问题） | `MODEL_NOT_FOUND`、`CREDENTIAL_REVOKED`、`CREDENTIAL_DECRYPTION_ERROR`、`CREDENTIAL_BASE_URL_REQUIRED`、`PROVIDER_NOT_SUPPORTED` | 否 |
| 供应商调用失败 | `AUTH_ERROR`、`INSUFFICIENT_BALANCE`、`INVALID_REQUEST`、`EMPTY_RESPONSE` | 否 |
| 供应商调用失败（临时问题） | `RATE_LIMIT`、`TIMEOUT`、`NETWORK_ERROR`、`PROVIDER_UNAVAILABLE` | 是 |

执行日志里 LLM 节点开始时记录 `modelId / modelName / provider / credentialId`，不记录密钥和提示词。

旧版节点（只有 `provider` / `model`）会在画布和属性面板提示"需重新选择模型"，选择新模型后旧字段会被移除；旧节点不能测试也不能发布。

## 常见问题

| 现象 | 原因与处理 |
|---|---|
| `Cannot find module '@flowmind/workflow-core'` / `'@flowmind/shared'` | 没构建共享包：`pnpm build:packages` |
| worker 报 `Cannot find module '../generated/prisma/client.js'` | 没生成 Prisma Client：见第 5 步 |
| run 一直是 `PENDING` | worker 没启动或 Redis 没运行；worker 启动后会消费积压的任务 |
| `GET /runs/{id}` 返回 404 | 填成了工作流 ID，应填 run 接口返回的运行 ID |
| 改了引擎代码但行为没变 | 共享包没重新构建，或构建后没有手动重启依赖它的 Worker / API |
| 启动时报 `Invalid environment variables` | `.env` 缺少必填项（如 `DATABASE_URL`、`CREDENTIAL_ENCRYPTION_KEY`），对照 `apps/api/.env.example` |
| LLM 节点 `CREDENTIAL_DECRYPTION_ERROR` | worker 和 API 的 `CREDENTIAL_ENCRYPTION_KEY` 不一致，或主密钥被更换过 |
| LLM 节点 `AUTH_ERROR` | 凭证里的 API Key 不对；在模型凭证页更新密钥即可，下次运行生效 |

## 已知限制

- 编辑器使用的内部接口（工作流 CRUD、发布、API Key 管理、模型凭证和模型管理）目前没有用户认证，只适合本地开发。
- 不支持更换加密主密钥（Key Rotation）；凭证连通性可通过界面或接口进行即时连接测试（纯诊断工具，不消耗 Token）。
- 每个 LLM 节点执行时都会查一次库并解密，同一次运行里引用同一模型的多个节点不共享结果。
- 模型支持从供应商发现并按需导入（也可手动登记）；目前只有对话模型（`CHAT`）。
- API Key 可以读取同一工作流下由编辑器创建的 PUBLISHED 运行结果。
- 版本化之前创建的运行（显示为"旧版运行"）保留只读，不会重新执行；若被重新执行会以 `WORKFLOW_VERSION_MISSING` 失败。
- Code 节点使用 worker_threads + vm 隔离，不是安全沙箱，不要执行不可信代码。
