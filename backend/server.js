// ========================================
// backend/server.js - API + frontend num só contentor
// ========================================
const express = require('express');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// Pasta das fotos (volume no Coolify, ../dados_privados em desenvolvimento)
const PHOTOS_DIR = path.resolve(process.env.PHOTOS_DIR || '/dados_privados/fotos_gdrive');

// Pasta dos dados JSON. No Coolify é o volume /data; em desenvolvimento fica a pasta do backend.
const DATA_DIR = path.resolve(process.env.DATA_DIR || __dirname);
const SEED_DIR = path.resolve(process.env.SEED_DIR || path.join(__dirname, 'seed'));
const DATA_FILE = path.join(DATA_DIR, 'photos.json');
const COLLECTIONS_FILE = path.join(DATA_DIR, 'collections.json');
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// Ficheiros privados (credenciais do rclone e segredo das sessões), sempre com permissões 600
const PRIVATE_DIR = path.resolve(process.env.PRIVATE_DIR || path.join(DATA_DIR, 'private'));
const RCLONE_CONF = path.join(PRIVATE_DIR, 'rclone.conf');
const RCLONE_STATE = path.join(PRIVATE_DIR, 'rclone-state.json');
const SESSION_SECRET_FILE = path.join(PRIVATE_DIR, 'session_secret');
// Configuração antiga (ficheiro colocado à mão no volume das fotos)
const LEGACY_RCLONE_CONF = process.env.LEGACY_RCLONE_CONF || path.join(path.dirname(PHOTOS_DIR), 'rclone.conf');
const REMOTE_NAME = 'gdrive';

// Frontend compilado (Vite build), servido pelo próprio Express em produção
const FRONTEND_DIR = path.resolve(process.env.FRONTEND_DIR || path.join(__dirname, 'public'));

const COOKIE_NAME = 'pinhality_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Middleware
app.set('trust proxy', true); // atrás do proxy do Coolify (HTTPS)
app.disable('x-powered-by');
app.use(express.json({ limit: '50mb' }));
// Servir as fotos diretamente da pasta privada
app.use('/photos', express.static(PHOTOS_DIR));

// ========================================
// AUTENTICAÇÃO - token assinado (HMAC) em cookie httpOnly ou "Authorization: Bearer"
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

function sign(data) {
  return crypto.createHmac('sha256', sessionSecret).update(data).digest('base64url');
}

function createToken(username) {
  const payload = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + SESSION_TTL_MS })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  if (typeof token !== 'string' || !token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Date.now()) return null;
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

// Limite simples de tentativas de login falhadas por IP
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
    const { collectionId } = req.body;
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

