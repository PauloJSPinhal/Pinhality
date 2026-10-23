// ========================================
// backend/media.js - miniaturas, versões web e originais a pedido (Google Drive via rclone)
//
// A sincronização já não guarda os originais no servidor. Para cada imagem do Drive:
//   1. descarrega para uma pasta temporária (rclone copy)
//   2. lê o EXIF (exiftool) e guarda-o no manifesto e no photos.json
//   3. gera <nome>.webp de ~400px (miniatura) e ~1600px (web) com o sharp
//   4. apaga o original temporário
// O original completo é servido a pedido com "rclone cat" (com cache opcional em disco).
// ========================================
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');

let sharp = null;
try {
  sharp = require('sharp');
  sharp.cache(false);
  sharp.concurrency(1);
} catch (error) {
  console.error('⚠️ sharp indisponível: não é possível gerar miniaturas.', error.message);
}

const IMAGE_RE = /\.(jpe?g|png|webp|tiff?)$/i;
const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.tif': 'image/tiff', '.tiff': 'image/tiff'
};

const EXIF_ARGS = ['-j', '-DateTimeOriginal', '-ISOSpeedRatings', '-ISO', '-FNumber', '-ExposureTime', '-FocalLength',
  '-Make', '-Model', '-LensModel', '-ExposureProgram', '-MeteringMode', '-ExposureCompensation', '-WhiteBalance',
  '-FocusMode', '-Copyright', '-GPSLatitude', '-GPSLongitude', '-GPSLatitudeRef', '-GPSLongitudeRef'];

const EXIF_FIELDS = ['date', 'time', 'iso', 'aperture', 'shutterSpeed', 'focalLength', 'camera', 'lens',
  'exposureMode', 'meteringMode', 'exposureCompensation', 'whiteBalance', 'focusMode', 'copyright',
  'gpsLatitude', 'gpsLongitude'];

