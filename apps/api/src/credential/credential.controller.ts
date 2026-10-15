import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CredentialConnectionService } from './credential-connection.service.js';
import { CredentialService } from './credential.service.js';
import { CreateCredentialDto } from './dto/create-credential.dto.js';
import { UpdateCredentialDto } from './dto/update-credential.dto.js';

// Internal management API: protected by user auth later (Sprint 10). No endpoint returns the
// secret or its ciphertext; the service selects a whitelist of fields.
@ApiTags('Credentials')
@Controller('credentials')
export class CredentialController {
  constructor(
    private readonly credentials: CredentialService,
    private readonly connection: CredentialConnectionService,
  ) {}

  @ApiOperation({ summary: 'Create a provider credential (the secret is encrypted, never returned)' })
  @Post()
  create(@Body() dto: CreateCredentialDto) {
    return this.credentials.create(dto);
  }

  @ApiOperation({ summary: 'List credentials, including revoked ones' })
  @Get()
  findAll() {
    return this.credentials.findAll();
  }

  @ApiOperation({ summary: 'Get one credential (without its secret)' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.credentials.findOne(id);
  }

  @ApiOperation({ summary: 'Update name / baseUrl; pass secret only to replace it' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCredentialDto) {
    return this.credentials.update(id, dto);
  }

  @ApiOperation({
    summary: 'Test the connection: GET {baseUrl}/models with the stored key, spends no tokens',
  })
  @ApiOkResponse({ description: '{ "ok": true }; failures are AUTH_ERROR / TIMEOUT / NETWORK_ERROR / ...' })
  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  test(@Param('id') id: string) {
    return this.connection.test(id);
  }

  @ApiOperation({
    summary: "List the provider's models (read-only, nothing is saved); imported=true if already added",
  })
  @Get(':id/remote-models')
  listRemoteModels(@Param('id') id: string) {
    return this.connection.listRemoteModels(id);
  }

  @ApiOperation({ summary: 'Revoke a credential (soft delete); workflows using it will fail' })
  @ApiNoContentResponse({ description: 'Revoked' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@Param('id') id: string) {
    await this.credentials.revoke(id);
  }
}
