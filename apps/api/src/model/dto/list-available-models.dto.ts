import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

/** Omit type for the existing LLM picker; it deliberately defaults to CHAT. */
export class ListAvailableModelsDto {
  @ApiPropertyOptional({ enum: ['CHAT', 'EMBEDDING'], default: 'CHAT' })
  @IsOptional()
  @IsIn(['CHAT', 'EMBEDDING'])
  type?: 'CHAT' | 'EMBEDDING';
}
