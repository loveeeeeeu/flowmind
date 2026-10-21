import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { trim } from '../../credential/dto/create-credential.dto.js';

export const MAX_KNOWLEDGE_QUERY_CHARS = 8000;

export class SearchKnowledgeDto {
  @ApiProperty({ example: '员工住宿最高可以报销多少？' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_KNOWLEDGE_QUERY_CHARS)
  query!: string;

  @ApiPropertyOptional({ default: 5, minimum: 1, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  topK?: number;

  @ApiPropertyOptional({ default: 0, minimum: -1, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-1)
  @Max(1)
  minScore?: number;
}
