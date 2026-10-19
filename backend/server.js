// ========================================
// backend/server.js - API + frontend num só contentor
// ========================================
// Paulo: resumo do que mudou desde a versão com dois contentores (nginx + backend):
//  - Este servidor Express passou a servir tudo: a API (/api), as imagens (/photos) e o site compilado.
//    Assim há um só contentor e o Coolify só precisa de apontar o domínio para a porta 3000.
//  - O login passou a criar uma sessão a sério (token assinado num cookie). Antes, o "modo admin" era só
//    uma variável no browser e qualquer pessoa podia chamar a API de escrita diretamente.
//  - Todos os comandos externos (rclone, exiftool) correm com execFile/spawn, sem shell, para que nomes
//    de pastas ou ficheiros nunca possam ser interpretados como comandos.
//  - As credenciais do Google Drive são introduzidas no ecrã "Ligação ao Drive" e ficam guardadas só no servidor.
//  - O servidor já não guarda os originais: gera miniaturas e versões web (ver media.js) e vai buscar o
//    original ao Drive quando alguém o pede.
// O resumo da revisão de segurança está em SEGURANCA.md.
const express = require('express');
const helmet = require('helmet');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
// Paulo: só execFile (sem shell). Antes usávamos exec com o comando montado numa string.
const { execFile } = require('child_process');
const { createMedia } = require('./media');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Pasta das fotos no formato antigo (fotos_gdrive/<coleção>/<ficheiro>), dentro do volume /dados_privados
const PHOTOS_DIR = path.resolve(process.env.PHOTOS_DIR || '/dados_privados/fotos_gdrive');

// Paulo: os JSON passaram para uma pasta configurável (no Coolify é o volume /data), porque dentro da
// imagem perdiam-se a cada deploy. Num volume vazio, os JSON do repositório servem de dados iniciais.
const DATA_DIR = path.resolve(process.env.DATA_DIR || __dirname);
const SEED_DIR = path.resolve(process.env.SEED_DIR || path.join(__dirname, 'seed'));
const DATA_FILE = path.join(DATA_DIR, 'photos.json');
const COLLECTIONS_FILE = path.join(DATA_DIR, 'collections.json');
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// Paulo: ficheiros privados (credenciais do rclone e segredo das sessões) numa pasta só para eles,
// sempre com permissões 600 (só o utilizador do contentor os lê).
const PRIVATE_DIR = path.resolve(process.env.PRIVATE_DIR || path.join(DATA_DIR, 'private'));
const RCLONE_CONF = path.join(PRIVATE_DIR, 'rclone.conf');
const RCLONE_STATE = path.join(PRIVATE_DIR, 'rclone-state.json');
const SESSION_SECRET_FILE = path.join(PRIVATE_DIR, 'session_secret');
// Configuração antiga (o teu rclone.conf colocado à mão no volume das fotos) continua a funcionar
const LEGACY_RCLONE_CONF = process.env.LEGACY_RCLONE_CONF || path.join(path.dirname(PHOTOS_DIR), 'rclone.conf');
const REMOTE_NAME = 'gdrive';

// Miniaturas e versões web (WebP) geradas na sincronização; os originais ficam no Drive
const DERIVED_DIR = path.resolve(process.env.DERIVED_DIR || path.join(path.dirname(PHOTOS_DIR), 'derivados'));
const ORIGINAL_CACHE_DIR = path.resolve(process.env.ORIGINAL_CACHE_DIR || path.join(path.dirname(PHOTOS_DIR), 'cache-originais'));
const ORIGINAL_CACHE_MB = Math.max(0, Number(process.env.ORIGINAL_CACHE_MB || 0) || 0);
const ORIGINALS_PUBLIC = !/^(0|false|no|nao|não)$/i.test(process.env.ORIGINALS_PUBLIC || 'true');
const KEEP_LOCAL_ORIGINALS = /^(1|true|yes|sim)$/i.test(process.env.KEEP_LOCAL_ORIGINALS || 'false');
const SYNC_CONCURRENCY = Math.min(8, Math.max(1, Number(process.env.SYNC_CONCURRENCY || 3) || 3));
// Paulo: as coordenadas GPS do EXIF podem revelar onde vives ou de onde fotografas. Por omissão
// deixam de ser mostradas aos visitantes (na API e nos originais). Tu, com sessão iniciada, continuas a vê-las.
const SHOW_GPS = /^(1|true|yes|sim)$/i.test(process.env.SHOW_GPS || 'false');
// Paulo: limite de originais a ser transferidos do Drive ao mesmo tempo, para que ninguém consiga
// esgotar a ligação ou a quota do Drive a pedir originais em massa.
const MAX_ORIGINAL_STREAMS = Math.max(1, Number(process.env.MAX_ORIGINAL_STREAMS || 4) || 4);

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

