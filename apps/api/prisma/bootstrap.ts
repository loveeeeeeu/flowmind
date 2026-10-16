/**
 * Sprint 10 bootstrap: one-time migration bridge.
 * Creates dev@flowmind.local + "Personal Workspace" project and
 * assigns every Workflow / Credential that has no projectId to it.
 *
 * Run ONCE with:
 *   pnpm --filter api exec tsx prisma/bootstrap.ts
 *
 * Safe to re-run: upserts are idempotent and updateMany(where null) is a no-op if nothing is null.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL']! });
const prisma = new PrismaClient({ adapter });


async function main() {
  // 1. Ensure the dev user exists.
  const user = await prisma.user.upsert({
    where: { email: 'dev@flowmind.local' },
    update: {},
    create: { email: 'dev@flowmind.local', name: 'Developer' },
  });
  console.log(`User: ${user.id} (${user.email})`);

  // 2. Find or create the default project for this user.
  const existing = await prisma.projectMember.findFirst({
    where: { userId: user.id, role: 'OWNER' },
    include: { project: true },
  });

  let project;
  if (existing) {
    project = existing.project;
    console.log(`Project already exists: ${project.id} (${project.name})`);
  } else {
    project = await prisma.project.create({
      data: {
        name: 'Personal Workspace',
        members: { create: { userId: user.id, role: 'OWNER' } },
      },
    });
    console.log(`Created project: ${project.id} (${project.name})`);
  }

  // 3. Assign all orphaned workflows to this project.
  const wfResult = await prisma.workflow.updateMany({
    where: { projectId: null },
    data: { projectId: project.id },
  });
  console.log(`Migrated ${wfResult.count} workflow(s) → project ${project.id}`);

  // 4. Assign all orphaned credentials to this project.
  const credResult = await prisma.credential.updateMany({
    where: { projectId: null },
    data: { projectId: project.id },
  });
  console.log(`Migrated ${credResult.count} credential(s) → project ${project.id}`);

  console.log('\nBootstrap complete. Now change projectId to required in schema and run migrate again.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