app.get('/api/sync', requireAdmin, async (req, res) => {
  try {
    const photosDir = PHOTOS_DIR;
    
    // FASE 1: ESCANEAR PASTAS E CRIAR COLEÇÕES
    const items = await fs.readdir(photosDir, { withFileTypes: true });
    const folders = items
      .filter(item => item.isDirectory())
      .map(item => item.name);
    
    const collectionsData = await fs.readFile(COLLECTIONS_FILE, 'utf8');
    let collections = JSON.parse(collectionsData);
    const existingCollectionIds = new Set(collections.map(c => c.id));
    
    let newCollections = 0;
    let removedCollections = 0;
    
    // Criar coleções para pastas novas
    for (const folderName of folders) {
      if (!existingCollectionIds.has(folderName)) {
        const newCollection = {
          id: folderName,
          name: folderName
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' '),
          description: `Coleção gerada automaticamente`,
          createdAt: new Date().toISOString(),
          photoCount: 0
        };
        collections.push(newCollection);
        newCollections++;
        console.log(`✨ Nova coleção criada: ${newCollection.name}`);
      }
    }
    
    // Remover coleções cujas pastas já não existem
    const foldersSet = new Set(folders);
    const collectionsToKeep = collections.filter(col => {
      if (foldersSet.has(col.id)) {
        return true;
      } else {
        removedCollections++;
        console.log(`🗑️ Coleção removida (pasta não existe): ${col.name}`);
        return false;
      }
    });
    collections = collectionsToKeep;
    
    await fs.writeFile(COLLECTIONS_FILE, JSON.stringify(collections, null, 2));
    
    // FASE 2: ESCANEAR FOTOS E ADICIONAR À BASE DE DADOS
    const photosData = await fs.readFile(DATA_FILE, 'utf8');
    let photos = JSON.parse(photosData);
    
    const existingImageUrls = new Set(photos.map(p => p.imageUrl));
    
    let newPhotos = 0;
    let removedPhotos = 0;
    
    // Escanear cada pasta/coleção
    for (const folderName of folders) {
      const folderPath = path.join(photosDir, folderName);
      
      try {
        const files = await fs.readdir(folderPath);
        const imageFiles = files.filter(file => /\.(jpe?g|png)$/i.test(file));
        
        // Adicionar fotos novas
        for (const fileName of imageFiles) {
          const imageUrl = `photos/${folderName}/${fileName}`;
          
          if (!existingImageUrls.has(imageUrl)) {
            const newPhoto = {
              id: Date.now() + Math.random(),
              title: fileName.replace(/\.(jpe?g|png)$/i, ''),
              imageUrl: imageUrl,
              collection: folderName,
              categories: [],
              location: '',
              date: '',
              time: '',
              description: 'Adicionada automaticamente - editar para completar',
              timestamp: Date.now()
            };
            
            photos.push(newPhoto);
            newPhotos++;
            console.log(`📸 Nova foto adicionada: ${fileName} [${folderName}]`);
          }
        }
      } catch (err) {
        console.error(`Erro ao ler pasta ${folderName}:`, err);
      }
    }
    
    // Remover fotos cujos ficheiros já não existem
    const validPhotos = [];
    for (const photo of photos) {
       const filePath = path.join(PHOTOS_DIR, photo.imageUrl.replace(/^photos\//, ''));
      try {
        await fs.access(filePath);
        validPhotos.push(photo);
      } catch {
        removedPhotos++;
        console.log(`🗑️ Foto removida (ficheiro não existe): ${photo.title}`);
      }
    }
    photos = validPhotos;
    
    await fs.writeFile(DATA_FILE, JSON.stringify(photos, null, 2));
    
    res.json({
      success: true,
      collections: {
        total: collections.length,
        new: newCollections,
        removed: removedCollections
      },
      photos: {
        total: photos.length,
        new: newPhotos,
        removed: removedPhotos
      }
    });
    
  } catch (error) {
    console.error('Erro ao sincronizar:', error);
    res.status(500).json({ error: 'Erro ao sincronizar pastas e fotos' });
  }
});

// ========================================
// ROTA - SCAN de pastas
// ========================================

app.get('/api/collections/scan', requireAdmin, async (req, res) => {
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
    const { name, description, setAsActive } = req.body;
    
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Nome da coleção é obrigatório' });
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
    const { name, description } = req.body;
    
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
    const { name } = req.body;
    
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Nome da categoria é obrigatório' });
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
    const { newName } = req.body;
    
    if (!newName || newName.trim() === '') {
      return res.status(400).json({ error: 'Novo nome é obrigatório' });
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
          return { ...photo, collection: detectedCollection };
        }
      }
      return photo;
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
    
    const newPhoto = {
      ...req.body,
      id: req.body.id || Date.now()
    };
    
    if (req.body.id !== undefined) {
      photos = photos.filter(p => p.id !== newPhoto.id);
    }
    
    photos.push(newPhoto);
    await fs.writeFile(DATA_FILE, JSON.stringify(photos, null, 2));
    
    console.log(`✅ Foto guardada: ${newPhoto.title} [${newPhoto.collection || 'Sem coleção'}]`);
    res.json(newPhoto);
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

app.get('/api/exif', (req, res) => {
  const { imagePath } = req.query;
  if (!imagePath) return res.status(400).json({ error: 'imagePath é obrigatório' });
  
  const cleanImagePath = imagePath.trim();
  if (!cleanImagePath.startsWith('photos/') || !/\.(jpe?g)$/i.test(cleanImagePath)) {
    return res.status(400).json({ error: 'Caminho inválido' });
  }
  
  // O caminho tem de ficar dentro da pasta das fotos (sem "../")
  const fullPath = path.resolve(PHOTOS_DIR, cleanImagePath.replace(/^photos\//, ''));
  if (!fullPath.startsWith(PHOTOS_DIR + path.sep)) {
    return res.status(400).json({ error: 'Caminho inválido' });
  }
  const args = ['-j', '-DateTimeOriginal', '-ISOSpeedRatings', '-ISO', '-FNumber', '-ExposureTime', '-FocalLength',
    '-Make', '-Model', '-LensModel', '-ExposureProgram', '-MeteringMode', '-ExposureCompensation', '-WhiteBalance',
    '-FocusMode', '-Copyright', '-GPSLatitude', '-GPSLongitude', '-GPSLatitudeRef', '-GPSLongitudeRef', fullPath];
  
  execFile('exiftool', args, { timeout: 30 * 1000 }, (error, stdout, stderr) => {
    if (error) {
      console.error('❌ Erro no exiftool:', stderr || error.message);
      return res.status(500).json({ error: 'Erro ao executar exiftool' });
    }
    
    try {
      const data = JSON.parse(stdout)[0] || {};
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
        const et = data.ExposureTime;
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
      
      res.json(result);
    } catch (parseError) {
      console.error('💥 Erro ao parsear JSON do exiftool:', parseError);
      res.status(500).json({ error: 'Erro ao processar resposta do exiftool' });
    }
  });
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

  if (!ADMIN_USER || !ADMIN_PASS) {
    return res.status(503).json({ success: false, message: 'ADMIN_USER e ADMIN_PASS não estão definidos no servidor.' });
  }

  if (typeof username === 'string' && typeof password === 'string' &&
      safeEqual(username, ADMIN_USER) && safeEqual(password, ADMIN_PASS)) {
    loginFailures.delete(ip);
    const token = createToken(username);
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: req.secure,
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
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ success: true });
});

// ========================================
// RCLONE (Google Drive) - credenciais geridas na área de administração
// ========================================

// Nome de coleção = nome de uma pasta. Sem barras, sem "..", sem caracteres de controlo.
function isValidCollectionName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 200 &&
    name.trim() === name && name !== '.' && name !== '..' &&
    !name.startsWith('-') && !/[\/\\\x00-\x1f\x7f]/.test(name);
}

// Valores que vão para o rclone.conf: uma linha, sem caracteres de controlo
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

function runRclone(args, src, timeoutMs) {
  const env = { ...process.env };
  const fullArgs = [...args];
  if (src.source !== 'env') {
    // Ficheiro guardado tem prioridade: as variáveis de ambiente não se podem sobrepor
    for (const key of Object.keys(env)) if (key.startsWith('RCLONE_CONFIG_GDRIVE_')) delete env[key];
    fullArgs.push('--config', src.conf);
  }
  return new Promise((resolve) => {
    execFile('rclone', fullArgs, { env, timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
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
async function syncDrive(req, res, collectionName) {
  if (collectionName !== null && !isValidCollectionName(collectionName)) {
    return res.status(400).json({ error: 'Nome de coleção inválido' });
  }
  const src = await getRcloneSource();
  if (!src) return res.status(409).json(RCLONE_NOT_CONFIGURED);

  let remote = src.remote;
  let target = PHOTOS_DIR;
  if (collectionName !== null) {
    remote = joinRemote(src.remote, collectionName);
    target = path.join(PHOTOS_DIR, collectionName);
  } else {
    // Proteção: sincronizar uma pasta remota vazia apagaria todas as fotos locais
    const check = await runRclone(['lsd', src.remote, '--retries', '1'], src, 60 * 1000);
    if (!check.ok) {
      const err = describeRcloneError(check);
      return res.status(err.code === 'RCLONE_AUTH' ? 409 : 502).json({ error: err.message, code: err.code });
    }
    if (!check.stdout.trim()) {
      return res.status(400).json({ error: `A pasta remota ${src.remote} não tem subpastas. Verifique o ID da pasta e o caminho.`, code: 'RCLONE_EMPTY' });
    }
  }

  await fs.mkdir(target, { recursive: true });
  console.log(`☁️ rclone sync ${remote} → ${target} (${src.source})`);
  const result = await runRclone(['sync', remote, target, '-v'], src, 30 * 60 * 1000);
  if (!result.ok) {
    const err = describeRcloneError(result);
    console.error(`❌ Erro no rclone: ${err.message}`);
    return res.status(err.code === 'RCLONE_AUTH' ? 409 : 500).json({ error: `Erro ao sincronizar com o Google Drive: ${err.message}`, code: err.code });
  }
  const label = collectionName === null ? 'todas as coleções' : `a coleção ${collectionName}`;
  console.log(`☁️ rclone concluído para ${label}`);
  res.json({ success: true, message: `Sincronização de ${label} concluída!` });
}

app.post('/api/sync-drive', requireAdmin, (req, res) => syncDrive(req, res, null));
app.post('/api/sync-drive/:collectionName', requireAdmin, (req, res) => syncDrive(req, res, req.params.collectionName));

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

// ========================================
// INICIA O SERVIDOR
// ========================================
Promise.all([initDataFiles(), loadSessionSecret()]).then(() => {
  if (!process.env.ADMIN_USER || !process.env.ADMIN_PASS) {
    console.warn('⚠️ ADMIN_USER/ADMIN_PASS não definidos: o login de administrador está desativado.');
  }
  app.listen(PORT, () => {
    console.log(`🚀 Servidor a correr em http://localhost:${PORT}`);
    console.log(`📸 Fotos em ${PHOTOS_DIR} | 💾 Dados em ${DATA_DIR}`);
  });
}).catch((error) => {
  console.error('💥 Erro ao iniciar:', error);
  process.exit(1);
});