// Frontend compilado (Vite build), servido pelo próprio Express em produção
const FRONTEND_DIR = path.resolve(process.env.FRONTEND_DIR || path.join(__dirname, 'public'));

const COOKIE_NAME = 'pinhality_session';
const COOKIE_SECURE = (process.env.COOKIE_SECURE || 'auto').toLowerCase();
const SESSION_TTL_MS = Math.max(1, Number(process.env.SESSION_TTL_HOURS || 168) || 168) * 60 * 60 * 1000;

// ========================================
// SEGURANÇA DOS PEDIDOS
// ========================================

// Paulo: antes estava "trust proxy = true", o que fazia o Express acreditar no cabeçalho X-Forwarded-For
// de qualquer pessoa. Assim, um atacante podia fingir outro IP e fugir ao limite de tentativas de login.
// Agora só se confia em proxies de redes privadas (o Traefik do Coolify está na rede interna do Docker).
app.set('trust proxy', process.env.TRUST_PROXY || 'loopback, linklocal, uniquelocal');
app.disable('x-powered-by');

// Paulo: cabeçalhos de segurança (helmet). O mais importante é a Content-Security-Policy: o browser só
// executa scripts e estilos servidos por este site. Isto só foi possível porque o Tailwind deixou de vir
// da CDN (agora é compilado no build), por isso o site já não depende de nenhum servidor de terceiros
// e os visitantes não são seguidos por eles.
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
  // HSTS é enviado abaixo só quando o pedido chegou por HTTPS (no Coolify), para não estragar o
  // desenvolvimento em http://localhost.
  strictTransportSecurity: false,
  referrerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  xFrameOptions: { action: 'deny' }
}));
app.use((req, res, next) => {
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  // Paulo: o browser deixa de oferecer câmara, microfone e localização a este site (não precisa deles).
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  next();
});

// Paulo: antes o limite do corpo dos pedidos era 50 MB. A app não recebe ficheiros pelo browser
// (as fotos chegam do Drive), por isso 1 MB chega e evita que alguém encha a memória do servidor.
app.use(express.json({ limit: '1mb' }));

// Paulo: proteção extra contra CSRF (um site malicioso a fazer pedidos em teu nome enquanto tens a sessão aberta).
// O cookie já é SameSite=Strict, mas aqui recusamos também qualquer pedido de escrita que o browser
// marque como vindo de outro site.
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') {
    return res.status(403).json({ error: 'Pedido recusado (origem diferente).', code: 'CROSS_SITE' });
  }
  next();
});

// ========================================
// IMAGENS
// ========================================