function parseExifData(data) {
  data = data || {};
  const result = {};
  
  if (data.DateTimeOriginal) {
    const [datePart, timePart] = data.DateTimeOriginal.split(' ');
    if (datePart && timePart) {
      const [y, m, d] = datePart.split(':');
      result.date = `${y}-${m}-${d}`;
      result.time = timePart;
    }
  }
  
  if (data.ISOSpeedRatings) result.iso = String(data.ISOSpeedRatings);
  else if (data.ISO) result.iso = String(data.ISO);
  
  if (data.FNumber) result.aperture = parseFloat(data.FNumber).toFixed(1);
  
  if (data.ExposureTime) {
    const et = String(data.ExposureTime);
    result.shutterSpeed = et.includes('/') ? et : `1/${Math.round(1 / parseFloat(et))}`;
  }
  
  if (data.FocalLength) {
    const flStr = String(data.FocalLength);
    const num = flStr.match(/[\d.]+/)?.[0];
    if (num) result.focalLength = num;
  }
  
  if (data.Make || data.Model) {
    let camera = '';
    const make = data.Make || '';
    const model = data.Model || '';
    
    if (model.toLowerCase().startsWith(make.toLowerCase())) {
      camera = model.trim();
    } else {
      camera = [make, model].filter(Boolean).join(' ').trim();
    }
    
    result.camera = camera;
  }
  
  if (data.LensModel) result.lens = data.LensModel;
  
  if (data.ExposureProgram !== undefined) {
    const modes = {
      0: 'Não definido', 1: 'Manual', 2: 'Automático',
      3: 'Prioridade Abertura', 4: 'Prioridade Velocidade',
      5: 'Criativo', 6: 'Ação', 7: 'Retrato', 8: 'Paisagem',
      'Manual': 'Manual', 'Program AE': 'Automático',
      'Aperture-priority AE': 'Prioridade Abertura',
      'Shutter speed priority AE': 'Prioridade Velocidade',
      'Creative (Slow speed)': 'Criativo', 'Action (High speed)': 'Ação',
      'Portrait': 'Retrato', 'Landscape': 'Paisagem'
    };
    result.exposureMode = modes[data.ExposureProgram] || data.ExposureProgram;
  }
  
  if (data.MeteringMode !== undefined) {
    const modes = {
      0: 'Desconhecido', 1: 'Média', 2: 'Ponderada ao Centro',
      3: 'Pontual', 4: 'Multi-Pontual', 5: 'Padrão', 6: 'Parcial', 255: 'Outro',
      'Average': 'Média', 'Center-weighted average': 'Ponderada ao Centro',
      'Spot': 'Pontual', 'Multi-spot': 'Multi-Pontual',
      'Multi-segment': 'Matricial', 'Pattern': 'Padrão', 'Partial': 'Parcial',
      'Evaluative': 'Matricial', 'Multi': 'Matricial'
    };
    result.meteringMode = modes[data.MeteringMode] || data.MeteringMode;
  }
  
  if (data.ExposureCompensation !== undefined) {
    const ev = parseFloat(data.ExposureCompensation);
    result.exposureCompensation = ev >= 0 ? `+${ev.toFixed(1)} EV` : `${ev.toFixed(1)} EV`;
  }
  
  if (data.WhiteBalance !== undefined) {
    const wb = { 0: 'Auto', 1: 'Manual' };
    result.whiteBalance = wb[data.WhiteBalance] || data.WhiteBalance;
  }
  
  if (data.FocusMode) result.focusMode = data.FocusMode;
  if (data.Copyright) result.copyright = data.Copyright;
  
  if (data.GPSLatitude && data.GPSLatitudeRef) {
    let lat = data.GPSLatitude;
    const latRef = data.GPSLatitudeRef;
    
    if (typeof lat === 'string') {
      lat = lat.replace(/deg/gi, '°').replace(/"/g, '"');
      result.gpsLatitude = `${latRef} ${lat}`;
    } else if (Array.isArray(lat) && lat.length === 3) {
      const [deg, min, sec] = lat;
      result.gpsLatitude = `${latRef} ${deg}° ${min}' ${sec.toFixed(1)}"`;
    } else {
      result.gpsLatitude = `${latRef} ${lat}`;
    }
  }
  
  if (data.GPSLongitude && data.GPSLongitudeRef) {
    let lon = data.GPSLongitude;
    const lonRef = data.GPSLongitudeRef;
    
    if (typeof lon === 'string') {
      lon = lon.replace(/deg/gi, '°').replace(/"/g, '"');
      result.gpsLongitude = `${lonRef} ${lon}`;
    } else if (Array.isArray(lon) && lon.length === 3) {
      const [deg, min, sec] = lon;
      result.gpsLongitude = `${lonRef} ${deg}° ${min}' ${sec.toFixed(1)}"`;
    } else {
      result.gpsLongitude = `${lonRef} ${lon}`;
    }
  }
  return result;
}

function readExif(file) {
  return new Promise((resolve) => {
    execFile('exiftool', [...EXIF_ARGS, file], { timeout: 30 * 1000, maxBuffer: 5 * 1024 * 1024 }, (error, stdout) => {
      if (error) return resolve({});
      try {
        resolve(parseExifData(JSON.parse(stdout)[0]));
      } catch {
        resolve({});
      }
    });
  });
}

function mimeFor(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

async function mapLimit(items, limit, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

// Permite subpastas (mãe/filha): "Viagens/lisboa-2024" - máx 2 níveis
function isValidFolderPathLocal(p) {
  if (typeof p !== 'string' || p.length === 0 || p.length > 200) return false;
  if (p.trim() !== p) return false;
  const segments = p.split('/');
  if (segments.length > 2) return false;
  for (const seg of segments) {
    if (!seg || seg === '.' || seg === '..' || seg.startsWith('-') || /[\x00-\x1f\x7f]/.test(seg)) return false;
  }
  return true;
}

function createMedia(opts) {
  const {
    photosDir, derivedDir, cacheDir, tmpBase = os.tmpdir(),
    cacheMb = 0, concurrency = 3, thumbSize = 400, webSize = 1600,
    keepLocalOriginals = false, maxOriginalStreams = 4,
    getRcloneSource, runRclone, rcloneEnvArgs, joinRemote, describeRcloneError, isValidName
  } = opts;

  const MANIFEST_FILE = path.join(derivedDir, 'manifest.json');
  let manifest = {};

  const keyOf = (col, file) => `${col}/${file}`;
  const thumbPath = (col, file) => path.join(derivedDir, col, 'thumb', `${file}.webp`);
  const webPath = (col, file) => path.join(derivedDir, col, 'web', `${file}.webp`);

  async function init() {
    await fs.mkdir(derivedDir, { recursive: true });
    await fs.rm(tmpBase, { recursive: true, force: true }).catch(() => {});
    try {
      manifest = JSON.parse(await fs.readFile(MANIFEST_FILE, 'utf8'));
    } catch {
      manifest = {};
    }
  }

  async function saveManifest() {
    const tmp = `${MANIFEST_FILE}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(manifest));
    await fs.rename(tmp, MANIFEST_FILE);
  }

  function parseImageUrl(imageUrl) {
    if (typeof imageUrl !== 'string') return null;
    const parts = imageUrl.replace(/^\/+/, '').split('/');
    // photos/<col>/<file> (3 partes) OU photos/<mãe>/<filha>/<file> (4 partes)
    if (parts.length === 3 && parts[0] === 'photos') {
      return { col: parts[1], file: parts[2] };
    }
    if (parts.length === 4 && parts[0] === 'photos') {
      return { col: `${parts[1]}/${parts[2]}`, file: parts[3] };
    }
    return null;
  }

  function entryFor(imageUrl) {
    const p = parseImageUrl(imageUrl);
    return p ? manifest[keyOf(p.col, p.file)] || null : null;
  }

  function urlsFor(imageUrl) {
    const p = parseImageUrl(imageUrl);
    const entry = p && manifest[keyOf(p.col, p.file)];
    if (!entry) return { thumbUrl: imageUrl, webUrl: imageUrl, originalUrl: p ? `photos/original/${p.col}/${p.file}` : imageUrl };
    return {
      thumbUrl: `photos/thumb/${p.col}/${p.file}.webp`,
      webUrl: `photos/web/${p.col}/${p.file}.webp`,
      originalUrl: `photos/original/${p.col}/${p.file}`,
      mediaVersion: entry.v,
      width: entry.width,
      height: entry.height,
      originalSize: entry.size
    };
  }

  function listEntries() {
    return Object.entries(manifest).map(([key, entry]) => {
      // lastIndexOf: para chaves como "Viagens/lisboa-2024/foto.jpg",
      // o último '/' separa a coleção ("Viagens/lisboa-2024") do ficheiro ("foto.jpg")
      const i = key.lastIndexOf('/');
      return { col: key.slice(0, i), file: key.slice(i + 1), entry };
    });
  }

  function derivedFile(kind, col, file) {
    if ((!isValidName(col) && !isValidFolderPathLocal(col)) || typeof file !== 'string' || !file.endsWith('.webp')) return null;
    const name = file.slice(0, -5);
    if (!isValidName(name) || !manifest[keyOf(col, name)]) return null;
    return kind === 'thumb' ? thumbPath(col, name) : webPath(col, name);
  }

  // ---------- Listagem do Drive ----------
  async function listRemote(src, scopeCol) {
    const remote = scopeCol ? joinRemote(src.remote, scopeCol) : src.remote;
    const result = await runRclone(['lsjson', '-R', '--hash', remote, '--retries', '2'], src, 5 * 60 * 1000);
    if (!result.ok) {
      const err = describeRcloneError(result);
      const e = new Error(err.message);
      e.code = err.code;
      throw e;
    }
    const items = JSON.parse(result.stdout || '[]');
    const folders = new Set();
    const files = [];
    // Identificar pastas-mãe (contentores com subpastas) para ignorar ficheiros diretos nelas
    const containerFolders = new Set();
    if (!scopeCol) {
      for (const item of items) {
        if (!item.IsDir) continue;
        const parts = item.Path.split('/');
        if (parts.length === 1) {
          // Pasta top-level: é contentor se tiver subpastas
          const hasSubdirs = items.some(i => i.IsDir && i.Path.startsWith(parts[0] + '/'));
          if (hasSubdirs) containerFolders.add(parts[0]);
        }
      }
    }
    for (const item of items) {
      if (item.IsDir) continue;
      const parts = item.Path.split('/');
      if (scopeCol) {
        // Com scopeCol: ficheiros diretos na pasta remota especificada
        if (parts.length !== 1) continue;
        files.push({ col: scopeCol, name: parts[0], item });
        folders.add(scopeCol);
      } else {
        // Sem scopeCol: suporta 2 níveis
        if (parts.length === 2) {
          // Formato antigo: top-level/ficheiro
          // Ignora se for pasta-mãe (contentor)
          if (containerFolders.has(parts[0])) continue;
          files.push({ col: parts[0], name: parts[1], item });
          folders.add(parts[0]);
        } else if (parts.length === 3) {
          // Formato novo: mãe/filha/ficheiro
          const folderPath = `${parts[0]}/${parts[1]}`;
          files.push({ col: folderPath, name: parts[2], item });
          folders.add(folderPath);
        }
        // parts.length === 1 (ficheiro na raiz) ou >3 (profundidade excessiva): ignora
      }
    }
    return {
      folders: [...folders].filter(f => isValidName(f) || isValidFolderPathLocal(f)),
      files: files
        .filter(f => (isValidName(f.col) || isValidFolderPathLocal(f.col)) && isValidName(f.name) && IMAGE_RE.test(f.name))
        .map(f => ({
          col: f.col, name: f.name, size: f.item.Size, modTime: f.item.ModTime,
          hash: (f.item.Hashes && (f.item.Hashes.md5 || f.item.Hashes.sha1)) || null
        }))
    };
  }

  function isUnchanged(f) {
    const entry = manifest[keyOf(f.col, f.name)];
    if (!entry) return false;
    const same = (entry.hash && f.hash) ? entry.hash === f.hash : (entry.size === f.size && entry.modTime === f.modTime);
    return same && fsSync.existsSync(thumbPath(f.col, f.name)) && fsSync.existsSync(webPath(f.col, f.name));
  }

  async function removeDerived(col, file) {
    await fs.rm(thumbPath(col, file), { force: true });
    await fs.rm(webPath(col, file), { force: true });
    delete manifest[keyOf(col, file)];
  }

  async function writeWebp(input, output, size, fit, quality) {
    const tmp = `${output}.tmp`;
    const info = await sharp(input, { failOn: 'none' })
      .rotate()
      .resize({ width: size, height: size, fit, withoutEnlargement: true })
      .webp({ quality, effort: 4 })
      .toFile(tmp);
    await fs.rename(tmp, output);
    return info;
  }

  async function processOne(f, tmpFile) {
    const exif = await readExif(tmpFile);
    const meta = await sharp(tmpFile, { failOn: 'none' }).metadata();
    const swap = meta.orientation && meta.orientation >= 5;
    await fs.mkdir(path.dirname(thumbPath(f.col, f.name)), { recursive: true });
    await fs.mkdir(path.dirname(webPath(f.col, f.name)), { recursive: true });
    const thumb = await writeWebp(tmpFile, thumbPath(f.col, f.name), thumbSize, 'outside', 72);
    const web = await writeWebp(tmpFile, webPath(f.col, f.name), webSize, 'inside', 82);
    manifest[keyOf(f.col, f.name)] = {
      size: f.size, modTime: f.modTime, hash: f.hash,
      width: swap ? meta.height : meta.width,
      height: swap ? meta.width : meta.height,
      thumbBytes: thumb.size, webBytes: web.size,
      exif,
      v: crypto.createHash('sha1').update(`${f.hash || ''}${f.size}${f.modTime}`).digest('hex').slice(0, 10),
      processedAt: new Date().toISOString()
    };
    // Formato antigo: o original local deixa de ser necessário
    if (!keepLocalOriginals) {
      await fs.rm(path.join(photosDir, f.col, f.name), { force: true }).catch(() => {});
    }
    return thumb.size + web.size;
  }

  // ---------- Tarefa de sincronização (uma de cada vez) ----------
  let job = null;

  function jobStatus() {
    return job ? { ...job, failed: job.failed.slice(0, 50) } : { running: false };
  }

  async function runSync(scopeCol, afterSync, scopeColsBatch) {
    const colsToSync = Array.isArray(scopeColsBatch) && scopeColsBatch.length > 0 
      ? scopeColsBatch 
      : (scopeCol ? [scopeCol] : [null]);
    
    if (job && job.running) {
      const e = new Error('Já está a decorrer uma sincronização.');
      e.code = 'SYNC_RUNNING';
      throw e;
    }
    job = {
      running: true, 
      scope: colsToSync.length === 1 ? (colsToSync[0] || 'todas') : `${colsToSync.length} coleções`,
      phase: 'a listar o Drive',
      startedAt: new Date().toISOString(), finishedAt: null,
      listed: 0, total: 0, done: 0, processed: 0, skipped: 0, removed: 0, failed: [],
      bytesOriginal: 0, bytesDerived: 0, error: null, code: null, db: null
    };
    const current = job;
    const promise = (async () => {
      let tmpDir = null;
      try {
        if (!sharp) throw Object.assign(new Error('sharp indisponível no servidor'), { code: 'SHARP_MISSING' });
        const src = await getRcloneSource();
        if (!src) throw Object.assign(new Error('A ligação ao Google Drive ainda não está configurada.'), { code: 'RCLONE_NOT_CONFIGURED' });

        const { folders: allFolders, files: allFiles } = await listRemote(src, null);
        if (colsToSync[0] === null && allFolders.length === 0) {
          throw Object.assign(new Error(`A pasta remota ${src.remote} não tem subpastas.`), { code: 'RCLONE_EMPTY' });
        }
        
        let filesToProcess = allFiles;
        if (colsToSync[0] !== null) {
          filesToProcess = allFiles.filter(f => colsToSync.includes(f.col));
        }
        current.listed = filesToProcess.length;

        const remoteKeys = new Set(filesToProcess.map(f => keyOf(f.col, f.name)));
        for (const { col, file } of listEntries()) {
          if (colsToSync[0] !== null && !colsToSync.includes(col)) continue;
          if (!remoteKeys.has(keyOf(col, file))) {
            await removeDerived(col, file);
            current.removed++;
          }
        }

        const todo = filesToProcess.filter(f => !isUnchanged(f));
        current.skipped = filesToProcess.length - todo.length;
        current.total = todo.length;
        current.phase = todo.length ? 'a processar' : 'sem alterações';

        await fs.mkdir(tmpBase, { recursive: true });
        const chunkSize = Math.max(concurrency * 4, 8);
        for (let start = 0; start < todo.length; start += chunkSize) {
          const chunk = todo.slice(start, start + chunkSize);
          tmpDir = await fs.mkdtemp(path.join(tmpBase, 'pinhality-sync-'));
          const listFile = path.join(tmpDir, '.files');
          await fs.writeFile(listFile, chunk.map(f => keyOf(f.col, f.name)).join('\n') + '\n');
          const dl = await runRclone(['copy', src.remote, path.join(tmpDir, 'files'), '--files-from-raw', listFile,
            '--no-traverse', '--transfers', String(concurrency), '--retries', '2'], src, 30 * 60 * 1000);
          if (!dl.ok) {
            const err = describeRcloneError(dl);
            if (err.code === 'RCLONE_AUTH') throw Object.assign(new Error(err.message), { code: err.code });
          }
          await mapLimit(chunk, concurrency, async (f) => {
            const tmpFile = path.join(tmpDir, 'files', f.col, f.name);
            try {
              await fs.access(tmpFile);
              const derivedBytes = await processOne(f, tmpFile);
              current.bytesDerived += derivedBytes;
              current.bytesOriginal += f.size || 0;
              current.processed++;
            } catch (error) {
              current.failed.push({ file: keyOf(f.col, f.name), error: error.code === 'ENOENT' ? 'não foi possível descarregar' : error.message });
            } finally {
              current.done++;
            }
          });
          await saveManifest();
          await fs.rm(tmpDir, { recursive: true, force: true });
          tmpDir = null;
        }
        await saveManifest();

        current.phase = 'a atualizar a base de dados';
        if (afterSync) current.db = await afterSync();
        current.phase = 'concluído';
      } catch (error) {
        current.error = error.message;
        current.code = error.code || 'SYNC_ERROR';
        current.phase = 'erro';
        console.error('❌ Sincronização:', error.message);
        await saveManifest().catch(() => {});
      } finally {
        if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        current.running = false;
        current.finishedAt = new Date().toISOString();
        console.log(`☁️ Sincronização ${current.scope}: ${current.processed} processadas, ${current.skipped} sem alterações, ${current.removed} removidas, ${current.failed.length} falhadas`);
      }
      return jobStatus();
    })();
    return { job: jobStatus(), promise };
  }

  // ---------- Originais a pedido ----------
  async function evictCache() {
    if (!(cacheMb > 0)) return;
    const cap = cacheMb * 1024 * 1024;
    const names = await fs.readdir(cacheDir).catch(() => []);
    const files = [];
    for (const name of names) {
      if (name.endsWith('.tmp')) continue;
      const st = await fs.stat(path.join(cacheDir, name)).catch(() => null);
      if (st) files.push({ name, size: st.size, t: st.mtimeMs });
    }
    let total = files.reduce((s, f) => s + f.size, 0);
    files.sort((a, b) => a.t - b.t);
    for (const f of files) {
      if (total <= cap) break;
      await fs.rm(path.join(cacheDir, f.name), { force: true });
      total -= f.size;
    }
  }

  let activeStreams = 0;

  async function serveOriginal(req, res, col, file, { stripGps = false } = {}) {
    if ((!isValidName(col) && !isValidFolderPathLocal(col)) || !isValidName(file) || !IMAGE_RE.test(file)) {
      return res.status(400).json({ error: 'Caminho inválido' });
    }
    const disposition = `${req.query.download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(file)}`;
    const local = path.join(photosDir, col, file);
    const hasLocal = fsSync.existsSync(local);
    const entry = manifest[keyOf(col, file)];
    if (!hasLocal && !entry) return res.status(404).json({ error: 'Foto não encontrada' });

    if (activeStreams >= maxOriginalStreams) {
      res.setHeader('Retry-After', '5');
      return res.status(503).json({ error: 'Servidor ocupado. Tente novamente dentro de alguns segundos.' });
    }
    activeStreams++;
    let released = false;
    const release = () => { if (!released) { released = true; activeStreams--; } };
    res.on('close', release);

    const headers = {
      'Content-Type': mimeFor(file),
      'Content-Disposition': disposition,
      'Cache-Control': 'private, max-age=3600'
    };

    let source = null;
    let child = null;
    let knownSize = null;
    let stderr = '';
    const cacheFile = entry
      ? path.join(cacheDir, `${crypto.createHash('sha1').update(`${keyOf(col, file)}:${entry.v}`).digest('hex')}${path.extname(file).toLowerCase()}`)
      : null;

    if (hasLocal) {
      source = fsSync.createReadStream(local);
      knownSize = (await fs.stat(local)).size;
    } else if (cacheMb > 0 && fsSync.existsSync(cacheFile)) {
      const now = new Date();
      await fs.utimes(cacheFile, now, now).catch(() => {});
      source = fsSync.createReadStream(cacheFile);
      knownSize = (await fs.stat(cacheFile)).size;
    } else {
      const src = await getRcloneSource();
      if (!src) { release(); return res.status(503).json({ error: 'Original indisponível de momento.' }); }
      const { env, args } = rcloneEnvArgs(src);
      child = spawn('rclone', ['cat', joinRemote(joinRemote(src.remote, col), file), ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
      child.stderr.on('data', d => { stderr += d; if (stderr.length > 4000) stderr = stderr.slice(-4000); });
      child.on('error', () => {});
      source = child.stdout;
      knownSize = entry.size;
    }

    let cacheStream = null;
    let cacheTmp = null;
    let cachedBytes = 0;
    if (child && cacheMb > 0) {
      await fs.mkdir(cacheDir, { recursive: true });
      cacheTmp = `${cacheFile}.${process.pid}.${Date.now()}.tmp`;
      cacheStream = fsSync.createWriteStream(cacheTmp);
      source.on('data', (chunk) => { cachedBytes += chunk.length; cacheStream.write(chunk); });
    }

    let output = source;
    let exif = null;
    if (stripGps) {
      exif = spawn('exiftool', ['-q', '-q', '-gps:all=', '-xmp:geotag=', '-o', '-', '-'], { stdio: ['pipe', 'pipe', 'ignore'] });
      exif.on('error', () => {});
      exif.stdin.on('error', () => {});
      source.pipe(exif.stdin);
      output = exif.stdout;
    } else if (knownSize !== null) {
      headers['Content-Length'] = knownSize;
    }

    let started = false;
    let sent = 0;
    output.on('data', (chunk) => {
      if (!started) {
        started = true;
        res.writeHead(200, headers);
      }
      sent += chunk.length;
      if (!res.write(chunk)) output.pause();
    });
    res.on('drain', () => output.resume());
    res.on('close', () => {
      if (child && child.exitCode === null) child.kill();
      if (exif && exif.exitCode === null) exif.kill();
      if (!child && source.destroy) source.destroy();
    });

    const finished = new Promise((resolve) => {
      let pending = 1 + (child ? 1 : 0);
      let childCode = 0;
      const done = () => { if (--pending === 0) resolve(childCode); };
      output.on('end', done);
      output.on('error', done);
      if (child) child.on('close', (code) => { childCode = code; done(); });
    });
    const childCode = await finished;

    if (cacheStream) {
      const ok = childCode === 0 && cachedBytes === entry.size;
      cacheStream.end(async () => {
        if (ok) {
          await fs.rename(cacheTmp, cacheFile).catch(() => {});
          await evictCache().catch(() => {});
        } else {
          await fs.rm(cacheTmp, { force: true }).catch(() => {});
        }
      });
    }
    release();
    if (!started) {
      if (!res.headersSent) {
        if (stderr) console.error('Erro ao obter original:', describeRcloneError({ stderr, error: null }).message);
        res.status(502).json({ error: 'Não foi possível obter o original.' });
      }
      return;
    }
    res.end();
  }

  return {
    init, urlsFor, entryFor, listEntries, derivedFile, runSync, jobStatus, serveOriginal,
    readExif, parseImageUrl, EXIF_FIELDS, IMAGE_RE,
    sharpAvailable: () => !!sharp
  };
}

module.exports = { createMedia, parseExifData, readExif, EXIF_FIELDS, IMAGE_RE };