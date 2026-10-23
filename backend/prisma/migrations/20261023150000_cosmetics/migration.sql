-- Cosméticos equipados (equivale a la migración 018 de Supabase).
ALTER TABLE "User" ADD COLUMN "equippedFrame" TEXT;
ALTER TABLE "User" ADD COLUMN "equippedTitle" TEXT;