// Miniaturas (~400px) e versões web (~1600px) em WebP, só para fotos conhecidas no manifesto
for (const kind of ['thumb', 'web']) {
  app.get(`/photos/${kind}/:col/:file`, (req, res) => {
    const file = media.derivedFile(kind, req.params.col, req.params.file);
    if (!file) return res.status(404).end();
    res.sendFile(file, { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=604800' } });
  });
}
// Original em resolução completa, obtido do Drive a pedido (ou do disco no formato antigo)
app.get('/photos/original/:col/:file', (req, res, next) => {
  if (!ORIGINALS_PUBLIC) return requireAdmin(req, res, next);
  next();
}, (req, res) => {
  // Paulo: visitantes recebem o original sem as coordenadas GPS (a não ser que SHOW_GPS=true)
  const stripGps = !SHOW_GPS && !getSession(req);
  media.serveOriginal(req, res, req.params.col, req.params.file, { stripGps }).catch((error) => {
    console.error('Erro ao servir original:', error.message);
    if (!res.headersSent) res.status(500).json({ error: 'Erro ao obter o original' });
  });
});
// Paulo: a pasta antiga das fotos só serve imagens. Antes servia qualquer ficheiro que lá estivesse
// (por exemplo um .html vindo do Drive, que correria como se fosse deste site).
app.use('/photos', (req, res, next) => {
  if (!media.IMAGE_RE.test(req.path)) return res.status(404).end();
  next();
}, express.static(PHOTOS_DIR, { dotfiles: 'ignore', index: false, redirect: false }));
// Fotos já convertidas: o caminho antigo devolve a versão web
app.get('/photos/:col/:file', (req, res) => {
  const file = media.derivedFile('web', req.params.col, `${req.params.file}.webp`);
  if (!file) return res.status(404).end();
  res.sendFile(file, { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=604800' } });
});

// ========================================
// AUTENTICAÇÃO - token assinado (HMAC) em cookie httpOnly ou "Authorization: Bearer"
// ========================================
// Paulo: antes, o login só respondia "ok" e o browser passava a mostrar os botões de admin; a API em si
// não verificava nada. Agora o login devolve um token assinado com um segredo que só o servidor conhece,
// guardado num cookie httpOnly (o JavaScript da página não o consegue ler) e SameSite=Strict
// (o browser não o envia em pedidos vindos de outros sites). Todas as rotas de escrita exigem este token.
let sessionSecret = null;

async function loadSessionSecret() {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 16) {
    sessionSecret = fromEnv;
    return;
  }
  if (fromEnv) console.warn('⚠️ SESSION_SECRET tem menos de 16 caracteres; a usar um segredo gerado.');
  // Paulo: sem SESSION_SECRET, gera-se um segredo aleatório e guarda-se no volume, para que as sessões
  // sobrevivam a um restart.
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

// Paulo: a chave de assinatura também depende do utilizador e da palavra-passe de admin. Se mudares a
// palavra-passe no Coolify, todas as sessões antigas deixam de valer automaticamente.
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

// Paulo: tokens de sessões terminadas com "Logout" ficam recusados até expirarem
const revokedTokens = new Map(); // jti -> exp

function verifyToken(token) {
  if (typeof token !== 'string' || !token || token.length > 1000) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload));
  // Paulo: comparação em tempo constante, para não dar pistas sobre a assinatura correta
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

// Paulo: comparação de utilizador/palavra-passe em tempo constante (o "===" responde mais depressa quando
// as primeiras letras estão erradas, o que em teoria permite adivinhar a palavra-passe aos poucos)
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Paulo: em produção recusamos palavras-passe óbvias (por exemplo o admin/admin do ambiente de
// desenvolvimento), para que nunca fiquem ativas no site público por engano.
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

// Paulo: limite de tentativas de login falhadas por IP (10 em 15 minutos), para travar quem tente
// adivinhar a palavra-passe por força bruta.
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
// Limpeza periódica (evita que estes mapas cresçam sem fim)
setInterval(() => {
  const now = Date.now();
  for (const [ip, e] of loginFailures) if (now - e.first > 15 * 60 * 1000) loginFailures.delete(ip);
  for (const [jti, exp] of revokedTokens) if (exp < now) revokedTokens.delete(jti);
}, 10 * 60 * 1000).unref();

// ========================================
// VALIDAÇÃO DOS DADOS RECEBIDOS
// ========================================
// Paulo: antes, POST /api/photos gravava no photos.json tudo o que viesse no pedido. Agora só aceitamos
// os campos que a app usa, com tamanhos máximos, e o imageUrl tem de ser photos/<coleção>/<ficheiro de imagem>.
const PHOTO_TEXT_FIELDS = {
  title: 300, location: 300, description: 5000, date: 10, time: 8,
  aperture: 20, iso: 20, shutterSpeed: 20, focalLength: 20, camera: 200, lens: 200,
  exposureMode: 100, meteringMode: 100, exposureCompensation: 30, whiteBalance: 100, focusMode: 100,
  copyright: 300, gpsLatitude: 100, gpsLongitude: 100
};
const GPS_FIELDS = ['gpsLatitude', 'gpsLongitude'];

function cleanText(value, max) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, max);
}

function validatePhotoInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Dados inválidos' };
  const photo = {};
  for (const [field, max] of Object.entries(PHOTO_TEXT_FIELDS)) {
    if (body[field] !== undefined) photo[field] = cleanText(body[field], max);
  }
  if (!photo.title || !photo.title.trim()) return { error: 'O título é obrigatório' };
  const url = String(body.imageUrl || '');
  const parts = url.split('/');
  if (!(parts.length === 3 && parts[0] === 'photos' && isValidCollectionName(parts[1]) && isValidCollectionName(parts[2]) && media.IMAGE_RE.test(parts[2])) &&
      !(parts.length === 2 && parts[0] === 'photos' && isValidCollectionName(parts[1]) && media.IMAGE_RE.test(parts[1]))) {
    return { error: 'Caminho da imagem inválido (photos/<coleção>/<ficheiro>)' };
  }
  photo.imageUrl = url;
  if (body.collection === null || body.collection === undefined || body.collection === '') photo.collection = null;
  else if (isValidCollectionName(String(body.collection))) photo.collection = String(body.collection);
  else return { error: 'Coleção inválida' };
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

// Nomes de categorias: texto simples, sem caracteres de controlo, até 100 caracteres
function validCategoryName(name) {
  return typeof name === 'string' && name.trim().length > 0 && name.length <= 100 && !/[\u0000-\u001f\u007f]/.test(name);
}

// Paulo: os visitantes não recebem as coordenadas GPS (ver SHOW_GPS acima)
function publicView(req, obj) {
  if (SHOW_GPS || getSession(req)) return obj;
  const copy = { ...obj };
  for (const f of GPS_FIELDS) delete copy[f];
  return copy;
}

// ========================================
// INICIALIZAÇÃO DE FICHEIROS
// ========================================
async function initDataFiles() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(PHOTOS_DIR, { recursive: true }).catch(() => {});
  // Volume vazio: copia os JSON do repositório antes de criar ficheiros novos
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
  } catch {
    await fs.writeFile(COLLECTIONS_FILE, JSON.stringify([], null, 2));
    console.log('📁 Ficheiro collections.json criado');
  }

  try {
    await fs.access(CATEGORIES_FILE);
  } catch {
    const defaultCategories = ['Praia', 'Urbano', 'Manifestações', 'Comícios', 'Natureza', 'Retrato', 'Arquitetura', 'Noturna'];
    await fs.writeFile(CATEGORIES_FILE, JSON.stringify(defaultCategories, null, 2));
    console.log('📁 Ficheiro categories.json criado');
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
    // Paulo: só aceita uma coleção válida (ou nenhuma)
    if (collectionId !== null && collectionId !== undefined && !isValidCollectionName(collectionId)) {
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
// ROTA - SYNC completo (pastas + fotos)
// ========================================

// Paulo: o "Atualizar BD" passou a considerar também as fotos convertidas (que já não têm o original no
// disco), senão apagava-as todas da base de dados.
// Imagens disponíveis = originais locais (formato antigo) + fotos convertidas (manifesto dos derivados)
async function listAvailableImages() {
  const images = new Map(); // imageUrl -> { col, file, exif }
  const folders = new Set();
  const items = await fs.readdir(PHOTOS_DIR, { withFileTypes: true }).catch(() => []);
  for (const item of items) {
    if (!item.isDirectory()) continue;
    folders.add(item.name);
    const files = await fs.readdir(path.join(PHOTOS_DIR, item.name)).catch(() => []);
    for (const file of files) {
      if (/\.(jpe?g|png)$/i.test(file)) images.set(`photos/${item.name}/${file}`, { col: item.name, file, exif: null });
    }
  }
  for (const { col, file, entry } of media.listEntries()) {
    folders.add(col);
    images.set(`photos/${col}/${file}`, { col, file, exif: entry.exif || {} });
  }
  return { images, folders: [...folders] };
}

// Atualiza collections.json e photos.json a partir das imagens disponíveis
async function rebuildDatabase() {
  const { images, folders } = await listAvailableImages();

  // FASE 1: COLEÇÕES
  const collectionsData = await fs.readFile(COLLECTIONS_FILE, 'utf8');
  let collections = JSON.parse(collectionsData);
  const existingCollectionIds = new Set(collections.map(c => c.id));
  let newCollections = 0;
  let removedCollections = 0;

  for (const folderName of folders) {
    if (!existingCollectionIds.has(folderName)) {
      collections.push({
        id: folderName,
        name: folderName
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' '),
        description: `Coleção gerada automaticamente`,
        createdAt: new Date().toISOString(),
        photoCount: 0
      });
      newCollections++;
      console.log(`✨ Nova coleção criada: ${folderName}`);
    }
  }
  const foldersSet = new Set(folders);
  collections = collections.filter(col => {
    if (foldersSet.has(col.id)) return true;
    removedCollections++;
    console.log(`🗑️ Coleção removida (pasta não existe): ${col.name}`);
    return false;
  });
  await fs.writeFile(COLLECTIONS_FILE, JSON.stringify(collections, null, 2));

  // FASE 2: FOTOS
  const photosData = await fs.readFile(DATA_FILE, 'utf8');
  let photos = JSON.parse(photosData);
  const existingImageUrls = new Set(photos.map(p => p.imageUrl));
  let newPhotos = 0;
  let removedPhotos = 0;
  let exifFilled = 0;

  // Preenche os campos EXIF vazios (nunca apaga o que foi editado à mão)
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

  for (const [imageUrl, info] of images) {
    if (existingImageUrls.has(imageUrl)) continue;
    const newPhoto = {
      id: Date.now() + Math.random(),
      title: info.file.replace(/\.[^.]+$/, ''),
      imageUrl,
      collection: info.col,
      categories: [],
      location: '',
      date: '',
      time: '',
      description: 'Adicionada automaticamente - editar para completar',
      timestamp: Date.now()
    };
    fillExif(newPhoto, info.exif);
    photos.push(newPhoto);
    newPhotos++;
  }

  const validPhotos = [];
  for (const photo of photos) {
    const info = images.get(photo.imageUrl);
    if (info) {
      if (fillExif(photo, info.exif)) exifFilled++;
      validPhotos.push(photo);
      continue;
    }
    // Caminhos fora do formato photos/<coleção>/<ficheiro>: verifica o disco
    const filePath = path.resolve(PHOTOS_DIR, String(photo.imageUrl || '').replace(/^photos\//, ''));
    if (filePath.startsWith(PHOTOS_DIR + path.sep) && fsSync.existsSync(filePath)) {
      validPhotos.push(photo);
    } else {
      removedPhotos++;
      console.log(`🗑️ Foto removida (ficheiro não existe): ${photo.title}`);
    }
  }
  photos = validPhotos;
  await fs.writeFile(DATA_FILE, JSON.stringify(photos, null, 2));

  return {
    success: true,
    collections: { total: collections.length, new: newCollections, removed: removedCollections },
    photos: { total: photos.length, new: newPhotos, removed: removedPhotos, exifFilled }
  };
}

// Paulo: "Atualizar BD" passou de GET para POST. Um GET que altera dados pode ser disparado só por abrir
// um link ou uma imagem; os pedidos de escrita devem ser sempre POST/PUT/DELETE.
app.post('/api/sync', requireAdmin, async (req, res) => {
  try {
    res.json(await rebuildDatabase());
  } catch (error) {
    console.error('Erro ao sincronizar:', error);
    res.status(500).json({ error: 'Erro ao sincronizar pastas e fotos' });
  }
});

// ========================================
// ROTA - SCAN de pastas
// ========================================

app.post('/api/collections/scan', requireAdmin, async (req, res) => {
  try {
    const photosDir = PHOTOS_DIR;
    
    const items = await fs.readdir(photosDir, { withFileTypes: true });
    const folders = items
      .filter(item => item.isDirectory())
      .map(item => item.name);
    
    const collectionsData = await fs.readFile(COLLECTIONS_FILE, 'utf8');
    let collections = JSON.parse(collectionsData);
    
    const existingIds = new Set(collections.map(c => c.id));
    
    let newCollections = 0;
    let skippedCollections = 0;
    
    for (const folderName of folders) {
      const collectionId = folderName;
      
      if (existingIds.has(collectionId)) {
        console.log(`⏭️  Coleção já existe: ${folderName}`);
        skippedCollections++;
        continue;
      }
      
      const newCollection = {
        id: collectionId,
        name: folderName
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' '),
        description: `Coleção gerada automaticamente da pasta ${folderName}`,
        createdAt: new Date().toISOString(),
        photoCount: 0
      };
      
      collections.push(newCollection);
      newCollections++;
      console.log(`✨ Nova coleção criada: ${newCollection.name}`);
    }
    
    if (newCollections > 0) {
      await fs.writeFile(COLLECTIONS_FILE, JSON.stringify(collections, null, 2));
    }
    
    res.json({ 
      success: true, 
      foldersFound: folders.length,
      newCollections,
      skippedCollections,
      collections 
    });
  } catch (error) {
    console.error('Erro ao escanear pastas:', error);
    res.status(500).json({ error: 'Erro ao escanear pastas' });
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
      photoCount: photos.filter(p => p.collection === col.id).length
    }));
    
    res.json(collections);
  } catch (error) {
    console.error('Erro ao ler coleções:', error);
    res.status(500).json({ error: 'Erro ao ler coleções' });
  }
});

