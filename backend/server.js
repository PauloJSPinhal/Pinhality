// ========================================
// backend/server.js - API + frontend num só contentor
// ========================================
const express = require('express');
const helmet = require('helmet');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { createMedia } = require('./media');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const PHOTOS_DIR = path.resolve(process.env.PHOTOS_DIR || '/dados_privados/fotos_gdrive');

const DATA_DIR = path.resolve(process.env.DATA_DIR || __dirname);
const SEED_DIR = path.resolve(process.env.SEED_DIR || path.join(__dirname, 'seed'));
const DATA_FILE = path.join(DATA_DIR, 'photos.json');
const COLLECTIONS_FILE = path.join(DATA_DIR, 'collections.json');
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const ORPHANS_FILE = path.join(DATA_DIR, 'orphans.json');

const PRIVATE_DIR = path.resolve(process.env.PRIVATE_DIR || path.join(DATA_DIR, 'private'));
const RCLONE_CONF = path.join(PRIVATE_DIR, 'rclone.conf');
const RCLONE_STATE = path.join(PRIVATE_DIR, 'rclone-state.json');
const SESSION_SECRET_FILE = path.join(PRIVATE_DIR, 'session_secret');
const LEGACY_RCLONE_CONF = process.env.LEGACY_RCLONE_CONF || path.join(path.dirname(PHOTOS_DIR), 'rclone.conf');
const REMOTE_NAME = 'gdrive';
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || ''; // URL do Web App do Apps Script
const DERIVED_DIR = path.resolve(process.env.DERIVED_DIR || path.join(path.dirname(PHOTOS_DIR), 'derivados'));
const ORIGINAL_CACHE_DIR = path.resolve(process.env.ORIGINAL_CACHE_DIR || path.join(path.dirname(PHOTOS_DIR), 'cache-originais'));
const ORIGINAL_CACHE_MB = Math.max(0, Number(process.env.ORIGINAL_CACHE_MB || 0) || 0);
const ORIGINALS_PUBLIC = !/^(0|false|no|nao|não)$/i.test(process.env.ORIGINALS_PUBLIC || 'true');
const KEEP_LOCAL_ORIGINALS = /^(1|true|yes|sim)$/i.test(process.env.KEEP_LOCAL_ORIGINALS || 'false');
const SYNC_CONCURRENCY = Math.min(8, Math.max(1, Number(process.env.SYNC_CONCURRENCY || 3) || 3));
const SHOW_GPS = /^(1|true|yes|sim)$/i.test(process.env.SHOW_GPS || 'false');
const MAX_ORIGINAL_STREAMS = Math.max(1, Number(process.env.MAX_ORIGINAL_STREAMS || 4) || 4);

// ========================================
// VALIDAÇÕES (precisam de estar antes de createMedia)
// ========================================

function isValidCollectionName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 200 &&
    name.trim() === name && name !== '.' && name !== '..' &&
    !name.startsWith('-') && !/[\/\\\x00-\x1f\x7f]/.test(name);
}

// Validação de folderPath (permite subpastas com barra): "Viagens/lisboa-2024" - máx 2 níveis
function isValidFolderPath(folderPath) {
  if (typeof folderPath !== 'string' || folderPath.length === 0 || folderPath.length > 200) return false;
  if (folderPath.trim() !== folderPath) return false;
  const segments = folderPath.split('/');
  if (segments.length > 2) return false;
  for (const seg of segments) {
    if (!seg || seg === '.' || seg === '..' || seg.startsWith('-') || /[\x00-\x1f\x7f]/.test(seg)) return false;
  }
  return true;
}

// Gerar ID único para fotos (evitar colisões)
function generatePhotoId() {
  return Date.now() + parseInt(crypto.randomBytes(2).toString('hex'), 16) / 65536;
}

const media = createMedia({
  photosDir: PHOTOS_DIR,
  derivedDir: DERIVED_DIR,
  cacheDir: ORIGINAL_CACHE_DIR,
  tmpBase: process.env.SYNC_TMP_DIR || path.join(path.dirname(PHOTOS_DIR), 'tmp-sync'),
  cacheMb: ORIGINAL_CACHE_MB,
  concurrency: SYNC_CONCURRENCY,
  thumbSize: Number(process.env.THUMB_SIZE || 400) || 400,
  webSize: Number(process.env.WEB_SIZE || 1600) || 1600,
  keepLocalOriginals: KEEP_LOCAL_ORIGINALS,
  maxOriginalStreams: MAX_ORIGINAL_STREAMS,
  getRcloneSource: (...a) => getRcloneSource(...a),
  runRclone: (...a) => runRclone(...a),
  rcloneEnvArgs: (...a) => rcloneEnvArgs(...a),
  joinRemote: (...a) => joinRemote(...a),
  describeRcloneError: (...a) => describeRcloneError(...a),
  isValidName: (...a) => isValidCollectionName(...a)
});

const FRONTEND_DIR = path.resolve(process.env.FRONTEND_DIR || path.join(__dirname, 'public'));

const COOKIE_NAME = 'pinhality_session';
const COOKIE_SECURE = (process.env.COOKIE_SECURE || 'auto').toLowerCase();
const SESSION_TTL_MS = Math.max(1, Number(process.env.SESSION_TTL_HOURS || 168) || 168) * 60 * 60 * 1000;

// ========================================
// SEGURANÇA DOS PEDIDOS
// ========================================

app.set('trust proxy', process.env.TRUST_PROXY || 'loopback, linklocal, uniquelocal');
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      mediaSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      manifestSrc: ["'self'"],
      workerSrc: ["'self'"]
    }
  },
  strictTransportSecurity: false,
  referrerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  xFrameOptions: { action: 'deny' }
}));
app.use((req, res, next) => {
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  next();
});

app.use(express.json({ limit: '1mb' }));

app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') {
    return res.status(403).json({ error: 'Pedido recusado (origem diferente).', code: 'CROSS_SITE' });
  }
  next();
});

// ========================================
// IMAGENS — rotas específicas para thumb/web/original (ANTES das gerais)
// ========================================

for (const kind of ['thumb', 'web']) {
  app.get(`/photos/${kind}/*`, (req, res) => {
    const fullPath = req.params[0];
    const lastSlash = fullPath.lastIndexOf('/');
    if (lastSlash === -1) return res.status(404).end();
    const col = fullPath.slice(0, lastSlash);
    const file = fullPath.slice(lastSlash + 1);
    const fileObj = media.derivedFile(kind, col, file);
    if (!fileObj) return res.status(404).end();
    res.sendFile(fileObj, { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=604800' } });
  });
}

app.get('/photos/original/*', (req, res, next) => {
  if (!ORIGINALS_PUBLIC) return requireAdmin(req, res, next);
  next();
}, (req, res) => {
  const fullPath = req.params[0];
  const lastSlash = fullPath.lastIndexOf('/');
  if (lastSlash === -1) return res.status(404).json({ error: 'Caminho inválido' });
  const col = fullPath.slice(0, lastSlash);
  const file = fullPath.slice(lastSlash + 1);
  const stripGps = !SHOW_GPS && !getSession(req);
  media.serveOriginal(req, res, col, file, { stripGps }).catch((error) => {
    console.error('Erro ao servir original:', error.message);
    if (!res.headersSent) res.status(500).json({ error: 'Erro ao obter o original' });
  });
});

app.use('/photos', (req, res, next) => {
  if (req.path.startsWith('/thumb/') || req.path.startsWith('/web/') || req.path.startsWith('/original/')) {
    return res.status(404).end();
  }
  if (!media.IMAGE_RE.test(req.path)) return res.status(404).end();
  next();
}, express.static(PHOTOS_DIR, { dotfiles: 'ignore', index: false, redirect: false }));

// ========================================
// AUTENTICAÇÃO - token assinado (HMAC) em cookie httpOnly
// ========================================
let sessionSecret = null;

async function loadSessionSecret() {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 16) {
    sessionSecret = fromEnv;
    return;
  }
  if (fromEnv) console.warn('⚠️ SESSION_SECRET tem menos de 16 caracteres; a usar um segredo gerado.');
  await fs.mkdir(PRIVATE_DIR, { recursive: true, mode: 0o700 });
  try {
    sessionSecret = (await fs.readFile(SESSION_SECRET_FILE, 'utf8')).trim();
  } catch {}
  if (!sessionSecret || sessionSecret.length < 32) {
    sessionSecret = crypto.randomBytes(48).toString('hex');
    await fs.writeFile(SESSION_SECRET_FILE, sessionSecret, { mode: 0o600 });
    console.log('🔐 Segredo de sessão gerado e guardado em', SESSION_SECRET_FILE);
  }
}

function signingKey() {
  return crypto.createHmac('sha256', sessionSecret)
    .update(`${process.env.ADMIN_USER || ''}\u0000${process.env.ADMIN_PASS || ''}`)
    .digest();
}

function sign(data) {
  return crypto.createHmac('sha256', signingKey()).update(data).digest('base64url');
}

function createToken(username) {
  const payload = Buffer.from(JSON.stringify({
    u: username,
    exp: Date.now() + SESSION_TTL_MS,
    jti: crypto.randomBytes(12).toString('base64url')
  })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

const revokedTokens = new Map();

function verifyToken(token) {
  if (typeof token !== 'string' || !token || token.length > 1000) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Date.now()) return null;
    if (data.jti && revokedTokens.has(data.jti)) return null;
    return data;
  } catch {
    return null;
  }
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

function getSession(req) {
  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  return verifyToken(bearer) || verifyToken(readCookie(req, COOKIE_NAME));
}

function requireAdmin(req, res, next) {
  const session = getSession(req);
  if (!session) {
    return res.status(401).json({ error: 'Sessão inválida ou expirada. Inicie sessão novamente.', code: 'UNAUTHORIZED' });
  }
  req.admin = session;
  next();
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const WEAK_PASSWORDS = new Set(['admin', 'password', 'teste', 'test', '1234', '12345', '123456', '12345678', 'changeme', 'pinhality']);
function adminLoginProblem() {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASS;
  if (!user || !pass) return 'ADMIN_USER e ADMIN_PASS não estão definidos no servidor.';
  if (IS_PRODUCTION && (pass.length < 8 || WEAK_PASSWORDS.has(pass.toLowerCase()) || pass === user)) {
    return 'A palavra-passe de administração é demasiado fraca para produção (mínimo 8 caracteres, não óbvia). Altere ADMIN_PASS no Coolify.';
  }
  return null;
}

const loginFailures = new Map();
function tooManyAttempts(ip) {
  const entry = loginFailures.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.first > 15 * 60 * 1000) {
    loginFailures.delete(ip);
    return false;
  }
  return entry.count >= 10;
}
function registerFailure(ip) {
  const entry = loginFailures.get(ip);
  if (!entry || Date.now() - entry.first > 15 * 60 * 1000) loginFailures.set(ip, { count: 1, first: Date.now() });
  else entry.count++;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, e] of loginFailures) if (now - e.first > 15 * 60 * 1000) loginFailures.delete(ip);
  for (const [jti, exp] of revokedTokens) if (exp < now) revokedTokens.delete(jti);
}, 10 * 60 * 1000).unref();

