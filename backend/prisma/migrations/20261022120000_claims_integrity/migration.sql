-- Integridad de reclamaciones en el backend REST (auditoría 2026-10-22, INT-02 / INT-01).
-- Prisma no admite índices únicos parciales en el schema, así que van en SQL.
-- Equivalen a claims_unique_pending (Supabase, mig. 001) y
-- claims_one_approved_per_item (Supabase, mig. 012).

-- Un colaborador no puede tener dos reclamaciones PENDING del mismo objeto
-- (antes 3 peticiones simultáneas creaban 3 filas y 3 avisos al autor).
CREATE UNIQUE INDEX IF NOT EXISTS "Claim_unique_pending"
  ON "Claim" ("foundItemId", "claimantId")
  WHERE "status" = 'PENDING';

-- Como mucho una reclamación APPROVED por objeto.
CREATE UNIQUE INDEX IF NOT EXISTS "Claim_one_approved_per_item"
  ON "Claim" ("foundItemId")
  WHERE "status" = 'APPROVED';
