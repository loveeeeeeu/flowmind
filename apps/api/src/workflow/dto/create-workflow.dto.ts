import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateWorkflowDto {
  @ApiProperty({ description: '工作流名称', example: 'Customer Service' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: '工作流描述', example: 'AI customer service workflow' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}