// ========================================
// VALIDAÇÃO DOS DADOS RECEBIDOS
// ========================================
const PHOTO_TEXT_FIELDS = {
  title: 300, location: 300, description: 5000, peopleNotes: 2000, date: 10, time: 8,
  aperture: 20, iso: 20, shutterSpeed: 20, focalLength: 20, camera: 200, lens: 200,
  exposureMode: 100, meteringMode: 100, exposureCompensation: 30, whiteBalance: 100, focusMode: 100,
  copyright: 300, gpsLatitude: 100, gpsLongitude: 100
};
const GPS_FIELDS = ['gpsLatitude', 'gpsLongitude'];

function cleanText(value, max) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, max);
}

function normalizePeopleNotes(value) {
  return cleanText(value, 2000)
    .split(',')
    .map(name => name.replace(/^[#\s]+/, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map(name => `#${name}`)
    .join(', ');
}

function validatePhotoInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Dados inválidos' };
  const photo = {};
  for (const [field, max] of Object.entries(PHOTO_TEXT_FIELDS)) {
    if (body[field] !== undefined) photo[field] = cleanText(body[field], max);
  }
  if (photo.peopleNotes !== undefined) photo.peopleNotes = normalizePeopleNotes(photo.peopleNotes);
  if (!photo.title || !photo.title.trim()) return { error: 'O título é obrigatório' };
  const url = String(body.imageUrl || '');
  const parts = url.split('/');
  const validPaths = [
    parts.length === 2 && parts[0] === 'photos' && media.IMAGE_RE.test(parts[1]),
    parts.length === 3 && parts[0] === 'photos' && isValidCollectionName(parts[1]) && media.IMAGE_RE.test(parts[2]),
    parts.length === 4 && parts[0] === 'photos' && isValidCollectionName(parts[1]) && isValidCollectionName(parts[2]) && media.IMAGE_RE.test(parts[3])
  ];
  if (!validPaths.some(Boolean)) {
    return { error: 'Caminho da imagem inválido (photos/<coleção>/<ficheiro>)' };
  }
  photo.imageUrl = url;
  if (body.collection === null || body.collection === undefined || body.collection === '') photo.collection = null;
  else if (isValidFolderPath(String(body.collection))) photo.collection = String(body.collection);
  else return { error: 'Coleção inválida' };
  photo.orphaned = photo.collection === null && body.orphaned === true;
  if (body.pendingDriveDelete !== undefined) photo.pendingDriveDelete = !!body.pendingDriveDelete;
  if (body.categories !== undefined) {
    if (!Array.isArray(body.categories)) return { error: 'Categorias inválidas' };
    photo.categories = body.categories.filter(c => typeof c === 'string').map(c => cleanText(c, 100)).slice(0, 50);
  }
  if (body.isFavorite !== undefined) photo.isFavorite = !!body.isFavorite;
  if (body.timestamp !== undefined) photo.timestamp = Number(body.timestamp) || Date.now();
  if (body.id !== undefined) {
    if (!(typeof body.id === 'number' && Number.isFinite(body.id)) && !(typeof body.id === 'string' && /^[0-9.]{1,40}$/.test(body.id))) {
      return { error: 'ID inválido' };
    }
    photo.id = body.id;
  }
  return { photo };
}

function validCategoryName(name) {
  return typeof name === 'string' && name.trim().length > 0 && name.length <= 100 && !/[\u0000-\u001f\u007f]/.test(name);
}

function normalizeCategoryName(name) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-PT');
}

function publicView(req, obj) {
  if (getSession(req)) return obj;
  const copy = { ...obj };
  delete copy.peopleNotes;
  if (!SHOW_GPS) {
    for (const f of GPS_FIELDS) delete copy[f];
  }
  return copy;
}

function addUnassignedCollectionOrphans(orphans, collections, photos) {
  const result = orphans.filter(orphan => orphan.reason !== 'no-photos');
  for (const collection of collections) {
    const folderPath = collection.folderPath || collection.id;
    const hasAssignedPhotos = photos.some(photo =>
      !photo.orphaned &&
      (photo.collection === collection.id || photo.collection === folderPath)
    );
    if (!hasAssignedPhotos) {
      result.push({
        folderPath,
        reason: 'no-photos',
        message: 'Esta pasta não tem fotografias associadas a uma coleção no site. Os ficheiros continuam no Google Drive.'
      });
    }
  }
  return result;
}

// Filtra órfãs que já não existem no arquivo de coleções
// (i.e., pastas que já foram removidas do Drive)
function filterValidOrphans(orphans, collections) {
  const validCollectionPaths = new Set(
    collections.map(col => col.folderPath || col.id)
  );
  
  return orphans.filter(orphan => {
    if (orphan.reason === 'no-photos') {
      // Órfãs 'no-photos' devem corresponder a uma coleção real
      return validCollectionPaths.has(orphan.folderPath);
    }
    // Outros tipos de órfãs (empty, too-deep, mixed) são mantidos
    // pois representam problemas estruturais reais no Drive
    return true;
  });
}

// ========================================
// INICIALIZAÇÃO DE FICHEIROS
// ========================================
async function initDataFiles() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(PHOTOS_DIR, { recursive: true }).catch(() => {});
  for (const name of ['photos.json', 'collections.json', 'categories.json', 'settings.json']) {
    const target = path.join(DATA_DIR, name);
    try {
      await fs.access(target);
    } catch {
      try {
        await fs.copyFile(path.join(SEED_DIR, name), target);
        console.log(`📁 ${name} copiado dos dados iniciais`);
      } catch {}
    }
  }

  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify([], null, 2));
    console.log('📁 Ficheiro photos.json criado');
  }

  try {
    await fs.access(COLLECTIONS_FILE);
    const colsData = JSON.parse(await fs.readFile(COLLECTIONS_FILE, 'utf8'));
    let migrated = false;
    for (const col of colsData) {
      if (!col.folderPath) {
        col.folderPath = col.id;
        migrated = true;
      }
    }
    if (migrated) {
      await fs.writeFile(COLLECTIONS_FILE, JSON.stringify(colsData, null, 2));
      console.log('🔄 Coleções migradas: folderPath adicionado');
    }
  } catch {
    await fs.writeFile(COLLECTIONS_FILE, JSON.stringify([], null, 2));
    console.log('📁 Ficheiro collections.json criado');
  }

  try {
    await fs.access(CATEGORIES_FILE);
    await migrateCategoriesFile();
  } catch {
    const defaultData = getDefaultCategoriesData();
    await fs.writeFile(CATEGORIES_FILE, JSON.stringify(defaultData, null, 2));
    console.log('📁 Ficheiro categories.json criado (novo formato com grupos)');
  }

  try {
    await fs.access(SETTINGS_FILE);
  } catch {
    await fs.writeFile(SETTINGS_FILE, JSON.stringify({ activeCollection: null, lastUpdated: new Date() }, null, 2));
    console.log('📁 Ficheiro settings.json criado');
  }
}

// ========================================
// ROTAS - SETTINGS
// ========================================

app.get('/api/settings', async (req, res) => {
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf8');
    const settings = JSON.parse(data);
    res.json(settings);
  } catch (error) {
    console.error('Erro ao ler settings:', error);
    res.status(500).json({ error: 'Erro ao ler configurações' });
  }
});

app.put('/api/settings/active-collection', requireAdmin, async (req, res) => {
  try {
    const { collectionId } = req.body || {};
    if (collectionId !== null && collectionId !== undefined &&
        !isValidCollectionName(collectionId) && !isValidFolderPath(collectionId)) {
      return res.status(400).json({ error: 'Coleção inválida' });
    }
    const settings = {
      activeCollection: collectionId,
      lastUpdated: new Date()
    };
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    console.log(`✅ Coleção ativa definida: ${collectionId || 'Todos'}`);
    res.json(settings);
  } catch (error) {
    console.error('Erro ao definir coleção ativa:', error);
    res.status(500).json({ error: 'Erro ao definir coleção ativa' });
  }
});

// ========================================
// SCAN DE ORFÃOS NO GOOGLE DRIVE
// ========================================
async function scanDriveOrphans(src, scopeCol = null) {
  const orphans = [];
  const remote = scopeCol ? joinRemote(src.remote, scopeCol) : src.remote;
  const result = await runRclone(['lsjson', '-R', remote, '--retries', '1'], src, 60 * 1000);
  if (!result.ok) return orphans;

  const items = JSON.parse(result.stdout || '[]');
  const dirInfo = new Map();
  const prefix = scopeCol ? scopeCol.split('/') : [];

  for (const item of items) {
    const parts = [...prefix, ...item.Path.split('/').filter(Boolean)];
    if (parts.length === 0) continue;

    if (item.IsDir) {
      const path = parts.join('/');
      if (!dirInfo.has(path)) dirInfo.set(path, { files: 0, subdirs: new Set() });
      if (parts.length > 1) {
        const parent = parts.slice(0, -1).join('/');
        if (!dirInfo.has(parent)) dirInfo.set(parent, { files: 0, subdirs: new Set() });
        dirInfo.get(parent).subdirs.add(parts[parts.length - 1]);
      }
    } else {
      const parent = parts.length === prefix.length + 1
        ? prefix.join('/')
        : parts.slice(0, -1).join('/');
      if (!parent) continue;
      if (!dirInfo.has(parent)) dirInfo.set(parent, { files: 0, subdirs: new Set() });
      dirInfo.get(parent).files++;
    }
  }

  for (const [path, info] of dirInfo) {
    const depth = path.split('/').length;
    if (depth > 2) {
      orphans.push({ folderPath: path, reason: 'too-deep', message: `Pasta tem subpastas além do nível permitido (2 níveis).` });
    } else if (info.files > 0 && info.subdirs.size > 0) {
      orphans.push({ folderPath: path, reason: 'mixed', message: `Pasta mistura fotos e subpastas. As fotos foram importadas, mas deve organizar a pasta.` });
    } else if (info.files === 0 && info.subdirs.size === 0) {
      orphans.push({ folderPath: path, reason: 'empty', message: `Pasta vazia no Drive.` });
    }
  }
  return orphans;
}

