import { ApiProperty } from '@nestjs/swagger';
import { IsArray } from 'class-validator';

export class UpdateWorkflowCanvasDto {
  @ApiProperty({ type: 'array', items: { type: 'object' }, description: '画布节点' })
  @IsArray()
  nodes: Record<string, unknown>[];

  @ApiProperty({ type: 'array', items: { type: 'object' }, description: '画布连线' })
  @IsArray()
  edges: Record<string, unknown>[];
}