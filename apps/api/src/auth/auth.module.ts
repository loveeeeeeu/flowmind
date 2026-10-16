import { Global, Module } from '@nestjs/common';
import { AuthenticationModule } from '@nestjs/authentication';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

@Global()
@Module({
  imports: [
    // We only use its PasswordHasher. The lesson deliberately uses an explicit JwtAuthGuard
    // on management controllers, so /auth/* and /api/v1/* keep their own auth boundaries.
    AuthenticationModule.forRoot({ globalGuard: false }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        // `@nestjs/config` returns string while jsonwebtoken narrows this to its duration union.
        signOptions: { expiresIn: (config.get<string>('JWT_EXPIRES_IN') ?? '2h') as never },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [JwtAuthGuard, JwtModule],
})
export class AuthModule {}