async function scanFoldersRecursive(baseDir, maxDepth = 2, currentDepth = 0, currentPath = '') {
  const collections = [];
  const orphans = [];
  const items = await fs.readdir(baseDir, { withFileTypes: true }).catch(() => []);
  const subdirs = items.filter(item =>
    item.isDirectory() &&
    !item.name.startsWith('.') &&
    !item.name.startsWith('-') &&
    isValidCollectionName(item.name)
  );
  const files = items.filter(item => item.isFile() && media.IMAGE_RE.test(item.name));

  if (currentDepth > 0 && files.length > 0 && subdirs.length > 0) {
    orphans.push({
      folderPath: currentPath,
      reason: 'mixed',
      message: 'Pasta mistura fotos e subpastas. Organize a pasta para sincronizar.'
    });
  }

  if (files.length > 0 && subdirs.length === 0 && currentDepth > 0) {
    collections.push({ folderPath: currentPath, name: currentPath.split('/').pop() });
  }

  if (subdirs.length > 0) {
    if (currentDepth >= maxDepth) {
      orphans.push({
        folderPath: currentPath,
        reason: 'too-deep',
        message: `Pasta tem subpastas além do nível permitido (${maxDepth} níveis).`
      });
    } else {
      for (const subdir of subdirs) {
        const folderPath = currentPath ? `${currentPath}/${subdir.name}` : subdir.name;
        const result = await scanFoldersRecursive(
          path.join(baseDir, subdir.name),
          maxDepth,
          currentDepth + 1,
          folderPath
        );
        collections.push(...result.collections);
        orphans.push(...result.orphans);
      }
    }
  } else if (files.length === 0 && currentDepth > 0) {
    orphans.push({ folderPath: currentPath, reason: 'empty', message: 'Pasta vazia.' });
  }

  return { collections, orphans };
}

// ========================================
// ROTA - SYNC completo (pastas + fotos)
// ========================================

async function listAvailableImages(scopePaths = null) {
  const images = new Map();
  const folders = new Set();
  const src = await getRcloneSource();
  const driveOrphans = src
    ? scopePaths
      ? (await Promise.all(scopePaths.map(scope => scanDriveOrphans(src, scope)))).flat()
      : await scanDriveOrphans(src)
    : [];

  const scanResult = await scanFoldersRecursive(PHOTOS_DIR, 2, 0, '');
  for (const { folderPath } of scanResult.collections) {
    const colDir = path.join(PHOTOS_DIR, folderPath);
    const files = await fs.readdir(colDir).catch(() => []);
    for (const file of files) {
      if (media.IMAGE_RE.test(file)) {
        images.set(`photos/${folderPath}/${file}`, {
          col: folderPath,
          file,
          exif: null,
          folderPath
        });
      }
    }
    folders.add(folderPath);
  }

  for (const { col, file, entry } of media.listEntries()) {
    folders.add(col);
    images.set(`photos/${col}/${file}`, { col, file, exif: entry.exif || {}, folderPath: col });
  }

  const orphanMap = new Map();
  for (const orphan of [...driveOrphans, ...scanResult.orphans]) {
    orphanMap.set(`${orphan.folderPath}:${orphan.reason}`, orphan);
  }

  return { images, folders: [...folders], orphans: [...orphanMap.values()] };
}

// Atualiza collections.json e photos.json a partir das imagens disponíveis
// Atualiza collections.json e photos.json a partir das imagens disponíveis
async function rebuildDatabase(scopePaths = null) {
  const { images, folders, orphans } = await listAvailableImages(scopePaths);
  const isInScope = folderPath => !scopePaths || scopePaths.some(scope =>
    folderPath === scope || folderPath.startsWith(`${scope}/`)
  );
  const photoFolder = photo =>
    String(photo.imageUrl || '').replace(/^\/?photos\//, '').split('/').slice(0, -1).join('/');

  const ORPHANS_FILE = path.join(DATA_DIR, 'orphans.json');

  // FASE 1: COLEÇÕES
  const collectionsData = await fs.readFile(COLLECTIONS_FILE, 'utf8');
  let collections = JSON.parse(collectionsData);
  let newCollections = 0;
  let removedCollections = 0;
  let migratedCollections = 0;

  // Mapa por nome de ficheiro (sem extensão), para detetar fotos movidas
  const imagesByBaseName = new Map();
  for (const [imageUrl, info] of images) {
    if (!isInScope(info.folderPath || info.col)) continue;
    const baseName = info.file.replace(/\.[^.]+$/, '');
    imagesByBaseName.set(baseName, { imageUrl, info });
  }

  // Ler fotos para saber a que coleções pertencem
  const photosData = await fs.readFile(DATA_FILE, 'utf8');
  let photos = JSON.parse(photosData);

  // NOVO: Migração inteligente de coleções (antes de eliminar)
  // Para cada coleção "órfã" (pasta não existe), ver se as suas fotos foram para outra pasta
  const foldersSet = new Set(folders);
  for (let i = 0; i < collections.length; i++) {
    const col = collections[i];
    const colPath = col.folderPath || col.id;
    if (!isInScope(colPath)) continue;
    if (foldersSet.has(colPath) || foldersSet.has(col.id)) continue; // Ainda existe

    // Coleção órfã! Verificar para onde foram as suas fotos
    const photosInCol = photos.filter(p => p.collection === col.id || p.collection === col.folderPath);
    if (photosInCol.length === 0) continue; // Sem fotos, deixa eliminar depois

    // Descobrir para onde cada foto foi (procurando por baseName)
    const targetFolders = new Set();
    for (const photo of photosInCol) {
      const oldBaseName = (photo.imageUrl.split('/').pop()).replace(/\.[^.]+$/, '');
      const newMatch = imagesByBaseName.get(oldBaseName);
      if (newMatch) {
        targetFolders.add(newMatch.info.folderPath);
      }
    }

    // Se TODAS as fotos foram para a MESMA pasta nova → migrar a coleção
    if (targetFolders.size === 1) {
      const newFolderPath = [...targetFolders][0];
      console.log(`📦 Coleção migrada: ${col.name} [${colPath} → ${newFolderPath}]`);
      col.folderPath = newFolderPath;
      col.id = newFolderPath.replace(/\//g, '_');
      migratedCollections++;
    }
    // Se targetFolders.size > 1 → fotos espalhadas por várias pastas: não migra, deixa eliminar
    // Se targetFolders.size === 0 → fotos desapareceram: deixa eliminar
  }

  // Adicionar coleções NOVAS (para pastas que aparecem agora e não têm coleção)
  for (const folderName of folders) {
    if (!isInScope(folderName)) continue;
    const existing = collections.find(c => c.folderPath === folderName || c.id === folderName);
    if (!existing) {
      const displayName = folderName.split('/').pop()
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      collections.push({
        id: folderName.replace(/\//g, '_'),
        name: displayName,
        folderPath: folderName,
        description: '',
        createdAt: new Date().toISOString(),
        photoCount: 0
      });
      newCollections++;
      console.log(`✨ Nova coleção criada: ${displayName} [${folderName}]`);
    }
  }

  // Eliminar coleções cujas pastas desapareceram (e que não foram migradas)
  collections = collections.filter(col => {
    const colPath = col.folderPath || col.id;
    if (!isInScope(colPath)) return true;
    if (foldersSet.has(colPath) || foldersSet.has(col.id)) return true;
    removedCollections++;
    console.log(`🗑️ Coleção removida (pasta não existe): ${col.name} [${col.folderPath || col.id}]`);
    return false;
  });
  await fs.writeFile(COLLECTIONS_FILE, JSON.stringify(collections, null, 2));

  // FASE 2: FOTOS
  let newPhotos = 0;
  let removedPhotos = 0;
  let exifFilled = 0;
  let movedPhotos = 0;

  const fillExif = (photo, exif) => {
    if (!exif) return false;
    let changed = false;
    for (const field of media.EXIF_FIELDS) {
      if (exif[field] && !photo[field]) {
        photo[field] = exif[field];
        changed = true;
      }
    }
    return changed;
  };

  // Percorre fotos existentes na BD: mantém, atualiza caminho se movida, ou remove
  const validPhotos = [];
  for (const photo of photos) {
    if (!isInScope(photoFolder(photo))) {
      validPhotos.push(photo);
      continue;
    }
    const info = images.get(photo.imageUrl);
    if (info) {
      // Caminho atual ainda válido
      if (fillExif(photo, info.exif)) exifFilled++;
      if (photo.orphaned) {
        photo.collection = null;
      } else if (info.folderPath && photo.collection !== info.folderPath) {
        photo.collection = info.folderPath;
      }
      const correctTitle = info.file.replace(/\.[^.]+$/, '');
      if (photo.title && photo.title.includes('/') && photo.title.endsWith('/' + correctTitle)) {
        photo.title = correctTitle;
      }
      validPhotos.push(photo);
      continue;
    }
    // Caminho antigo já não existe → foi movida? (procura por nome de ficheiro)
    const oldBaseName = (photo.imageUrl.split('/').pop()).replace(/\.[^.]+$/, '');
    const newMatch = imagesByBaseName.get(oldBaseName);
    if (newMatch) {
      console.log(`📦 Foto movida: ${photo.title} [${photo.imageUrl} → ${newMatch.imageUrl}]`);
      photo.imageUrl = newMatch.imageUrl;
      if (photo.orphaned) {
        photo.collection = null;
      } else {
        photo.collection = newMatch.info.col;
      }
      if (fillExif(photo, newMatch.info.exif)) exifFilled++;
      const correctTitle = newMatch.info.file.replace(/\.[^.]+$/, '');
      if (photo.title && photo.title.includes('/') && photo.title.endsWith('/' + correctTitle)) {
        photo.title = correctTitle;
      }
      validPhotos.push(photo);
      movedPhotos++;
      continue;
    }
    // Ficheiro realmente desapareceu
    const filePath = path.resolve(PHOTOS_DIR, String(photo.imageUrl || '').replace(/^photos\//, ''));
    if (filePath.startsWith(PHOTOS_DIR + path.sep) && fsSync.existsSync(filePath)) {
      validPhotos.push(photo);
    } else {
      removedPhotos++;
      console.log(`🗑️ Foto removida (ficheiro não existe): ${photo.title}`);
    }
  }
  photos = validPhotos;

  // Adiciona fotos NOVAS (não estavam na BD)
  const existingImageUrls = new Set(photos.map(p => p.imageUrl));
  for (const [imageUrl, info] of images) {
    if (!isInScope(info.folderPath || info.col)) continue;
    if (existingImageUrls.has(imageUrl)) continue;
    const newPhoto = {
      id: generatePhotoId(),
      title: info.file.replace(/\.[^.]+$/, ''),
      imageUrl,
      collection: info.col,
      categories: [],
      location: '',
      date: '',
      time: '',
      description: '',
      timestamp: Date.now()
    };
    fillExif(newPhoto, info.exif);
    photos.push(newPhoto);
    newPhotos++;
  }

  await fs.writeFile(DATA_FILE, JSON.stringify(photos, null, 2));
  let allOrphans = addUnassignedCollectionOrphans(orphans, collections, photos);
  if (scopePaths) {
    const existingOrphans = JSON.parse(await fs.readFile(ORPHANS_FILE, 'utf8').catch(() => '[]'));
    allOrphans = [
      ...existingOrphans.filter(orphan => !isInScope(orphan.folderPath)),
      ...allOrphans.filter(orphan => isInScope(orphan.folderPath))
    ];
  }
  // Filtra órfãs inválidas antes de salvar
  allOrphans = filterValidOrphans(allOrphans, collections);
  await fs.writeFile(ORPHANS_FILE, JSON.stringify(allOrphans, null, 2));

  return {
    success: true,
    collections: { total: collections.length, new: newCollections, removed: removedCollections, migrated: migratedCollections },
    photos: { total: photos.length, new: newPhotos, removed: removedPhotos, exifFilled, movedPhotos }
  };
}

app.post('/api/sync', requireAdmin, async (req, res) => {
  try {
    res.json(await rebuildDatabase());
  } catch (error) {
    console.error('Erro ao sincronizar:', error);
    res.status(500).json({ error: 'Erro ao sincronizar pastas e fotos' });
  }
});

// ========================================
// ROTAS - COLLECTIONS
// ========================================

app.get('/api/collections', async (req, res) => {
  try {
    const data = await fs.readFile(COLLECTIONS_FILE, 'utf8');
    let collections = JSON.parse(data);
    const photosData = await fs.readFile(DATA_FILE, 'utf8');
    const photos = JSON.parse(photosData);
    collections = collections.map(col => ({
      ...col,
      photoCount: photos.filter(p => p.collection === col.id || p.collection === col.folderPath).length
    }));
    res.json(collections);
  } catch (error) {
    console.error('Erro ao ler coleções:', error);
    res.status(500).json({ error: 'Erro ao ler coleções' });
  }
});

app.post('/api/collections', requireAdmin, async (req, res) => {
  try {
    const { name, description, setAsActive, folderPath } = req.body || {};

    if (typeof name !== 'string' || name.trim() === '' || name.length > 200) {
      return res.status(400).json({ error: 'Nome da coleção é obrigatório (máx. 200 caracteres)' });
    }
    if (description !== undefined && (typeof description !== 'string' || description.length > 2000)) {
      return res.status(400).json({ error: 'Descrição inválida' });
    }

    const data = await fs.readFile(COLLECTIONS_FILE, 'utf8');
    const collections = JSON.parse(data);

    const id = name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (collections.find(c => c.id === id)) {
      return res.status(400).json({ error: 'Já existe uma coleção com este nome' });
    }

    // Se vier folderPath (subpasta no Drive), valida; senão usa o id
    const finalFolderPath = folderPath
      ? (isValidFolderPath(folderPath) ? folderPath : id)
      : id;

    const newCollection = {
      id,
      name: name.trim(),
      folderPath: finalFolderPath,
      description: description?.trim() || '',
      createdAt: new Date().toISOString(),
      photoCount: 0
    };

    collections.push(newCollection);
    await fs.writeFile(COLLECTIONS_FILE, JSON.stringify(collections, null, 2));

    if (setAsActive) {
      const settings = {
        activeCollection: id,
        lastUpdated: new Date()
      };
      await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    }

    console.log(`✅ Coleção criada: ${name} [${finalFolderPath}]`);
    res.json(newCollection);
  } catch (error) {
    console.error('Erro ao criar coleção:', error);
    res.status(500).json({ error: 'Erro ao criar coleção' });
  }
});

app.put('/api/collections/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body || {};
    if ((name !== undefined && (typeof name !== 'string' || name.length > 200)) ||
        (description !== undefined && (typeof description !== 'string' || description.length > 2000))) {
      return res.status(400).json({ error: 'Dados inválidos' });
    }

    const data = await fs.readFile(COLLECTIONS_FILE, 'utf8');
    let collections = JSON.parse(data);

    const index = collections.findIndex(c => c.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Coleção não encontrada' });
    }

    collections[index] = {
      ...collections[index],
      name: name?.trim() || collections[index].name,
      description: description?.trim() || collections[index].description
    };

    await fs.writeFile(COLLECTIONS_FILE, JSON.stringify(collections, null, 2));
    console.log(`✅ Coleção editada: ${id}`);
    res.json(collections[index]);
  } catch (error) {
    console.error('Erro ao editar coleção:', error);
    res.status(500).json({ error: 'Erro ao editar coleção' });
  }
});

// ========================================
// ROTAS - ELIMINAR COLEÇÃO (com preservação de favoritas)
// ========================================

// Obter informações para eliminação (pasta + fotos favoritas)
app.get('/api/collections/:id/delete-info', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const data = await fs.readFile(COLLECTIONS_FILE, 'utf8');
    const collections = JSON.parse(data);
    const col = collections.find(c => c.id === id);
    if (!col) return res.status(404).json({ error: 'Coleção não encontrada' });
    
    // Proteger favoritas
    if (col.id === 'favoritas' || col.folderPath === 'favoritas' || (col.name || '').toLowerCase() === 'favoritas') {
      return res.status(400).json({ error: 'A coleção "favoritas" não pode ser eliminada.', protected: true });
    }
    
    const folderPath = col.folderPath || col.id;
    
    // Obter fotos favoritas desta coleção
    const photosData = await fs.readFile(DATA_FILE, 'utf8');
    const photos = JSON.parse(photosData);
    const colPhotos = photos.filter(p =>
      p.collection === col.id ||
      p.collection === col.folderPath ||
      (p.orphaned && p.orphanedFromCollection === folderPath)
    );
    const favoritePhotos = colPhotos.filter(p => p.isFavorite);
    
    res.json({
      id: col.id,
      name: col.name,
      folderPath,
      totalPhotos: colPhotos.length,
      favoritePhotos: favoritePhotos.map(p => ({
        filename: p.imageUrl.split('/').pop(),
        title: p.title
      }))
    });
  } catch (error) {
    console.error('Erro ao obter info de eliminação:', error);
    res.status(500).json({ error: 'Erro ao obter informações' });
  }
});

// Verificar se a pasta ainda existe no Drive
app.get('/api/collections/:id/check-folder', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const data = await fs.readFile(COLLECTIONS_FILE, 'utf8');
    const collections = JSON.parse(data);
    const col = collections.find(c => c.id === id);
    if (!col) return res.status(404).json({ error: 'Coleção não encontrada' });
    
    const folderPath = col.folderPath || col.id;
    const src = await getRcloneSource();
    if (!src) return res.status(409).json({ error: 'Drive não configurado' });
    
    const remotePath = joinRemote(src.remote, folderPath);
    const result = await runRclone(['lsd', remotePath, '--retries', '1', '--contimeout', '10s'], src, 30 * 1000);
    
    res.json({ folderExists: result.ok });
  } catch (error) {
    console.error('Erro ao verificar pasta:', error);
    res.status(500).json({ error: 'Erro ao verificar pasta' });
  }
});

