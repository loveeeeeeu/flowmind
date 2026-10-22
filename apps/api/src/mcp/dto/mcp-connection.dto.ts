import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength, ValidateIf } from 'class-validator';
import { McpAuthType, McpConnectionStatus } from '../../generated/prisma/enums.js';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class CreateMcpConnectionDto {
  @ApiProperty() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100) name: string;
  @ApiProperty({ example: 'https://mcp.example.com/mcp' }) @Transform(trim) @IsUrl({ protocols: ['https'], require_protocol: true, disallow_auth: true }) @MaxLength(500) url: string;
  @ApiPropertyOptional({ enum: McpAuthType, default: McpAuthType.NONE }) @IsOptional() @IsEnum(McpAuthType) authType?: McpAuthType;
  @ApiPropertyOptional({ writeOnly: true }) @Transform(trim) @ValidateIf((dto: CreateMcpConnectionDto) => dto.authType === McpAuthType.BEARER) @IsString() @IsNotEmpty() @MaxLength(4096) secret?: string;
}

export class UpdateMcpConnectionDto {
  @ApiPropertyOptional() @Transform(trim) @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) name?: string;
  @ApiPropertyOptional() @Transform(trim) @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true, disallow_auth: true }) @MaxLength(500) url?: string;
  @ApiPropertyOptional({ enum: McpConnectionStatus }) @IsOptional() @IsEnum(McpConnectionStatus) status?: McpConnectionStatus;
  @ApiPropertyOptional({ enum: McpAuthType }) @IsOptional() @IsEnum(McpAuthType) authType?: McpAuthType;
  @ApiPropertyOptional({ writeOnly: true }) @Transform(trim) @IsOptional() @IsString() @IsNotEmpty() @MaxLength(4096) secret?: string;
}
