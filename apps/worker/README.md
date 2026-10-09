# FlowMind Worker

没有 HTTP 的 NestJS 后台进程：消费 BullMQ 队列 `workflow-execution`，用 `@flowmind/workflow-core` 执行工作流，并把 WorkflowRun / NodeRun 写入 PostgreSQL。

完整的启动步骤见仓库根目录的 [README](../../README.md)。

## 启动前提

- PostgreSQL、Redis 已运行（根目录 `docker compose up -d`）
- 已构建共享包：根目录 `pnpm build:packages`
- 已生成 Prisma Client：在 `apps/api` 执行 `npx prisma generate --config prisma7.config.ts`（输出到本目录 `src/generated/prisma`）
- 环境变量：优先读 `apps/worker/.env`（可选），否则读 `apps/api/.env`

## 常用命令

```powershell
pnpm start:dev                      # 开发模式，日志出现 "FlowMind worker started" 即就绪
pnpm test                           # 单元测试
npx tsc --noEmit -p tsconfig.json   # 类型检查
```

开发时只启动一个 worker 实例。