// Finalizar eliminação (sincronizar favoritas + limpar BD)
app.post('/api/collections/:id/finalize-delete', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const data = await fs.readFile(COLLECTIONS_FILE, 'utf8');
    const collections = JSON.parse(data);
    const col = collections.find(c => c.id === id);
    if (!col) return res.status(404).json({ error: 'Coleção não encontrada' });
    
    if (col.id === 'favoritas' || col.folderPath === 'favoritas' || (col.name || '').toLowerCase() === 'favoritas') {
      return res.status(400).json({ error: 'A coleção "favoritas" não pode ser eliminada.' });
    }
    
    const folderPath = col.folderPath || col.id;
    
    // 1. Verificar que a pasta já não existe no Drive
    const src = await getRcloneSource();
    if (!src) return res.status(409).json({ error: 'Drive não configurado' });
    const remotePath = joinRemote(src.remote, folderPath);
    const checkResult = await runRclone(['lsd', remotePath, '--retries', '1', '--contimeout', '10s'], src, 30 * 1000);
    if (checkResult.ok) {
      return res.status(400).json({ error: 'A pasta ainda existe no Drive. Mova as fotos favoritas e apague a pasta primeiro.' });
    }
    
    // 2. Sincronizar favoritas (preserva metadados das fotos movidas)
    try {
      const syncStarted = await media.runSync('favoritas', rebuildDatabase);
      await syncStarted.promise;
    } catch (e) {
      console.warn('Aviso: sincronização de favoritas falhou:', e.message);
    }
    
    // 3. Remover a coleção da BD
    const colsData2 = await fs.readFile(COLLECTIONS_FILE, 'utf8');
    let collections2 = JSON.parse(colsData2);
    collections2 = collections2.filter(c => c.id !== id);
    await fs.writeFile(COLLECTIONS_FILE, JSON.stringify(collections2, null, 2));
    
    // 4. Limpar fotos órfãs (que ainda referenciam a coleção eliminada)
    const photosData = await fs.readFile(DATA_FILE, 'utf8');
    let photos = JSON.parse(photosData);
    photos = photos.filter(p => p.collection !== id && p.collection !== folderPath);
    await fs.writeFile(DATA_FILE, JSON.stringify(photos, null, 2));
    
    // 5. Limpar settings se a coleção ativa foi eliminada
    const settingsData = await fs.readFile(SETTINGS_FILE, 'utf8');
    const settings = JSON.parse(settingsData);
    if (settings.activeCollection === id || settings.activeCollection === folderPath) {
      settings.activeCollection = null;
      settings.lastUpdated = new Date();
      await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    }
    
    console.log(`🗑️ Coleção eliminada: ${col.name} [${folderPath}]`);
    res.json({ success: true, message: `Coleção "${col.name}" eliminada com sucesso` });
  } catch (error) {
    console.error('Erro ao finalizar eliminação:', error);
    res.status(500).json({ error: 'Erro ao eliminar coleção' });
  }
});

// ========================================
// CATEGORIAS - Estrutura com grupos (fixos) e categorias
// ========================================
const DEFAULT_GROUPS = [
  { id: 'rostos', name: 'Rostos & Expressões', icon: '👤', description: 'Foco no indivíduo, nas suas emoções e na perspetiva humana.' },
  { id: 'acao', name: 'Ação & Sociedade', icon: '✊', description: 'Foco em manifestações, eventos coletivos e dinâmica de grupos.' },
  { id: 'vida', name: 'Vida & Rotina', icon: '🌍', description: 'Foco no dia a dia, trabalho, deslocação e tradições.' },
  { id: 'ambiente', name: 'Ambiente & Detalhes', icon: '🏙️', description: 'Foco no cenário, na natureza e nos elementos que contextualizam a cena.' }
];

