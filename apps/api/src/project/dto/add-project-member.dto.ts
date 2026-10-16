import { IsEmail, IsEnum } from 'class-validator';
import { ProjectRole } from '../../generated/prisma/client.js';

export class AddProjectMemberDto {
  @IsEmail()
  email!: string;

  @IsEnum(ProjectRole)
  role!: ProjectRole;
}
