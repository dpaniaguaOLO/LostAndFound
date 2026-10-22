-- Fecha de devolución (equivale a la migración 015 de Supabase).
ALTER TABLE "FoundItem" ADD COLUMN "returnedAt" DATETIME;

-- Ya devueltos: la mejor aproximación es su última modificación.
UPDATE "FoundItem" SET "returnedAt" = "updatedAt" WHERE "status" = 'RETURNED';
