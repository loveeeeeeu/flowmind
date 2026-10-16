import type { ProjectRole } from '../generated/prisma/client.js';

/** Membership already verified for the current request; role is reused by the next RBAC lesson. */
export interface AuthenticatedProjectMember {
  id: string;
  projectId: string;
  userId: string;
  role: ProjectRole;
}
