/**
 * Preparación de fotos antes de subirlas.
 *
 * - Reduce la resolución (lado mayor ≤ MAX_SIDE) y recomprime a JPEG: las fotos de
 *   un móvil actual pesan 4-8 MB y superarían el límite de subida (5 MB).
 * - Al redibujar en un canvas se descartan los metadatos EXIF, incluida la
 *   ubicación GPS de quien tomó la foto (privacidad).
 * Los GIF se dejan tal cual (podrían ser animados). Si el navegador no puede
 * decodificar la imagen, se devuelve el archivo original y el servidor decide.
 */
const MAX_SIDE = 1600;
const QUALITY = 0.82;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export async function prepareImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    // imageOrientation: 'from-image' aplica la rotación EXIF antes de descartarla.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}

const AVATAR_SIDE = 512;

/**
 * Foto de perfil: recorte cuadrado centrado de AVATAR_SIDE px en JPEG (sin EXIF).
 * A diferencia de prepareImage, si el navegador no puede procesarla falla: el
 * bucket de avatares solo admite JPEG/PNG/WEBP pequeños.
 */
export async function prepareAvatar(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => {
    throw new Error('No se pudo leer la imagen. Prueba con otra foto (JPG o PNG).');
  });
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.min(AVATAR_SIDE, side);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen.');
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error('No se pudo procesar la imagen.');
  return new File([blob], 'avatar.jpg', { type: 'image/jpeg', lastModified: Date.now() });
}