app.post('/api/collections', requireAdmin, async (req, res) => {
  try {
    const { name, description, setAsActive } = req.body || {};
    
    // Paulo: tipos e tamanhos verificados (antes um nome que não fosse texto rebentava o servidor)
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
    
    const newCollection = {
      id,
      name: name.trim(),
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
    
    console.log(`✅ Coleção criada: ${name}`);
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

app.delete('/api/collections/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const data = await fs.readFile(COLLECTIONS_FILE, 'utf8');
    let collections = JSON.parse(data);
    
    collections = collections.filter(c => c.id !== id);
    await fs.writeFile(COLLECTIONS_FILE, JSON.stringify(collections, null, 2));
    
    const settingsData = await fs.readFile(SETTINGS_FILE, 'utf8');
    const settings = JSON.parse(settingsData);
    if (settings.activeCollection === id) {
      settings.activeCollection = null;
      settings.lastUpdated = new Date();
      await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    }
    
    const photosData = await fs.readFile(DATA_FILE, 'utf8');
    let photos = JSON.parse(photosData);
    photos = photos.map(p => {
      if (p.collection === id) {
        return { ...p, collection: null };
      }
      return p;
    });
    await fs.writeFile(DATA_FILE, JSON.stringify(photos, null, 2));
    
    console.log(`🗑️ Coleção eliminada: ${id}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao eliminar coleção:', error);
    res.status(500).json({ error: 'Erro ao eliminar coleção' });
  }
});

// ========================================
// ROTAS - CATEGORIES
// ========================================

app.get('/api/categories', async (req, res) => {
  try {
    const data = await fs.readFile(CATEGORIES_FILE, 'utf8');
    const categories = JSON.parse(data);
    res.json(categories);
  } catch (error) {
    console.error('Erro ao ler categorias:', error);
    res.status(500).json({ error: 'Erro ao ler categorias' });
  }
});

app.post('/api/categories', requireAdmin, async (req, res) => {
  try {
    const { name } = req.body || {};
    
    if (!validCategoryName(name)) {
      return res.status(400).json({ error: 'Nome da categoria é obrigatório (máx. 100 caracteres)' });
    }
    
    const data = await fs.readFile(CATEGORIES_FILE, 'utf8');
    let categories = JSON.parse(data);
    
    if (categories.includes(name.trim())) {
      return res.status(400).json({ error: 'Categoria já existe' });
    }
    
    categories.push(name.trim());
    await fs.writeFile(CATEGORIES_FILE, JSON.stringify(categories, null, 2));
    
    console.log(`✅ Categoria criada: ${name}`);
    res.json(categories);
  } catch (error) {
    console.error('Erro ao criar categoria:', error);
    res.status(500).json({ error: 'Erro ao criar categoria' });
  }
});

app.put('/api/categories/:oldName', requireAdmin, async (req, res) => {
  try {
    const { oldName } = req.params;
    const { newName } = req.body || {};
    
    if (!validCategoryName(newName)) {
      return res.status(400).json({ error: 'Novo nome é obrigatório (máx. 100 caracteres)' });
    }
    
    const data = await fs.readFile(CATEGORIES_FILE, 'utf8');
    let categories = JSON.parse(data);
    
    const index = categories.indexOf(oldName);
    if (index === -1) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }
    
    categories[index] = newName.trim();
    await fs.writeFile(CATEGORIES_FILE, JSON.stringify(categories, null, 2));
    
    const photosData = await fs.readFile(DATA_FILE, 'utf8');
    let photos = JSON.parse(photosData);
    photos = photos.map(p => {
      if (Array.isArray(p.categories)) {
        return { 
          ...p, 
          categories: p.categories.map(cat => cat === oldName ? newName.trim() : cat)
        };
      }
      if (p.category === oldName) {
        return { ...p, category: newName.trim() };
      }
      return p;
    });
    await fs.writeFile(DATA_FILE, JSON.stringify(photos, null, 2));
    
    console.log(`✅ Categoria renomeada: ${oldName} → ${newName}`);
    res.json(categories);
  } catch (error) {
    console.error('Erro ao renomear categoria:', error);
    res.status(500).json({ error: 'Erro ao renomear categoria' });
  }
});

app.delete('/api/categories/:name', requireAdmin, async (req, res) => {
  try {
    const { name } = req.params;
    
    const data = await fs.readFile(CATEGORIES_FILE, 'utf8');
    let categories = JSON.parse(data);
    
    categories = categories.filter(c => c !== name);
    await fs.writeFile(CATEGORIES_FILE, JSON.stringify(categories, null, 2));
    
    const photosData = await fs.readFile(DATA_FILE, 'utf8');
    let photos = JSON.parse(photosData);
    photos = photos.map(p => {
      if (Array.isArray(p.categories)) {
        return { 
          ...p, 
          categories: p.categories.filter(cat => cat !== name) 
        };
      }
      if (p.category === name) {
        return { ...p, category: null };
      }
      return p;
    });
    await fs.writeFile(DATA_FILE, JSON.stringify(photos, null, 2));
    
    console.log(`🗑️ Categoria eliminada: ${name}`);
    res.json(categories);
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
    
    photos = photos.map(photo => {
      if (!photo.collection && photo.imageUrl) {
        const pathParts = photo.imageUrl.split('/');
        if (pathParts.length > 2) {
          const detectedCollection = pathParts[1];
          photo = { ...photo, collection: detectedCollection };
        }
      }
      // URLs da miniatura, da versão web e do original (calculados, não guardados)
      return publicView(req, { ...photo, ...media.urlsFor(photo.imageUrl) });
    });
    
    res.json(photos);
  } catch (error) {
    console.error('Erro ao ler fotos:', error);
    res.status(500).json({ error: 'Erro ao ler fotos' });
  }
});

app.post('/api/photos', requireAdmin, async (req, res) => {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    let photos = JSON.parse(data);
    
    // Paulo: validação dos campos (ver validatePhotoInput); campos desconhecidos são ignorados
    const { photo: body, error } = validatePhotoInput(req.body);
    if (error) return res.status(400).json({ error });
    const existing = body.id !== undefined ? photos.find(p => p.id === body.id) : null;
    const newPhoto = {
      ...(existing || {}),
      ...body,
      id: body.id || Date.now()
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
    // Os IDs podem ser inteiros ou decimais (fotos adicionadas pelo sync): compara como texto
    const photoId = String(req.params.id);
    const data = await fs.readFile(DATA_FILE, 'utf8');
    let photos = JSON.parse(data);
    
    photos = photos.filter(p => String(p.id) !== photoId);
    await fs.writeFile(DATA_FILE, JSON.stringify(photos, null, 2));
    
    console.log(`🗑️ Foto eliminada: ID ${photoId}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao eliminar foto:', error);
    res.status(500).json({ error: 'Erro ao eliminar foto' });
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

  // 1. EXIF guardado na sincronização (o original fica no Drive)
  const entry = media.entryFor(cleanImagePath);
  if (entry) return res.json(publicView(req, entry.exif || {}));

  // 2. Formato antigo: original no disco. O caminho tem de ficar dentro da pasta das fotos.
  // Paulo: antes o caminho ia para dentro de um comando exec entre aspas; um nome com aspas ou ";"
  // executava comandos, e "../" permitia ler ficheiros fora da pasta das fotos.
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
      // Paulo: Secure = o cookie só viaja por HTTPS. Atrás do Coolify o pedido chega ao contentor em HTTP,
      // mas o Traefik indica X-Forwarded-Proto=https e o "trust proxy" faz o req.secure ficar verdadeiro.
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
  // Paulo: além de apagar o cookie, o token fica recusado no servidor até expirar
  const session = getSession(req);
  if (session && session.jti) revokedTokens.set(session.jti, session.exp);
  res.clearCookie(COOKIE_NAME, { path: '/', httpOnly: true, sameSite: 'strict' });
  res.json({ success: true });
});

// ========================================
// RCLONE (Google Drive) - credenciais geridas na área de administração
// ========================================
// Paulo: antes o rclone.conf tinha de ser copiado à mão para o servidor. Agora introduzes o token e a
// pasta no ecrã "Ligação ao Drive" (só com sessão iniciada). O servidor grava o rclone.conf com
// permissões 600 e nunca devolve os segredos ao browser (só diz se existem).
// Recomendação: usa o âmbito só de leitura (drive.readonly); o site nunca precisa de escrever no Drive.

// Nome de coleção = nome de uma pasta. Sem barras, sem "..", sem caracteres de controlo.
// Paulo: também não pode começar por "-", para nunca ser lido como uma opção do rclone ou do exiftool.
function isValidCollectionName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 200 &&
    name.trim() === name && name !== '.' && name !== '..' &&
    !name.startsWith('-') && !/[\/\\\x00-\x1f\x7f]/.test(name);
}

// Valores que vão para o rclone.conf: uma linha, sem caracteres de controlo
// Paulo: sem isto, uma quebra de linha num campo permitiria acrescentar opções ao rclone.conf.
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

// O rclone renova o token de acesso e grava-o no rclone.conf; ao guardar, aproveita-se o mais recente.
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

// De onde vem a configuração do rclone: ecrã de administração > variáveis RCLONE_CONFIG_GDRIVE_* > ficheiro antigo
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

// Ambiente e argumentos para correr o rclone com a configuração escolhida
function rcloneEnvArgs(src) {
  const env = { ...process.env };
  const args = [];
  if (src.source !== 'env') {
    // Ficheiro guardado tem prioridade: as variáveis de ambiente não se podem sobrepor
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
  // Mensagem curta: só as linhas de erro, sem data/hora nem URLs longos
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    .filter(l => !/^Command failed:/.test(l))
    .filter(l => /ERROR|NOTICE|CRITICAL|Failed|error/i.test(l))
    .map(l => l.replace(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}\s+/, '').replace(/"https?:\/\/[^"]*"/g, '<url>'));
  const message = [...new Set(lines)].slice(-1).join(' | ').slice(0, 400) || 'Erro desconhecido do rclone';
  return { code, message };
}

const RCLONE_NOT_CONFIGURED = {
  error: 'A ligação ao Google Drive ainda não está configurada. Introduza as credenciais do rclone.',
  code: 'RCLONE_NOT_CONFIGURED'
};

// Estado atual (sem segredos)
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

// Guardar / atualizar credenciais. Campos secretos vazios = manter os atuais.
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

// Testar a ligação: lista as pastas (coleções) na pasta remota
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
// Paulo: antes esta rota corria `rclone sync "gdrive:fotos-site/${nome}" ...` com exec, e o nome vinha
// do pedido sem validação: dava para injetar comandos no servidor. Agora o nome é validado e todo o
// trabalho é feito em media.js com execFile/spawn (sem shell).
// A sincronização corre em segundo plano; o estado vê-se em GET /api/sync-drive/status.
// Com ?wait=1 a resposta só chega no fim (útil para scripts e testes).
async function syncDrive(req, res, collectionName) {
  if (collectionName !== null && !isValidCollectionName(collectionName)) {
    return res.status(400).json({ error: 'Nome de coleção inválido' });
  }
  const src = await getRcloneSource();
  if (!src) return res.status(409).json(RCLONE_NOT_CONFIGURED);

  let started;
  try {
    started = await media.runSync(collectionName, rebuildDatabase);
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

app.get('/api/health', (req, res) => res.json({ ok: true }));

// ========================================
// FRONTEND (build do Vite) + fallback da SPA
// ========================================
// Paulo: o nginx saiu. O próprio Express serve o site compilado e devolve o index.html para qualquer
// caminho que não seja /api ou /photos (assim um refresh numa página interna continua a funcionar).
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

// Paulo: erros inesperados (por exemplo JSON mal formado) respondem com uma mensagem genérica.
// Antes o Express podia devolver a pilha do erro com caminhos internos do servidor.
// eslint-disable-next-line no-unused-vars
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
