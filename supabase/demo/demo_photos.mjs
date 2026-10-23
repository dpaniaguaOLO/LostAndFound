// Fotos para los datos demo del juego (seed_game_demo.sql).
//
// Genera una ilustración tipo "foto de producto" por objeto (emoji de Twemoji,
// CC-BY 4.0 © Twitter/X y colaboradores, https://github.com/jdecked/twemoji,
// sobre un fondo degradado con sombra, 4:3 como las tarjetas) y la sube al bucket
// privado `item-photos` en la carpeta del autor. Da foto a TODOS los objetos y
// reportes demo (los que no tenían ruta reciben una).
//
//   node supabase/demo/demo_photos.mjs --preview <carpeta>   # solo genera muestras en local
//   node supabase/demo/demo_photos.mjs                        # sube al proyecto enlazado
//   node supabase/demo/demo_photos.mjs --cleanup              # borra las fotos demo de Storage
//
// La service_role key se obtiene con la CLI (`supabase projects api-keys`) y solo
// vive en memoria: no se imprime ni se escribe en disco. Ejecutar --cleanup ANTES
// de cleanup_game_demo.sql (después ya no se sabría qué rutas borrar).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sharp = createRequire(path.join(repo, 'backend/package.json'))('sharp');

const TWEMOJI = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg';
const BUCKET = 'item-photos';
const W = 800;
const H = 600;
const DEMO_MIN = 'dddddddd-0000-0000-0000-000000000000';
const DEMO_MAX = 'dddddddd-ffff-ffff-ffff-ffffffffffff';

// Título del seed -> código de Twemoji.
const EMOJI = {
  'Cargador de móvil': '1f50c', 'Audífonos inalámbricos': '1f3a7', 'Mouse inalámbrico': '1f5b1', 'Power bank': '1f50b',
  'Cable USB-C': '1f50c', 'Calculadora': '1f9ee',
  'Chaqueta negra': '1f9e5', 'Bufanda gris': '1f9e3', 'Gorra azul': '1f9e2', 'Suéter de lana': '1f455',
  'Impermeable amarillo': '1f9e5', 'Chaleco reflectivo': '1f9ba',
  'Paraguas negro': '2602', 'Lentes de sol': '1f576', 'Reloj de pulsera': '231a', 'Termo metálico': '1f964',
  'Botella de agua': '1f9f4', 'Gafas de lectura': '1f453',
  'Carné de empleado': '1faaa', 'Licencia de conducir': '1faaa', 'Cuaderno de notas': '1f4d3', 'Carpeta con facturas': '1f4c1',
  'Pasaporte': '1f4d8', 'Agenda 2026': '1f4d4',
  'Llaves de casa': '1f511', 'Llave de locker': '1f5dd', 'Llavero con control': '1f511', 'Llaves del carro': '1f511',
  'Tarjeta de acceso': '1f4b3', 'Llave de bodega': '1f5dd',
  'Mochila gris': '1f392', 'Bolso de mano': '1f45c', 'Lonchera azul': '1f371', 'Maletín de cuero': '1f4bc',
  'Bolsa de gimnasio': '1f45d', 'Estuche de lápices': '270f',
  'Billetera café': '1f45b', 'Monedero rojo': '1f45b', 'Tarjetero negro': '1f4b3', 'Billetera de tela': '1f45b',
  'Porta tarjetas': '1f4b3', 'Cartera pequeña': '1f45b',
  'Anillo plateado': '1f48d', 'Pulsera dorada': '1f4ff', 'Arete de perla': '1f48e', 'Cadena con dije': '1f4ff',
  'Reloj elegante': '231a', 'Collar de cuentas': '1f4ff',
  'Taza personalizada': '2615', 'Libro de bolsillo': '1f4d5', 'Peluche pequeño': '1f9f8', 'Planta en maceta': '1fab4',
  'Cojín lumbar': '1f6cb', 'Juego de cubiertos': '1f374',
};
const FALLBACK = '1f4e6'; // 📦

// Fondos (claro → algo más oscuro), como una superficie bajo luz suave.
const BACKGROUNDS = [
  ['#f1f5f9', '#cbd5e1'], ['#ecfdf5', '#a7f3d0'], ['#eff6ff', '#bfdbfe'], ['#fff7ed', '#fed7aa'],
  ['#fdf2f8', '#fbcfe8'], ['#f5f3ff', '#ddd6fe'], ['#fefce8', '#fde68a'], ['#f0fdfa', '#99f6e4'],
];

const svgCache = new Map();
async function twemoji(code) {
  if (!svgCache.has(code)) {
    const res = await fetch(`${TWEMOJI}/${code}.svg`);
    if (!res.ok) throw new Error(`Twemoji ${code}: HTTP ${res.status}`);
    const svg = await res.text();
    if (!svg.trimStart().startsWith('<svg')) throw new Error(`Twemoji ${code}: no es un SVG`);
    svgCache.set(code, svg);
  }
  return svgCache.get(code);
}

/** Hash estable de un texto (para variar fondo, tamaño y giro por objeto sin azar). */
function hash(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return h >>> 0;
}

