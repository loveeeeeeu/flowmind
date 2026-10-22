import { Module } from '@nestjs/common';
import { CredentialModule } from '../credential/credential.module.js';
import { ProjectModule } from '../project/project.module.js';
import { McpConnectionController } from './mcp-connection.controller.js';
import { McpConnectionService } from './mcp-connection.service.js';

@Module({ imports: [CredentialModule, ProjectModule], controllers: [McpConnectionController], providers: [McpConnectionService] })
export class McpModule {}
