import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength, ValidateIf } from 'class-validator';
import { BASE_URL_OPTIONS, toBaseUrl, trim } from './create-credential.dto.js';

/** provider is deliberately absent: switching it changes what the secret means, so create a new one. */
export class UpdateCredentialDto {
  // ValidateIf instead of IsOptional: IsOptional would also let null through to a NOT NULL column.
  @ApiPropertyOptional({ example: 'OpenAI Production' })
  @Transform(trim)
  @ValidateIf((dto: UpdateCredentialDto) => dto.name !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    description: '传 null 或空字符串恢复为官方地址（OPENAI_COMPATIBLE 不允许）',
    nullable: true,
  })
  @Transform(toBaseUrl)
  @IsOptional()
  @IsUrl(BASE_URL_OPTIONS)
  @MaxLength(500)
  baseUrl?: string | null;

  @ApiPropertyOptional({
    description: '不传则保留原密钥；传了就重新加密覆盖。原密钥永远不会被读出',
    writeOnly: true,
    format: 'password',
  })
  @Transform(trim)
  @ValidateIf((dto: UpdateCredentialDto) => dto.secret !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  secret?: string;
}
