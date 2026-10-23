import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { trim } from '../../credential/dto/create-credential.dto.js';

export const MAX_CONTEXT_WINDOW = 100_000_000;
export const MAX_EMBEDDING_DIMENSIONS = 100_000;

/** credentialId comes from the route; modelName remains immutable after creation. */
export class CreateModelDto {
  @ApiProperty({ description: '在 FlowMind 中显示的名称', example: 'GPT-4.1 Mini' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({
    description: '原样发送给 Provider API 的模型标识，创建后不可修改',
    example: 'gpt-4.1-mini',
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  modelName: string;

  @ApiPropertyOptional({ description: '上下文窗口（token 数），仅作展示', example: 128000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_CONTEXT_WINDOW)
  contextWindow?: number | null;

  @ApiPropertyOptional({ description: '是否支持 temperature 参数，默认 true', example: true })
  @IsOptional()
  @IsBoolean()
  supportsTemperature?: boolean;

  @ApiPropertyOptional({ description: 'Whether this CHAT model supports function/tool calling', default: false })
  @IsOptional()
  @IsBoolean()
  supportsToolCalling?: boolean;

  @ApiPropertyOptional({ enum: ['CHAT', 'EMBEDDING'], default: 'CHAT' })
  @IsOptional()
  @IsIn(['CHAT', 'EMBEDDING'])
  type?: 'CHAT' | 'EMBEDDING';

  @ApiPropertyOptional({
    description: 'Required when type is EMBEDDING; all Knowledge Bases in this deployment use one dimension.',
    example: 1536,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_EMBEDDING_DIMENSIONS)
  embeddingDimensions?: number;
}
