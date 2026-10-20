#!/usr/bin/env node
/**
 * Detector de secretos (sin dependencias). Bloquea commits que incluyan claves,
 * tokens o archivos .env reales.
 *
 *   node scripts/check-secrets.mjs            -> archivos en stage (pre-commit)
 *   node scripts/check-secrets.mjs --all      -> todos los archivos versionados
 *   node scripts/check-secrets.mjs --history  -> todo el historial de git
 *
 * Nunca imprime el valor encontrado, solo archivo, línea y tipo.
 * Falso positivo justificado: añade `secret-scan: allow` en esa línea.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const RULES = [
  ['JWT / clave Supabase legacy', /eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/],
  ['Clave secreta Supabase', /sb_secret_[A-Za-z0-9_-]{10,}/],
  ['Clave privada', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['Token de GitHub', /gh[pousr]_[A-Za-z0-9]{30,}/],
  ['Clave de AWS', /AKIA[0-9A-Z]{16}/],
  ['Clave de API de Anthropic/OpenAI', /sk-(ant-)?[A-Za-z0-9_-]{24,}/],
  ['URL de BD con contraseña', /postgres(?:ql)?:\/\/[^:\s/]+:[^@\s]{6,}@/],
  ['Asignación de secreto', /(?:secret|api[_-]?key|service_role_key|password|passwd|token)\s*[:=]\s*["']?[A-Za-z0-9_\-/+=]{20,}/i],
];
// Valores de ejemplo permitidos (placeholders documentados).
const PLACEHOLDER = /cambia-este-valor|example|placeholder|your[-_]|<[^>]+>|x{8,}|test-secret/i;
const BINARY = /\.(png|jpe?g|webp|gif|ico|pptx|docx|pdf|db|sqlite3?|jar|keystore|woff2?|ttf|zip)$/i;
// Archivos de entorno reales: nunca deben versionarse (solo *.example).
const ENV_FILE = /(^|\/)\.env(\.(?!example$)[^/]+)?$/;

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const mode = process.argv[2] ?? '--staged';
const findings = [];

function scanText(label, text) {
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.includes('secret-scan: allow')) return;
    for (const [name, re] of RULES) {
      const m = line.match(re);
      if (m && !PLACEHOLDER.test(m[0]) && !PLACEHOLDER.test(line)) findings.push(`${label}:${i + 1}  ${name}`);
    }
  });
}

if (mode === '--history') {
  let commit = '';
  let file = '';
  for (const line of git('log', '--all', '-p', '--no-color', '--no-ext-diff').split('\n')) {
    if (line.startsWith('commit ')) commit = line.slice(7, 14);
    else if (line.startsWith('+++ b/')) file = line.slice(6);
    else if (line.startsWith('+') && !BINARY.test(file)) scanText(`${commit} ${file}`, line.slice(1));
  }
} else {
  const files = (mode === '--all'
    ? git('ls-files')
    : git('diff', '--cached', '--name-only', '--diff-filter=ACMR')
  ).split('\n').filter(Boolean);
  for (const f of files) {
    if (ENV_FILE.test(f)) {
      findings.push(`${f}  Archivo .env real (solo se versionan *.env.example)`);
      continue;
    }
    if (BINARY.test(f) || !fs.existsSync(f)) continue;
    const text = mode === '--all' ? fs.readFileSync(f, 'utf8') : git('show', `:${f}`);
    scanText(f, text);
  }
}

if (findings.length) {
  console.error('Posibles secretos detectados (no se muestran los valores):');
  for (const f of findings) console.error(`  - ${f}`);
  console.error('\nRetíralos y usa variables de entorno. Si una clave real llegó a subirse, ROTALA.');
  process.exit(1);
}
console.log(`check-secrets (${mode}): sin secretos detectados.`);
