import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { trim } from '../../credential/dto/create-credential.dto.js';

export class CreateKnowledgeBaseDto {
  @ApiProperty({ example: 'Product documentation' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Support and product reference material' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    description: 'An enabled EMBEDDING model in this same project. It can be set later before ingestion.',
    example: 'cm_embedding_model',
    nullable: true,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  embeddingModelId?: string;
}
