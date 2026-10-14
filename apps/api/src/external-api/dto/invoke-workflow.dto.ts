import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

/**
 * Public contract, kept separate from the editor's RunWorkflowDto so internal changes can never
 * leak into it. Any other property (canvas, version...) is rejected by forbidNonWhitelisted.
 */
export class InvokeWorkflowDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { name: 'FlowMind' },
    description: '工作流输入变量，必须是 JSON 对象（不能是字符串或数组）',
  })
  @IsObject()
  input: Record<string, unknown>;
}