const DEFAULT_CATEGORIES = [
  { name: 'Retrato', description: 'Foco no rosto, identidade e carácter.', groupId: 'rostos' },
  { name: 'Emoção', description: 'Expressões intensas (gritos, choro, euforia, paixão).', groupId: 'rostos' },
  { name: 'Infância', description: 'Brincadeiras, descoberta e a energia das crianças.', groupId: 'rostos' },
  { name: 'Contemplação', description: 'Pausa, introspeção, solidão ou olhar perdido.', groupId: 'rostos' },
  { name: 'Reivindicação', description: 'Cartazes, palavras de ordem e mensagens escritas.', groupId: 'acao' },
  { name: 'Marcha', description: 'Pessoas a desfilar organizadamente com faixas/tarjas.', groupId: 'acao' },
  { name: 'Multidão', description: 'Grandes agregados, visão de conjunto e bandeiras.', groupId: 'acao' },
  { name: 'Discurso', description: 'Oradores, palcos, megafones e quem fala à multidão.', groupId: 'acao' },
  { name: 'Confronto', description: 'Tensão, presença policial ou momentos de choque.', groupId: 'acao' },
  { name: 'Performance', description: 'Intervenções artísticas, máscaras ou teatro de rua.', groupId: 'acao' },
  { name: 'Ritmo', description: 'Músicos, instrumentos e batucada na manifestação.', groupId: 'acao' },
  { name: 'Movimento', description: 'Ação física, desporto, dança ou energia corporal.', groupId: 'acao' },
  { name: 'Repouso', description: 'Pausas, pessoas sentadas ou o descanso após a ação.', groupId: 'acao' },
  { name: 'Cotidiano', description: 'Rotina, momentos espontâneos, esperas e vida comum.', groupId: 'vida' },
  { name: 'Ofício', description: 'Trabalho manual, artesãos, profissões e foco nas mãos.', groupId: 'vida' },
  { name: 'Convívio', description: 'Refeições partilhadas, conversas de café e abraços.', groupId: 'vida' },
  { name: 'Viagem', description: 'Deslocamento, estradas, aeroportos e exploração.', groupId: 'vida' },
  { name: 'Celebração', description: 'Festas, casamentos, festivais e alegria coletiva.', groupId: 'vida' },
  { name: 'Ritual', description: 'Cerimónias religiosas, tradições e práticas simbólicas.', groupId: 'vida' },
  { name: 'Cultura', description: 'Arte de rua, trajes típicos e expressões locais.', groupId: 'vida' },
  { name: 'Urbano', description: 'Cenários da cidade, arquitetura e luzes da rua.', groupId: 'ambiente' },
  { name: 'Natureza', description: 'Paisagens, elementos naturais e ambientes selvagens.', groupId: 'ambiente' },
  { name: 'Observador', description: 'Transeuntes ou pessoas a assistir das janelas/varandas.', groupId: 'ambiente' },
  { name: 'Símbolo', description: 'Detalhes simbólicos, texturas, punhos cerrados ou objetos.', groupId: 'ambiente' }
];

function getDefaultCategoriesData() {
  return {
    groups: DEFAULT_GROUPS.map(g => ({ ...g })),
    categories: DEFAULT_CATEGORIES.map(c => ({ ...c }))
  };
}

async function migrateCategoriesFile() {
  let data;
  try {
    data = JSON.parse(await fs.readFile(CATEGORIES_FILE, 'utf8'));
  } catch {
    return;
  }
  if (data && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.groups) && Array.isArray(data.categories)) {
    return;
  }
  console.log('🔄 Migrando categories.json para o novo formato (com grupos)');
  const newData = getDefaultCategoriesData();
  if (Array.isArray(data)) {
    const defaultNames = new Set(DEFAULT_CATEGORIES.map(c => c.name));
    for (const oldName of data) {
      if (typeof oldName === 'string' && oldName.trim() && !defaultNames.has(oldName)) {
        newData.categories.push({ name: oldName, description: '', groupId: 'ambiente' });
      }
    }
  }
  await fs.writeFile(CATEGORIES_FILE, JSON.stringify(newData, null, 2));
  console.log('✅ categories.json migrado');
}

function validGroupId(id) {
  return typeof id === 'string' && DEFAULT_GROUPS.some(g => g.id === id);
}

// ========================================
// ROTAS - CATEGORIES (com grupos)
// ========================================

app.get('/api/categories', async (req, res) => {
  try {
    await migrateCategoriesFile();
    const data = JSON.parse(await fs.readFile(CATEGORIES_FILE, 'utf8'));
    if (!data.groups || data.groups.length === 0) data.groups = DEFAULT_GROUPS.map(g => ({ ...g }));
    res.json(data);
  } catch (error) {
    console.error('Erro ao ler categorias:', error);
    res.status(500).json({ error: 'Erro ao ler categorias' });
  }
});

app.post('/api/categories', requireAdmin, async (req, res) => {
  try {
    const { name, description, groupId } = req.body || {};
    if (!validCategoryName(name)) {
      return res.status(400).json({ error: 'Nome da categoria é obrigatório (máx. 100 caracteres)' });
    }
    if (!validGroupId(groupId)) {
      return res.status(400).json({ error: 'Grupo inválido' });
    }
    const desc = typeof description === 'string' ? cleanText(description, 500) : '';

    const data = JSON.parse(await fs.readFile(CATEGORIES_FILE, 'utf8'));
    if (data.categories.some(c => c.name.toLowerCase() === name.trim().toLowerCase())) {
      return res.status(400).json({ error: 'Categoria já existe' });
    }

    data.categories.push({ name: name.trim(), description: desc, groupId });
    await fs.writeFile(CATEGORIES_FILE, JSON.stringify(data, null, 2));
    console.log(`✅ Categoria criada: ${name} [${groupId}]`);
    res.json(data);
  } catch (error) {
    console.error('Erro ao criar categoria:', error);
    res.status(500).json({ error: 'Erro ao criar categoria' });
  }
});

app.put('/api/categories/:oldName', requireAdmin, async (req, res) => {
  try {
    const { oldName } = req.params;
    const { newName, newDescription, newGroupId } = req.body || {};

    if (!validCategoryName(newName)) {
      return res.status(400).json({ error: 'Novo nome é obrigatório (máx. 100 caracteres)' });
    }
    if (newGroupId !== undefined && !validGroupId(newGroupId)) {
      return res.status(400).json({ error: 'Grupo inválido' });
    }

    const data = JSON.parse(await fs.readFile(CATEGORIES_FILE, 'utf8'));
    const index = data.categories.findIndex(c => c.name === oldName);
    if (index === -1) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }

    const oldCat = data.categories[index];
    data.categories[index] = {
      ...oldCat,
      name: newName.trim(),
      description: newDescription !== undefined ? (typeof newDescription === 'string' ? cleanText(newDescription, 500) : '') : oldCat.description,
      groupId: newGroupId !== undefined ? newGroupId : oldCat.groupId
    };
    await fs.writeFile(CATEGORIES_FILE, JSON.stringify(data, null, 2));

    const photosData = await fs.readFile(DATA_FILE, 'utf8');
    let photos = JSON.parse(photosData);
    photos = photos.map(p => {
      if (Array.isArray(p.categories)) {
        return { ...p, categories: p.categories.map(cat => cat === oldName ? newName.trim() : cat) };
      }
      if (p.category === oldName) {
        return { ...p, category: newName.trim() };
      }
      return p;
    });
    await fs.writeFile(DATA_FILE, JSON.stringify(photos, null, 2));

    console.log(`✅ Categoria editada: ${oldName} → ${newName}`);
    res.json(data);
  } catch (error) {
    console.error('Erro ao editar categoria:', error);
    res.status(500).json({ error: 'Erro ao editar categoria' });
  }
});

app.delete('/api/categories/:name', requireAdmin, async (req, res) => {
  try {
    const { name } = req.params;
    const data = JSON.parse(await fs.readFile(CATEGORIES_FILE, 'utf8'));
    data.categories = data.categories.filter(c => c.name !== name);
    await fs.writeFile(CATEGORIES_FILE, JSON.stringify(data, null, 2));

    const photosData = await fs.readFile(DATA_FILE, 'utf8');
    let photos = JSON.parse(photosData);
    photos = photos.map(p => {
      if (Array.isArray(p.categories)) {
        return { ...p, categories: p.categories.filter(cat => cat !== name) };
      }
      if (p.category === name) {
        return { ...p, category: null };
      }
      return p;
    });
    await fs.writeFile(DATA_FILE, JSON.stringify(photos, null, 2));

    console.log(`🗑️ Categoria eliminada: ${name}`);
    res.json(data);
  } catch (error) {
    console.error('Erro ao eliminar categoria:', error);
    res.status(500).json({ error: 'Erro ao eliminar categoria' });
  }
});

// ========================================
// ROTAS - PHOTOS
// ========================================

app.get('/api/photos', async (req, res) => {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    let photos = JSON.parse(data);

    photos = photos
      .filter(photo => !photo.pendingDriveDelete || getSession(req))
      .map(photo => {
      if (!photo.collection && !photo.orphaned && photo.imageUrl) {
        const pathParts = photo.imageUrl.split('/');
        // photos/<col>/<file> → col = pathParts[1]
        // photos/<mãe>/<filha>/<file> → col = pathParts[1] + '/' + pathParts[2]
        if (pathParts.length === 3 && pathParts[0] === 'photos') {
          photo = { ...photo, collection: pathParts[1] };
        } else if (pathParts.length === 4 && pathParts[0] === 'photos') {
          photo = { ...photo, collection: `${pathParts[1]}/${pathParts[2]}` };
        }
      }
      return publicView(req, { ...photo, ...media.urlsFor(photo.imageUrl) });
    });

    // Remover duplicatas de IDs (filtro de segurança)
    const seenIds = new Set();
    const uniquePhotos = [];
    for (const photo of photos) {
      if (!seenIds.has(photo.id)) {
        seenIds.add(photo.id);
        uniquePhotos.push(photo);
      }
    }

    res.json(uniquePhotos);
  } catch (error) {
    console.error('Erro ao ler fotos:', error);
    res.status(500).json({ error: 'Erro ao ler fotos' });
  }
});

