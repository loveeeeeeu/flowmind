import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { trim } from '../../credential/dto/create-credential.dto.js';
import { MAX_CONTEXT_WINDOW } from './create-model.dto.js';

/**
 * Metadata only. modelName and credentialId are the identity LLM nodes point at: changing them
 * would silently change what published versions call, so they are rejected (forbidNonWhitelisted).
 */
export class UpdateModelDto {
  @ApiPropertyOptional({ example: 'GPT-4.1 Mini' })
  @Transform(trim)
  @ValidateIf((dto: UpdateModelDto) => dto.name !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: '传 null 清空', nullable: true, example: 128000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_CONTEXT_WINDOW)
  contextWindow?: number | null;

  @ApiPropertyOptional()
  @ValidateIf((dto: UpdateModelDto) => dto.supportsTemperature !== undefined)
  @IsBoolean()
  supportsTemperature?: boolean;

  @ApiPropertyOptional()
  @ValidateIf((dto: UpdateModelDto) => dto.supportsToolCalling !== undefined)
  @IsBoolean()
  supportsToolCalling?: boolean;

  @ApiPropertyOptional({ description: 'false 等同于 DELETE；传 true 重新启用' })
  @ValidateIf((dto: UpdateModelDto) => dto.enabled !== undefined)
  @IsBoolean()
  enabled?: boolean;
}
