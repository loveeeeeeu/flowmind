import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsObject, ValidateNested } from 'class-validator';
import { UpdateWorkflowCanvasDto } from './update-workflow-canvas.dto.js';

/** A test run carries the editor's current canvas, which may include unsaved edits. */
export class TestWorkflowDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { name: 'FlowMind' },
    description: '工作流输入变量',
  })
  @IsObject()
  input: Record<string, unknown>;

  @ApiProperty({ type: UpdateWorkflowCanvasDto, description: '要测试的画布（可以是未保存的）' })
  @IsObject()
  @ValidateNested()
  @Type(() => UpdateWorkflowCanvasDto)
  canvas: UpdateWorkflowCanvasDto;
}
