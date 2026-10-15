import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { CredentialProvider } from '../../generated/prisma/enums.js';

export const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** An emptied input means "use the provider's official endpoint". */
export const toBaseUrl = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

// No user:password@host: baseUrl is returned by the API, so it must never carry a secret.
export const BASE_URL_OPTIONS = {
  require_tld: false,
  require_protocol: true,
  protocols: ['http', 'https'],
  disallow_auth: true,
};

export class CreateCredentialDto {
  @ApiProperty({ description: '便于辨认的名称', example: 'My DeepSeek' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ enum: CredentialProvider, example: CredentialProvider.DEEPSEEK })
  @IsEnum(CredentialProvider)
  provider: CredentialProvider;

  @ApiPropertyOptional({
    description: 'OpenAI / DeepSeek 可不填（使用官方地址）；OPENAI_COMPATIBLE 必填',
    example: 'https://api.deepseek.com',
    nullable: true,
  })
  @Transform(toBaseUrl)
  @IsOptional()
  @IsUrl(BASE_URL_OPTIONS)
  @MaxLength(500)
  baseUrl?: string | null;

  @ApiProperty({
    description: 'Provider 的 API Key。只写不读：加密存储，任何接口都不会返回',
    writeOnly: true,
    format: 'password',
    example: 'sk-xxxx',
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  secret: string;
}
