-- Foto de perfil (equivale a profiles.avatar_path de la migración 016 de Supabase).
ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;
