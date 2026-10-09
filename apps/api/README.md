# FlowMind API

NestJS HTTP 服务：工作流 CRUD、画布校验、创建运行并投递到 BullMQ、查询运行结果。工作流的实际执行在 `apps/worker`。

完整的启动步骤（数据库、环境变量、共享包、worker、前端）见仓库根目录的 [README](../../README.md)。

## 常用命令

```powershell
pnpm start:dev                                        # 开发模式，http://localhost:3000，Swagger：/docs
pnpm test                                             # 单元测试
npx tsc --noEmit -p tsconfig.json                     # 类型检查
npx prisma generate --config prisma7.config.ts        # 生成 api 和 worker 的 Prisma Client
npx prisma migrate dev --config prisma7.config.ts --name <名称>   # 修改 schema 后生成迁移
```

环境变量模板：`.env.example`（复制为 `.env`，worker 也会读取这份 `.env`）。
