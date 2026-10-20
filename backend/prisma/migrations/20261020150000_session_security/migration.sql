-- Seguridad de sesiones (v0.17.0). No destructiva: solo añade columna y tabla.

-- Versión de sesión: al restablecer la contraseña se incrementa y los JWT
-- emitidos con la versión anterior dejan de ser válidos.
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- Identificadores (jti) de JWT revocados por cierre de sesión.
CREATE TABLE "RevokedToken" (
    "jti" TEXT NOT NULL PRIMARY KEY,
    "expiresAt" DATETIME NOT NULL
);

CREATE INDEX "RevokedToken_expiresAt_idx" ON "RevokedToken"("expiresAt");
