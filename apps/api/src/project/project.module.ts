import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ProjectController } from './project.controller.js';
import { ProjectService } from './project.service.js';
import { ProjectMembershipGuard } from './project-membership.guard.js';
import { ProjectRoleGuard } from './project-role.guard.js';
import { ProjectMemberController } from './project-member.controller.js';
import { ProjectMemberService } from './project-member.service.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ProjectController, ProjectMemberController],
  providers: [ProjectService, ProjectMemberService, ProjectMembershipGuard, ProjectRoleGuard],
  exports: [ProjectService, ProjectMembershipGuard, ProjectRoleGuard],
})
export class ProjectModule {}