app.post('/api/photos/import-classifications', requireAdmin, async (req, res) => {
  try {
    const items = req.body?.items;
    if (!Array.isArray(items) || items.length === 0 || items.length > 500) {
      return res.status(400).json({ error: 'A importação tem de conter entre 1 e 500 classificações.' });
    }

    const [photosData, categoriesData] = await Promise.all([
      fs.readFile(DATA_FILE, 'utf8'),
      fs.readFile(CATEGORIES_FILE, 'utf8')
    ]);
    let photos = JSON.parse(photosData);
    const categories = JSON.parse(categoriesData);
    if (!Array.isArray(photos) || !Array.isArray(categories.categories)) {
      throw new Error('Os dados de fotografias ou categorias têm um formato inválido.');
    }

    const categoriesByName = new Map(categories.categories
      .filter(category => typeof category.name === 'string')
      .map(category => [normalizeCategoryName(category.name), category.name]));
    const photoIds = new Set();
    const updates = [];

    for (const item of items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return res.status(400).json({ error: 'A importação contém um registo inválido.' });
      }
      if (!(typeof item.photoId === 'string' || (typeof item.photoId === 'number' && Number.isFinite(item.photoId)))) {
        return res.status(400).json({ error: 'Um registo não identifica uma fotografia válida.' });
      }

      const photoId = String(item.photoId);
      if (photoIds.has(photoId)) {
        return res.status(400).json({ error: 'A mesma fotografia não pode aparecer mais do que uma vez na importação.' });
      }
      photoIds.add(photoId);
      const photo = photos.find(candidate => String(candidate.id) === photoId);
      if (!photo) return res.status(400).json({ error: `A fotografia ${photoId} já não existe. Atualize a página e reveja a importação.` });

      if (typeof item.title !== 'string' || item.title.length > 300) {
        return res.status(400).json({ error: `O título da fotografia "${photo.title || photoId}" é inválido (máximo 300 caracteres).` });
      }
      const title = cleanText(item.title, 300).trim();
      if (!title) return res.status(400).json({ error: `O título da fotografia "${photo.title || photoId}" não pode ficar vazio.` });
      if (typeof item.description !== 'string' || item.description.length > 5000) {
        return res.status(400).json({ error: `A descrição da fotografia "${photo.title || photoId}" é inválida (máximo 5000 caracteres).` });
      }
      if (!Array.isArray(item.categories) || item.categories.length > 50) {
        return res.status(400).json({ error: `As categorias da fotografia "${photo.title || photoId}" são inválidas.` });
      }

      const mappedCategories = [];
      for (const categoryName of item.categories) {
        if (typeof categoryName !== 'string' || !categoryName.trim()) {
          return res.status(400).json({ error: `Há uma categoria vazia ou inválida na fotografia "${photo.title || photoId}".` });
        }
        const mapped = categoriesByName.get(normalizeCategoryName(categoryName));
        if (!mapped) {
          return res.status(400).json({ error: `A categoria "${categoryName}" não existe.` });
        }
        if (mappedCategories.includes(mapped)) {
          return res.status(400).json({ error: `A categoria "${mapped}" está repetida na fotografia "${photo.title || photoId}".` });
        }
        mappedCategories.push(mapped);
      }

      updates.push({
        ...photo,
        title,
        description: cleanText(item.description, 5000),
        categories: mappedCategories
      });
    }

    const updatedById = new Map(updates.map(photo => [String(photo.id), photo]));
    photos = photos.map(photo => updatedById.get(String(photo.id)) || photo);
    const temporaryFile = `${DATA_FILE}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporaryFile, JSON.stringify(photos, null, 2), { flag: 'wx' });
      await fs.rename(temporaryFile, DATA_FILE);
    } catch (error) {
      try {
        await fs.unlink(temporaryFile);
      } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') console.error('Erro ao limpar ficheiro temporário de importação:', cleanupError);
      }
      throw error;
    }

    console.log(`✅ Classificações importadas: ${updates.length} fotografia(s)`);
    res.json({ imported: updates.length, photos: updates.map(photo => publicView(req, { ...photo, ...media.urlsFor(photo.imageUrl) })) });
  } catch (error) {
    console.error('Erro ao importar classificações:', error);
    res.status(500).json({ error: 'Erro ao importar classificações.' });
  }
});

app.post('/api/photos', requireAdmin, async (req, res) => {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    let photos = JSON.parse(data);

    const { photo: body, error } = validatePhotoInput(req.body);
    if (error) return res.status(400).json({ error });
    const existing = body.id !== undefined ? photos.find(p => p.id === body.id) : null;
    const newPhoto = {
      ...(existing || {}),
      ...body,
      id: body.id || Date.now(),
      ...(body.collection ? { orphaned: false, orphanedFromCollection: null } : {})
    };

    if (body.id !== undefined) {
      photos = photos.filter(p => p.id !== newPhoto.id);
    }

    photos.push(newPhoto);
    await fs.writeFile(DATA_FILE, JSON.stringify(photos, null, 2));

    console.log(`✅ Foto guardada: ${newPhoto.title} [${newPhoto.collection || 'Sem coleção'}]`);
    res.json(publicView(req, { ...newPhoto, ...media.urlsFor(newPhoto.imageUrl) }));
  } catch (error) {
    console.error('Erro ao guardar foto:', error);
    res.status(500).json({ error: 'Erro ao guardar foto' });
  }
});

app.delete('/api/photos/:id', requireAdmin, async (req, res) => {
  try {
    const photoId = String(req.params.id);
    const data = await fs.readFile(DATA_FILE, 'utf8');
    const photos = JSON.parse(data);
    const photo = photos.find(p => String(p.id) === photoId);
    if (!photo) return res.status(404).json({ error: 'Fotografia não encontrada' });

    const orphanedPhoto = {
      ...photo,
      categories: Array.isArray(photo.categories) ? [...photo.categories] : photo.categories,
      category: photo.category,
      collection: null,
      orphaned: true,
      orphanedFromCollection: photo.collection || photo.orphanedFromCollection || null
    };
    const updatedPhotos = photos.map(p =>
      String(p.id) === photoId ? orphanedPhoto : p
    );
    await fs.writeFile(DATA_FILE, JSON.stringify(updatedPhotos, null, 2));

    const collections = JSON.parse(await fs.readFile(COLLECTIONS_FILE, 'utf8'));
    let orphans = [];
    try {
      orphans = JSON.parse(await fs.readFile(ORPHANS_FILE, 'utf8'));
    } catch {}
    orphans = addUnassignedCollectionOrphans(orphans, collections, updatedPhotos);
    // Filtra órfãs inválidas antes de salvar
    orphans = filterValidOrphans(orphans, collections);
    await fs.writeFile(ORPHANS_FILE, JSON.stringify(orphans, null, 2));

    console.log(`📂 Foto desvinculada da coleção e marcada como órfã: ${photo.title} (ID ${photoId})`);
    res.json(publicView(req, { ...orphanedPhoto, ...media.urlsFor(orphanedPhoto.imageUrl) }));
  } catch (error) {
    console.error('Erro ao marcar fotografia como órfã:', error);
    res.status(500).json({ error: 'Erro ao desvincular fotografia da coleção' });
  }
});

app.post('/api/photos/:id/mark-drive-delete', requireAdmin, async (req, res) => {
  try {
    const photoId = String(req.params.id);
    const photos = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
    const photo = photos.find(item => String(item.id) === photoId);
    if (!photo) return res.status(404).json({ error: 'Fotografia não encontrada' });
    if (!photo.orphaned || photo.collection) {
      return res.status(409).json({ error: 'Só é possível marcar fotografias órfãs para apagar.' });
    }

    photo.pendingDriveDelete = true;
    await fs.writeFile(DATA_FILE, JSON.stringify(photos, null, 2));
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao marcar fotografia para apagar do Drive:', error);
    res.status(500).json({ error: 'Erro ao marcar fotografia para apagar' });
  }
});

// ========================================
// ROTA - EXIF
// ========================================

app.get('/api/exif', async (req, res) => {
  const { imagePath } = req.query;
  if (!imagePath) return res.status(400).json({ error: 'imagePath é obrigatório' });

  const cleanImagePath = String(imagePath).trim();
  if (cleanImagePath.length > 600) return res.status(400).json({ error: 'Caminho inválido' });
  if (!cleanImagePath.startsWith('photos/') || !media.IMAGE_RE.test(cleanImagePath)) {
    return res.status(400).json({ error: 'Caminho inválido' });
  }

  const entry = media.entryFor(cleanImagePath);
  if (entry) return res.json(publicView(req, entry.exif || {}));

  const fullPath = path.resolve(PHOTOS_DIR, cleanImagePath.replace(/^photos\//, ''));
  if (!fullPath.startsWith(PHOTOS_DIR + path.sep)) {
    return res.status(400).json({ error: 'Caminho inválido' });
  }
  if (!fsSync.existsSync(fullPath)) return res.json({});
  res.json(publicView(req, await media.readExif(fullPath)));
});

// ========================================
// ROTAS - AUTENTICAÇÃO (LOGIN / SESSÃO / LOGOUT)
// ========================================
app.post('/api/login', (req, res) => {
  const ip = req.ip || 'desconhecido';
  if (tooManyAttempts(ip)) {
    return res.status(429).json({ success: false, message: 'Demasiadas tentativas. Tente novamente dentro de 15 minutos.' });
  }

  const { username, password } = req.body || {};
  const ADMIN_USER = process.env.ADMIN_USER;
  const ADMIN_PASS = process.env.ADMIN_PASS;

  const problem = adminLoginProblem();
  if (problem) {
    return res.status(503).json({ success: false, message: problem });
  }

  if (typeof username === 'string' && typeof password === 'string' &&
      safeEqual(username, ADMIN_USER) && safeEqual(password, ADMIN_PASS)) {
    loginFailures.delete(ip);
    const token = createToken(username);
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: COOKIE_SECURE === 'auto' ? req.secure : COOKIE_SECURE === 'true',
      maxAge: SESSION_TTL_MS,
      path: '/'
    });
    return res.status(200).json({ success: true, message: 'Login bem-sucedido!', token, expiresIn: SESSION_TTL_MS / 1000 });
  }

  registerFailure(ip);
  res.status(401).json({ success: false, message: 'Credenciais inválidas' });
});

app.get('/api/session', (req, res) => {
  const session = getSession(req);
  res.json({ authenticated: !!session, username: session ? session.u : null });
});

app.post('/api/logout', (req, res) => {
  const session = getSession(req);
  if (session && session.jti) revokedTokens.set(session.jti, session.exp);
  res.clearCookie(COOKIE_NAME, { path: '/', httpOnly: true, sameSite: 'strict' });
  res.json({ success: true });
});

// ========================================
// RCLONE (Google Drive)
// ========================================

function cleanIniValue(value) {
  if (value === undefined || value === null) return '';
  const v = String(value).trim();
  if (/[\x00-\x1f\x7f]/.test(v)) throw new Error('Valor inválido (contém quebras de linha ou caracteres de controlo).');
  return v;
}

function maskValue(value) {
  if (!value) return '';
  const v = String(value);
  if (v.length <= 8) return '••••';
  return `${v.slice(0, 4)}••••${v.slice(-4)}`;
}

async function readRcloneState() {
  try {
    return JSON.parse(await fs.readFile(RCLONE_STATE, 'utf8'));
  } catch {
    return {};
  }
}

async function writeRcloneState(state) {
  await fs.mkdir(PRIVATE_DIR, { recursive: true, mode: 0o700 });
  await fs.writeFile(RCLONE_STATE, JSON.stringify(state, null, 2), { mode: 0o600 });
  await fs.chmod(RCLONE_STATE, 0o600).catch(() => {});
}

async function readTokenFromConf() {
  try {
    const conf = await fs.readFile(RCLONE_CONF, 'utf8');
    const m = conf.match(/^token\s*=\s*(.+)$/m);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

async function writeRcloneConf(state) {
  const lines = [`[${REMOTE_NAME}]`, 'type = drive', `scope = ${state.scope || 'drive.readonly'}`];
  if (state.token) lines.push(`token = ${state.token}`);
  if (state.client_id) lines.push(`client_id = ${state.client_id}`);
  if (state.client_secret) lines.push(`client_secret = ${state.client_secret}`);
  if (state.root_folder_id) lines.push(`root_folder_id = ${state.root_folder_id}`);
  if (state.team_drive) lines.push(`team_drive = ${state.team_drive}`);
  await fs.mkdir(PRIVATE_DIR, { recursive: true, mode: 0o700 });
  await fs.writeFile(RCLONE_CONF, lines.join('\n') + '\n', { mode: 0o600 });
  await fs.chmod(RCLONE_CONF, 0o600).catch(() => {});
}

function joinRemote(base, name) {
  if (!name) return base;
  return base.endsWith(':') || base.endsWith('/') ? `${base}${name}` : `${base}/${name}`;
}

async function getRcloneSource() {
  const state = await readRcloneState();
  if (fsSync.existsSync(RCLONE_CONF) && state.token) {
    return { source: 'stored', conf: RCLONE_CONF, remote: `${REMOTE_NAME}:${state.path || ''}`, state };
  }
  if (process.env.RCLONE_CONFIG_GDRIVE_TYPE && process.env.RCLONE_CONFIG_GDRIVE_TOKEN) {
    return { source: 'env', conf: null, remote: process.env.GDRIVE_REMOTE || 'gdrive:fotos-site', state };
  }
  if (fsSync.existsSync(LEGACY_RCLONE_CONF)) {
    return { source: 'legacy', conf: LEGACY_RCLONE_CONF, remote: process.env.GDRIVE_REMOTE || 'gdrive:fotos-site', state };
  }
  return null;
}

function rcloneEnvArgs(src) {
  const env = { ...process.env };
  const args = [];
  if (src.source !== 'env') {
    for (const key of Object.keys(env)) if (key.startsWith('RCLONE_CONFIG_GDRIVE_')) delete env[key];
    args.push('--config', src.conf);
  }
  return { env, args };
}

function runRclone(args, src, timeoutMs) {
  const { env, args: extra } = rcloneEnvArgs(src);
  const fullArgs = [...args, ...extra];
  return new Promise((resolve) => {
    execFile('rclone', fullArgs, { env, timeout: timeoutMs, maxBuffer: 200 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout: stdout || '', stderr: stderr || '', error });
    });
  });
}

function describeRcloneError(result) {
  const text = `${result.stderr}\n${result.error ? result.error.message : ''}`;
  let code = 'RCLONE_ERROR';
  if (result.error && result.error.code === 'ENOENT') code = 'RCLONE_MISSING';
  else if (result.error && result.error.killed) code = 'RCLONE_TIMEOUT';
  else if (/invalid_grant|unauthorized|unauthenticated|401|oauth2|token|invalid_client|didn't find section|couldn't find section|not found in config/i.test(text)) code = 'RCLONE_AUTH';
  else if (/directory not found|not found/i.test(text)) code = 'RCLONE_NOT_FOUND';
  const google = [...text.matchAll(/"(message|reason)"\s*:\s*"([^"]+)"/g)].map(m => m[2]);
  const reason = google.find(g => /^[A-Z_]+$/.test(g)) || '';
  const gmsg = google.find(g => !/^[A-Z_]+$/.test(g)) || '';
  if (/SCOPE_INSUFFICIENT|insufficient.*scope|insufficientPermissions/i.test(text)) code = 'RCLONE_SCOPE';
  else if (/rateLimit|RATE_LIMIT|userRateLimitExceeded|quota/i.test(text)) code = 'RCLONE_RATE_LIMIT';
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    .filter(l => !/^Command failed:/.test(l))
    .filter(l => /ERROR\s*:|CRITICAL|Failed to/i.test(l))
    .map(l => l.replace(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}\s+/, '').replace(/"https?:\/\/[^"]*"/g, '<url>'));
  const hints = {
    RCLONE_SCOPE: 'O token não tem permissão para este tipo de acesso. Gere um token novo com o mesmo modo (só leitura ou total) escolhido aqui.',
    RCLONE_RATE_LIMIT: 'A Google limitou temporariamente os pedidos. Tente de novo dentro de alguns minutos.',
    RCLONE_AUTH: 'O token foi recusado ou expirou sem poder ser renovado. Gere um token novo.'
  };
  const detail = gmsg ? `${gmsg}${reason ? ` (${reason})` : ''}` : ([...new Set(lines)].slice(-1)[0] || '');
  const message = [hints[code], detail].filter(Boolean).join(' — ').slice(0, 400) || 'Erro desconhecido do rclone';
  return { code, message };
}

const RCLONE_NOT_CONFIGURED = {
  error: 'A ligação ao Google Drive ainda não está configurada. Introduza as credenciais do rclone.',
  code: 'RCLONE_NOT_CONFIGURED'
};

app.get('/api/admin/rclone', requireAdmin, async (req, res) => {
  const state = await readRcloneState();
  const src = await getRcloneSource();
  res.json({
    configured: !!src,
    source: src ? src.source : null,
    remote: src ? src.remote : null,
    stored: {
      hasToken: !!state.token,
      hasClientSecret: !!state.client_secret,
      clientId: maskValue(state.client_id),
      rootFolderId: state.root_folder_id || '',
      teamDrive: state.team_drive || '',
      scope: state.scope || 'drive.readonly',
      path: state.path || '',
      updatedAt: state.updatedAt || null
    },
    lastTest: state.lastTest || null
  });
});

app.put('/api/admin/rclone', requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const state = await readRcloneState();
    const next = { ...state };

    if (typeof body.token === 'string' && body.token.trim()) {
      let parsed;
      try {
        parsed = JSON.parse(body.token.trim());
      } catch {
        return res.status(400).json({ error: 'O token tem de ser o JSON completo devolvido pelo rclone ({"access_token": ...}).' });
      }
      if (!parsed || typeof parsed !== 'object' || (!parsed.access_token && !parsed.refresh_token)) {
        return res.status(400).json({ error: 'O token não contém access_token nem refresh_token.' });
      }
      next.token = JSON.stringify(parsed);
    } else if (state.token) {
      next.token = (await readTokenFromConf()) || state.token;
    }

    if (typeof body.client_id === 'string' && body.client_id.trim()) next.client_id = cleanIniValue(body.client_id);
    if (body.clearClient) { delete next.client_id; delete next.client_secret; }
    if (typeof body.client_secret === 'string' && body.client_secret.trim()) next.client_secret = cleanIniValue(body.client_secret);

    if (body.root_folder_id !== undefined) {
      const id = cleanIniValue(body.root_folder_id);
      if (id && !/^[A-Za-z0-9_-]{5,200}$/.test(id)) return res.status(400).json({ error: 'ID da pasta inválido. Copie a parte final do URL da pasta no Drive.' });
      next.root_folder_id = id;
    }
    if (body.team_drive !== undefined) {
      const td = cleanIniValue(body.team_drive);
      if (td && !/^[A-Za-z0-9_-]{5,200}$/.test(td)) return res.status(400).json({ error: 'ID da Drive partilhada inválido.' });
      next.team_drive = td;
    }
    if (body.scope !== undefined) {
      if (!['drive.readonly', 'drive'].includes(body.scope)) return res.status(400).json({ error: 'Âmbito inválido.' });
      next.scope = body.scope;
    }
    if (body.path !== undefined) {
      const p = cleanIniValue(body.path).replace(/^\/+|\/+$/g, '');
      if (p.split('/').some(seg => seg === '..' || seg === '.')) return res.status(400).json({ error: 'Caminho inválido.' });
      next.path = p;
    }

    if (!next.token) {
      return res.status(400).json({ error: 'Falta o token do Google Drive (obtido com "rclone authorize drive").' });
    }

    next.updatedAt = new Date().toISOString();
    next.lastTest = null;
    await writeRcloneConf(next);
    await writeRcloneState(next);
    console.log('🔑 Credenciais do rclone atualizadas');
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao guardar credenciais do rclone:', error.message);
    res.status(400).json({ error: error.message || 'Erro ao guardar credenciais' });
  }
});

app.delete('/api/admin/rclone', requireAdmin, async (req, res) => {
  await fs.rm(RCLONE_CONF, { force: true });
  await fs.rm(RCLONE_STATE, { force: true });
  console.log('🗑️ Credenciais do rclone removidas');
  res.json({ success: true });
});

app.post('/api/admin/rclone/test', requireAdmin, async (req, res) => {
  const src = await getRcloneSource();
  if (!src) return res.status(409).json(RCLONE_NOT_CONFIGURED);

  const result = await runRclone(['lsd', src.remote, '--retries', '1', '--low-level-retries', '2', '--contimeout', '15s'], src, 60 * 1000);
  let payload;
  if (result.ok) {
    const folders = result.stdout.split('\n')
      .map(line => line.match(/^\s*-?\d+\s+\S+\s+\S+\s+-?\d+\s+(.+)$/))
      .filter(Boolean).map(m => m[1]);
    payload = { ok: true, folders, message: `Ligação OK: ${folders.length} pasta(s) encontrada(s) em ${src.remote}` };
  } else {
    const err = describeRcloneError(result);
    payload = { ok: false, code: err.code, message: err.message };
  }

  if (src.source === 'stored') {
    const state = await readRcloneState();
    state.lastTest = { ok: payload.ok, at: new Date().toISOString(), message: payload.message };
    await writeRcloneState(state);
  }
  res.status(payload.ok ? 200 : 502).json({ ...payload, source: src.source, remote: src.remote });
});

// ========================================
// ROTA - SINCRONIZAR COM GOOGLE DRIVE (rclone)
// ========================================
async function syncDrive(req, res, collectionName) {
  if (collectionName !== null && !isValidFolderPath(collectionName) && !isValidCollectionName(collectionName)) {
    return res.status(400).json({ error: 'Nome de coleção inválido' });
  }
  const src = await getRcloneSource();
  if (!src) return res.status(409).json(RCLONE_NOT_CONFIGURED);

  let started;
  try {
    const allowEmpty = req.query['allow-empty'] === '1' && collectionName === null;
    started = await media.runSync(collectionName, rebuildDatabase, undefined, { allowEmpty });
  } catch (error) {
    return res.status(409).json({ error: error.message, code: error.code, job: media.jobStatus() });
  }
  console.log(`☁️ Sincronização iniciada: ${collectionName || 'todas as coleções'} (${src.source})`);
  if (!req.query.wait) return res.status(202).json({ started: true, job: started.job });

  const job = await started.promise;
  if (job.error) {
    const status = ['RCLONE_AUTH', 'RCLONE_NOT_CONFIGURED'].includes(job.code) ? 409 : job.code === 'RCLONE_EMPTY' ? 400 : 502;
    return res.status(status).json({ error: job.error, code: job.code, job });
  }
  res.json({ success: true, job });
}

app.get('/api/sync-drive/status', requireAdmin, (req, res) => res.json(media.jobStatus()));
app.post('/api/sync-drive', requireAdmin, (req, res) => syncDrive(req, res, null));
app.post('/api/sync-drive/:collectionName', requireAdmin, (req, res) => syncDrive(req, res, req.params.collectionName));

// ROTA - SINCRONIZAR MÚLTIPLAS COLEÇÕES (batch)
app.post('/api/sync-drive-batch', requireAdmin, async (req, res) => {
  try {
    const { collectionNames } = req.body || {};
    if (!Array.isArray(collectionNames) || collectionNames.length === 0) {
      return res.status(400).json({ error: 'Lista de coleções inválida' });
    }
    // Valida cada coleção
    for (const name of collectionNames) {
      if (name !== null && !isValidFolderPath(name) && !isValidCollectionName(name)) {
        return res.status(400).json({ error: `Coleção inválida: ${name}` });
      }
    }
    const src = await getRcloneSource();
    if (!src) return res.status(409).json(RCLONE_NOT_CONFIGURED);

    let started;
    try {
      started = await media.runSync(null, rebuildDatabase, collectionNames);
    } catch (error) {
      return res.status(409).json({ error: error.message, code: error.code, job: media.jobStatus() });
    }
    console.log(`☁️ Sincronização batch iniciada: ${collectionNames.length} coleções (${src.source})`);
    if (!req.query.wait) return res.status(202).json({ started: true, job: started.job });

    const job = await started.promise;
    if (job.error) {
      const status = ['RCLONE_AUTH', 'RCLONE_NOT_CONFIGURED'].includes(job.code) ? 409 : job.code === 'RCLONE_EMPTY' ? 400 : 502;
      return res.status(status).json({ error: job.error, code: job.code, job });
    }
    res.json({ success: true, job });
  } catch (error) {
    console.error('Erro na sincronização batch:', error);
    res.status(500).json({ error: 'Erro ao sincronizar' });
  }
});

app.post('/api/orphans/finalize', requireAdmin, async (req, res) => {
  const actions = req.body?.actions;
  if (!Array.isArray(actions) || actions.length === 0) {
    return res.status(400).json({ error: 'A lista de ações para reconciliar está vazia ou inválida.' });
  }

  const scopes = new Set();
  for (const action of actions) {
    if (!action || typeof action !== 'object' || Array.isArray(action)) {
      return res.status(400).json({ error: 'Ação inválida no JSON.' });
    }
    if (action.acao === 'apagar_pasta') {
      if (!isValidFolderPath(action.pasta)) {
        return res.status(400).json({ error: 'Caminho de pasta inválido no JSON.' });
      }
      scopes.add(action.pasta);
      continue;
    }
    if (action.acao === 'apagar_ficheiros') {
      if (!isValidFolderPath(action.pasta) || !Array.isArray(action.ficheiros) || action.ficheiros.length === 0 ||
          action.ficheiros.some(file => !isValidCollectionName(file) || !media.IMAGE_RE.test(file))) {
        return res.status(400).json({ error: 'Lista de ficheiros inválida no JSON.' });
      }
      scopes.add(action.pasta);
      continue;
    }
    return res.status(400).json({ error: `Ação não suportada no JSON: ${action.acao}` });
  }

  const src = await getRcloneSource();
  if (!src) return res.status(409).json(RCLONE_NOT_CONFIGURED);

  let started;
  try {
    started = await media.runSync(null, rebuildDatabase, [...scopes], {
      allowMissingScopes: true,
      reconcileOnly: true
    });
  } catch (error) {
    return res.status(409).json({ error: error.message, code: error.code, job: media.jobStatus() });
  }

  const job = await started.promise;
  if (job.error) {
    return res.status(502).json({ error: job.error, code: job.code, job });
  }
  res.json({ success: true, job });
});

// ========================================
// ROTA - ORFÃOS (pastas problema no Drive)
// ========================================
app.get('/api/orphans', requireAdmin, async (req, res) => {
  try {
    const [data, photosData, collectionsData] = await Promise.all([
      fs.readFile(ORPHANS_FILE, 'utf8').catch(() => '[]'),
      fs.readFile(DATA_FILE, 'utf8'),
      fs.readFile(COLLECTIONS_FILE, 'utf8')
    ]);
    let orphans = JSON.parse(data);
    const photos = JSON.parse(photosData);
    const collections = JSON.parse(collectionsData);
    
    // Filtra órfãs inválidas (que já não existem no Drive)
    orphans = filterValidOrphans(orphans, collections);
    
    // Se houve mudanças, atualiza o arquivo
    const oldCount = JSON.parse(data).length;
    if (orphans.length !== oldCount) {
      await fs.writeFile(ORPHANS_FILE, JSON.stringify(orphans, null, 2));
    }
    
    res.json(addUnassignedCollectionOrphans(orphans, collections, photos));
  } catch {
    res.status(500).json({ error: 'Erro ao carregar pastas órfãs' });
  }
});

// Limpar órfãs inválidas (pastas que já não existem no Drive)
app.post('/api/orphans/cleanup', requireAdmin, async (req, res) => {
  try {
    const [data, collectionsData] = await Promise.all([
      fs.readFile(ORPHANS_FILE, 'utf8').catch(() => '[]'),
      fs.readFile(COLLECTIONS_FILE, 'utf8')
    ]);
    
    const orphans = JSON.parse(data);
    const collections = JSON.parse(collectionsData);
    const originalCount = orphans.length;
    
    // Filtra órfãs inválidas
    const cleanedOrphans = filterValidOrphans(orphans, collections);
    const removedCount = originalCount - cleanedOrphans.length;
    
    // Atualiza o arquivo
    await fs.writeFile(ORPHANS_FILE, JSON.stringify(cleanedOrphans, null, 2));
    
    res.json({
      success: true,
      message: `Removidas ${removedCount} órfã(s) inválida(s)`,
      originalCount,
      cleanedCount: cleanedOrphans.length,
      removedCount
    });
  } catch (error) {
    console.error('Erro ao limpar órfãs:', error);
    res.status(500).json({ error: 'Erro ao limpar órfãs inválidas' });
  }
});

// ========================================
// ROTAS - BASE DE DADOS (admin only)
// ========================================
const DB_FILES = ['photos.json', 'collections.json', 'categories.json', 'settings.json', 'orphans.json'];

// Listar ficheiros da BD com metadados
app.get('/api/admin/database', requireAdmin, async (req, res) => {
  try {
    const files = [];
    for (const name of DB_FILES) {
      const filePath = path.join(DATA_DIR, name);
      try {
        const stat = await fs.stat(filePath);
        const content = await fs.readFile(filePath, 'utf8');
        let count = null;
        try {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) count = parsed.length;
          else if (parsed && typeof parsed === 'object') count = Object.keys(parsed).length;
        } catch {}
        files.push({ name, size: stat.size, modified: stat.mtime, count, exists: true });
      } catch {
        files.push({ name, size: 0, modified: null, count: null, exists: false });
      }
    }
    res.json(files);
  } catch (error) {
    console.error('Erro ao listar BD:', error);
    res.status(500).json({ error: 'Erro ao listar base de dados' });
  }
});

// Download de um ficheiro
app.get('/api/admin/database/:filename/download', requireAdmin, async (req, res) => {
  const filename = req.params.filename;
  if (!DB_FILES.includes(filename)) return res.status(400).json({ error: 'Ficheiro inválido' });
  const filePath = path.join(DATA_DIR, filename);
  try {
    await fs.access(filePath);
  } catch {
    return res.status(404).json({ error: 'Ficheiro não encontrado' });
  }
  res.download(filePath, filename);
});

// Obter conteúdo (para edição)
app.get('/api/admin/database/:filename', requireAdmin, async (req, res) => {
  const filename = req.params.filename;
  if (!DB_FILES.includes(filename)) return res.status(400).json({ error: 'Ficheiro inválido' });
  const filePath = path.join(DATA_DIR, filename);
  try {
    const content = await fs.readFile(filePath, 'utf8');
    res.json({ filename, content });
  } catch {
    return res.status(404).json({ error: 'Ficheiro não encontrado' });
  }
});

// Atualizar (upload) conteúdo
app.put('/api/admin/database/:filename', requireAdmin, async (req, res) => {
  const filename = req.params.filename;
  if (!DB_FILES.includes(filename)) return res.status(400).json({ error: 'Ficheiro inválido' });
  const { content } = req.body || {};
  if (typeof content !== 'string') return res.status(400).json({ error: 'Conteúdo inválido' });
  // Validar JSON
  try {
    JSON.parse(content);
  } catch (e) {
    return res.status(400).json({ error: 'JSON inválido: ' + e.message });
  }
  const filePath = path.join(DATA_DIR, filename);
  try {
    // Backup automático
    const backupPath = path.join(DATA_DIR, filename + '.bak');
    try { await fs.copyFile(filePath, backupPath); } catch {}
    await fs.writeFile(filePath, content);
    console.log(`📝 BD atualizada: ${filename}`);
    res.json({ success: true, message: `${filename} atualizado com sucesso` });
  } catch (error) {
    console.error('Erro ao atualizar BD:', error);
    res.status(500).json({ error: 'Erro ao atualizar ficheiro' });
  }
});

// Restaurar backup
app.post('/api/admin/database/:filename/restore', requireAdmin, async (req, res) => {
  const filename = req.params.filename;
  if (!DB_FILES.includes(filename)) return res.status(400).json({ error: 'Ficheiro inválido' });
  const filePath = path.join(DATA_DIR, filename);
  const backupPath = path.join(DATA_DIR, filename + '.bak');
  try {
    await fs.copyFile(backupPath, filePath);
    console.log(`↩️ BD restaurada: ${filename}`);
    res.json({ success: true, message: `${filename} restaurado do backup` });
  } catch {
    res.status(404).json({ error: 'Backup não encontrado' });
  }
});

// Rota para obter o URL do Apps Script (para o botão "Abrir Apps Script")
app.get('/api/apps-script-url', requireAdmin, (req, res) => {
  res.json({ url: APPS_SCRIPT_URL });
});
app.get('/api/health', (req, res) => res.json({ ok: true }));

// ========================================
// FRONTEND (build do Vite) + fallback da SPA
// ========================================
const INDEX_HTML = path.join(FRONTEND_DIR, 'index.html');
app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada' }));
if (fsSync.existsSync(INDEX_HTML)) {
  app.use(express.static(FRONTEND_DIR, {
    index: false,
    setHeaders(res, filePath) {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }));
  app.get(/^\/(?!api(\/|$)|photos\/).*/, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(INDEX_HTML);
  });
} else {
  console.log(`ℹ️ Sem frontend compilado em ${FRONTEND_DIR} (normal em desenvolvimento: usar o Vite na porta 5173)`);
}

app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error('💥 Erro:', err.message);
  if (res.headersSent) return;
  res.status(status).json({ error: status === 413 ? 'Pedido demasiado grande' : status < 500 ? 'Pedido inválido' : 'Erro interno' });
});

// ========================================
// INICIA O SERVIDOR
// ========================================
Promise.all([initDataFiles(), loadSessionSecret(), media.init()]).then(() => {
  if (!media.sharpAvailable()) console.warn('⚠️ sharp não carregou: a sincronização não consegue gerar miniaturas.');
  const loginProblem = adminLoginProblem();
  if (loginProblem) console.warn(`⚠️ Login de administrador desativado: ${loginProblem}`);
  app.listen(PORT, () => {
    console.log(`🚀 Servidor a correr em http://localhost:${PORT}`);
    console.log(`📸 Fotos em ${PHOTOS_DIR} | 💾 Dados em ${DATA_DIR}`);
  });
}).catch((error) => {
  console.error('💥 Erro ao iniciar:', error);
  process.exit(1);
});