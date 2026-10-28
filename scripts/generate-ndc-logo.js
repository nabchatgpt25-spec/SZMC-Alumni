import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

/**
 * Generates PNG, JPG, and PWA icon formats directly from the authentic,
 * unmodified official Notre Dame College, Dhaka monogram (public/ndc-logo.svg)
 * without altering the logo design.
 */
async function main() {
  const publicDir = path.resolve(process.cwd(), 'public');
  const srcAssetsDir = path.resolve(process.cwd(), 'src/assets');
  const distDir = path.resolve(process.cwd(), 'dist');

  const sourcePath = path.join(publicDir, 'szmc-logo.png');
  const sourceBuffer = fs.readFileSync(sourcePath);

  // Sync PNG to src/assets/szmc-logo.png
  fs.writeFileSync(path.join(srcAssetsDir, 'szmc-logo.png'), sourceBuffer);

  // Render high-resolution PNGs from the authentic SZMC emblem
  const png512 = await sharp(sourceBuffer)
    .resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();

  const png192 = await sharp(sourceBuffer)
    .resize(192, 192, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();

  fs.writeFileSync(path.join(publicDir, 'ndc-logo.png'), png512);
  fs.writeFileSync(path.join(srcAssetsDir, 'ndc-logo.png'), png512);
  fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), png192);
  fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), png512);
  fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), png512);
  fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), png192);

  if (fs.existsSync(distDir)) {
    fs.writeFileSync(path.join(distDir, 'szmc-logo.png'), sourceBuffer);
    fs.writeFileSync(path.join(distDir, 'apple-touch-icon.png'), png192);
  }

  console.log('Synced all PNG and PWA icons from authentic SZMC logo');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
