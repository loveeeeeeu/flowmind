import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { CreateModelDto } from './create-model.dto.js';

export const MAX_IMPORT_MODELS = 100;

/**
 * Each item is what a manual create takes: modelName must be one of the provider's model ids
 * (checked against GET /models at import time), the rest is metadata the user confirms.
 */
export class ImportModelsDto {
  @ApiProperty({
    type: [CreateModelDto],
    example: [
      { modelName: 'gpt-5-mini', name: 'GPT-5 Mini', contextWindow: 128000, supportsTemperature: true },
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_IMPORT_MODELS)
  @ValidateNested({ each: true })
  @Type(() => CreateModelDto)
  models: CreateModelDto[];
}
