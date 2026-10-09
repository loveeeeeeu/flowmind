import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module.js';

async function bootstrap() {
  // Application context only: no HTTP server, the BullMQ connection keeps the process alive.
  const app = await NestFactory.createApplicationContext(WorkerModule);

  app.enableShutdownHooks();
  Logger.log('FlowMind worker started', 'Bootstrap');
}

await bootstrap();
