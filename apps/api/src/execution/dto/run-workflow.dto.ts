import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class RunWorkflowDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { name: 'FlowMind' },
    description: '工作流输入变量',
  })
  @IsObject()
  input: Record<string, unknown>;
}