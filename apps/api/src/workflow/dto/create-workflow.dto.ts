import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWorkflowDto {
  @ApiProperty({ description: '工作流名称', example: '每日新闻摘要' })
  name: string;

  @ApiPropertyOptional({ description: '工作流描述', example: '每天 8 点抓取新闻并用 AI 总结' })
  description?: string;
}