import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';
import { trim } from '../../credential/dto/create-credential.dto.js';

export class UpdateKnowledgeBaseDto {
  @ApiPropertyOptional({ example: 'Product documentation' })
  @ValidateIf((dto: UpdateKnowledgeBaseDto) => dto.name !== undefined)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ nullable: true, example: 'Support and product reference material' })
  @ValidateIf((dto: UpdateKnowledgeBaseDto) => dto.description !== undefined && dto.description !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'cm_embedding_model' })
  @ValidateIf((dto: UpdateKnowledgeBaseDto) => dto.embeddingModelId !== undefined && dto.embeddingModelId !== null)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  embeddingModelId?: string | null;
}
