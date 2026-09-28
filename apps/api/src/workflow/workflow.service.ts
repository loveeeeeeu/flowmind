import { Inject, Injectable } from '@nestjs/common';
import { LLM_PROVIDER } from '../llm/llm.constants.js';
import type { LLMProvider } from '../llm/providers/llm-provider.interface.js';
import { CreateWorkflowDto } from './dto/create-workflow.dto.js';
import { UpdateWorkflowDto } from './dto/update-workflow.dto.js';

@Injectable()
export class WorkflowService {
  constructor(
    @Inject(LLM_PROVIDER)
    private readonly llm: LLMProvider,
  ) {}

  findAll() {
    return [{ id: 'wf_1', name: '每日新闻摘要', description: '假数据' }];
  }

  create(dto: CreateWorkflowDto) {
    return { id: 'wf_new', ...dto };
  }

  findOne(id: string) {
    return { id, name: '每日新闻摘要', description: '假数据' };
  }

  update(id: string, dto: UpdateWorkflowDto) {
    return { id, ...dto };
  }

  remove(id: string) {
    return { id, deleted: true };
  }

  publish(id: string) {
    return { id, publishedVersion: 1 };
  }

  async run(id: string) {
    const result = await this.llm.chat({ model: 'gpt-5', prompt: 'Hello' });
    return { workflowId: id, output: result.content };
  }
}