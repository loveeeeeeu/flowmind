import { SetMetadata } from '@nestjs/common';
import type { ProjectRole } from '../generated/prisma/client.js';

export const PROJECT_ROLES_KEY = 'project_roles';

export const ProjectRoles = (...roles: ProjectRole[]) => SetMetadata(PROJECT_ROLES_KEY, roles);
