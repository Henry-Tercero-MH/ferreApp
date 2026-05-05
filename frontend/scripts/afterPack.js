import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const winBinary = path.join(__dirname, '../resources/win/better_sqlite3.node');
  const targetDir = path.join(
    context.appOutDir,
    'resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release'
  );
  const targetFile = path.join(targetDir, 'better_sqlite3.node');

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  fs.copyFileSync(winBinary, targetFile);
  console.log('✓ better_sqlite3.node reemplazado por binario Windows (ABI 145)');
}
