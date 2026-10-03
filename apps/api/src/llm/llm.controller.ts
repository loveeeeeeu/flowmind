import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProviderRegistry } from './provider-registry.js';

@ApiTags('LLM')
@Controller('llm')
export class LlmController {
  constructor(private readonly registry: ProviderRegistry) {}

  @Get('providers')
  @ApiOperation({ summary: '列出已配置的 LLM Provider（不含密钥）' })
  listProviders() {
    return this.registry.list();
  }
}