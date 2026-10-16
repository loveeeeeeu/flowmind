import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { CurrentUserService } from './current-user.service.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, CurrentUserService],
  exports: [CurrentUserService],
})
export class AuthModule {}