async function render(title, seed) {
  const h = hash(seed);
  const [from, to] = BACKGROUNDS[h % BACKGROUNDS.length];
  const size = 300 + (h % 70);
  const angle = ((h >> 8) % 25) - 12;
  const cx = W / 2 + (((h >> 4) % 60) - 30);
  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <radialGradient id="g" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></radialGradient>
      <radialGradient id="s"><stop offset="0" stop-color="#0f172a" stop-opacity=".28"/><stop offset="1" stop-color="#0f172a" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <ellipse cx="${cx}" cy="${H / 2 + size * 0.46}" rx="${size * 0.5}" ry="${size * 0.09}" fill="url(#s)"/>
  </svg>`);
  const svg = await twemoji(EMOJI[title] ?? FALLBACK);
  const object = await sharp(Buffer.from(svg), { density: Math.round((72 * size) / 36) })
    .resize(size, size)
    .rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const meta = await sharp(object).metadata();
  return sharp(bg)
    .composite([{ input: object, left: Math.round(cx - meta.width / 2), top: Math.round(H / 2 - meta.height / 2 - 10) }])
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

// --- Supabase (service_role solo en memoria) ------------------------------------

function connect() {
  const ref = fs.readFileSync(path.join(repo, 'supabase/.temp/project-ref'), 'utf8').trim();
  if (!/^[a-z0-9]+$/.test(ref)) throw new Error('project-ref no válido');
  const cliArgs = ['projects', 'api-keys', '--project-ref', ref, '-o', 'json'];
  // En Windows la CLI es un .cmd: se lanza con cmd.exe (sin `shell: true`, obsoleto en Node 24).
  const [cmd, argv] = process.platform === 'win32' ? ['cmd.exe', ['/d', '/c', 'supabase', ...cliArgs]] : ['supabase', cliArgs];
  const out = execFileSync(cmd, argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const key = JSON.parse(out).find((k) => k.name === 'service_role')?.api_key;
  if (!key) throw new Error('No se pudo obtener la service_role key con la CLI (¿supabase login?)');
  const url = `https://${ref}.supabase.co`;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  async function call(method, p, body, extra = {}) {
    const res = await fetch(url + p, { method, headers: { ...headers, ...extra }, body });
    if (!res.ok) throw new Error(`${method} ${p.split('?')[0]}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.status === 204 ? null : res.json().catch(() => null);
  }
  return { call };
}

const demoRows = (api, table) =>
  api.call('GET', `/rest/v1/${table}?select=id,title,reporter_id,image_path&id=gte.${DEMO_MIN}&id=lte.${DEMO_MAX}&order=id`);

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === '--preview') {
    const dir = path.resolve(args[1] ?? 'demo-photos-preview');
    fs.mkdirSync(dir, { recursive: true });
    const titles = Object.keys(EMOJI);
    for (let i = 0; i < titles.length; i++) {
      fs.writeFileSync(path.join(dir, `${String(i).padStart(2, '0')}.jpg`), await render(titles[i], `${titles[i]}-${i}`));
    }
    // Hoja de contacto para revisar todas de un vistazo.
    const thumbs = await Promise.all(fs.readdirSync(dir).filter((f) => /^\d+\.jpg$/.test(f)).sort().map((f) => sharp(path.join(dir, f)).resize(200, 150).toBuffer()));
    const cols = 9;
    const sheet = sharp({ create: { width: cols * 200, height: Math.ceil(thumbs.length / cols) * 150, channels: 3, background: '#fff' } })
      .composite(thumbs.map((input, i) => ({ input, left: (i % cols) * 200, top: Math.floor(i / cols) * 150 })));
    await sheet.jpeg({ quality: 80 }).toFile(path.join(dir, 'contact-sheet.jpg'));
    console.log(`${titles.length} muestras en ${dir}`);
    return;
  }

  const api = connect();
  const rows = [
    ...(await demoRows(api, 'found_items')).map((r) => ({ ...r, table: 'found_items' })),
    ...(await demoRows(api, 'lost_reports')).map((r) => ({ ...r, table: 'lost_reports' })),
  ];
  if (!rows.length) throw new Error('No hay datos demo (ejecuta antes seed_game_demo.sql)');

  if (args[0] === '--cleanup') {
    const paths = rows.map((r) => r.image_path).filter(Boolean);
    for (let i = 0; i < paths.length; i += 100) {
      await api.call('DELETE', `/storage/v1/object/${BUCKET}`, JSON.stringify({ prefixes: paths.slice(i, i + 100) }), { 'Content-Type': 'application/json' });
    }
    console.log(`Fotos demo borradas: ${paths.length}`);
    return;
  }

  let done = 0;
  for (const r of rows) {
    // Ruta en la carpeta del autor (lo exige el CHECK image_owner_chk).
    const imagePath = r.image_path ?? `${r.reporter_id}/${crypto.randomUUID()}.jpg`;
    const jpg = await render(r.title, r.id);
    await api.call('POST', `/storage/v1/object/${BUCKET}/${imagePath}`, jpg, { 'Content-Type': 'image/jpeg', 'x-upsert': 'true' });
    if (!r.image_path) {
      await api.call('PATCH', `/rest/v1/${r.table}?id=eq.${r.id}`, JSON.stringify({ image_path: imagePath }), {
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      });
    }
    if (++done % 25 === 0) console.log(`  ${done}/${rows.length}`);
  }
  console.log(`Fotos demo subidas: ${done} (${rows.filter((r) => !r.image_path).length} objetos sin foto la recibieron)`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
