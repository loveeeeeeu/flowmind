import { Module } from '@nestjs/common';
import { CredentialModule } from '../credential/credential.module.js';
import { ProjectModule } from '../project/project.module.js';
import { McpConnectionController } from './mcp-connection.controller.js';
import { McpConnectionService } from './mcp-connection.service.js';
import { ProjectToolController } from './project-tool.controller.js';

@Module({ imports: [CredentialModule, ProjectModule], controllers: [McpConnectionController, ProjectToolController], providers: [McpConnectionService] })
export class McpModule {}
