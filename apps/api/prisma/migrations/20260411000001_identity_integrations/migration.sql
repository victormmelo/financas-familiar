DO $$ BEGIN
  CREATE TYPE "IntegrationStatus" AS ENUM ('ACTIVE', 'INACTIVE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE "integration_clients" (
  "id" TEXT NOT NULL,
  "family_id" TEXT NOT NULL,
  "created_by_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "keycloak_client_id" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'MEMBER',
  "status" "IntegrationStatus" NOT NULL DEFAULT 'ACTIVE',
  "last_used_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "integration_clients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integration_clients_keycloak_client_id_key" ON "integration_clients"("keycloak_client_id");
CREATE INDEX "integration_clients_family_id_status_idx" ON "integration_clients"("family_id", "status");

ALTER TABLE "integration_clients"
  ADD CONSTRAINT "integration_clients_family_id_fkey"
  FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "integration_clients"
  ADD CONSTRAINT "integration_clients_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP TABLE IF EXISTS "mcp_tokens";
