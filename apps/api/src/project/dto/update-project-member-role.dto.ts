import { IsEnum } from 'class-validator';
import { ProjectRole } from '../../generated/prisma/client.js';

export class UpdateProjectMemberRoleDto {
  @IsEnum(ProjectRole)
  role!: ProjectRole;
}
