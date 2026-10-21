import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { KnowledgeDocumentSourceType } from '../../generated/prisma/enums.js';
import { trim } from '../../credential/dto/create-credential.dto.js';

export const MAX_KNOWLEDGE_TEXT_LENGTH = 1_000_000;

export class CreateKnowledgeDocumentDto {
  @ApiProperty({ example: 'Refund policy' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ enum: KnowledgeDocumentSourceType, example: KnowledgeDocumentSourceType.TEXT })
  @IsEnum(KnowledgeDocumentSourceType)
  sourceType!: KnowledgeDocumentSourceType;

  @ApiPropertyOptional({ description: 'Required for TEXT documents', maxLength: MAX_KNOWLEDGE_TEXT_LENGTH })
  @ValidateIf((dto: CreateKnowledgeDocumentDto) => dto.text !== undefined)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_KNOWLEDGE_TEXT_LENGTH)
  text?: string;
}
