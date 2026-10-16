import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ProjectController } from './project.controller.js';
import { ProjectService } from './project.service.js';
import { ProjectMembershipGuard } from './project-membership.guard.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ProjectController],
  providers: [ProjectService, ProjectMembershipGuard],
  exports: [ProjectService, ProjectMembershipGuard],
})
export class ProjectModule {}
