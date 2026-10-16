-- Existing development users predate password authentication. Keep their projects and resources,
-- but give them an unusable marker: they cannot log in until their account is reset/recreated.
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;

UPDATE "User"
SET "passwordHash" = 'legacy-account-password-reset-required'
WHERE "passwordHash" IS NULL;

ALTER TABLE "User" ALTER COLUMN "passwordHash" SET NOT NULL;
