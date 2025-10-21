// ========================================
// backend/server.js - VERSÃO COM SINCRONIZAÇÃO AUTOMÁTICA
// ========================================
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const { exec } = require('child_process');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'photos.json');
const COLLECTIONS_FILE = path.join(__dirname, 'collections.json');
const CATEGORIES_FILE = path.join(__dirname, 'categories.json');
const SETTINGS_FILE = path.join(__dirname, 'settings.json');

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// ========================================
// INICIALIZAÇÃO DE FICHEIROS
// ========================================
async function initDataFiles() {
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

app.put('/api/settings/active-collection', async (req, res) => {
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

app.get('/api/sync', async (req, res) => {
  try {
    const photosDir = path.join(__dirname, 'public', 'photos');
    
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
      const filePath = path.join(__dirname, 'public', photo.imageUrl);
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

app.get('/api/collections/scan', async (req, res) => {
  try {
    const photosDir = path.join(__dirname, 'public', 'photos');
    
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

app.post('/api/collections', async (req, res) => {
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

app.put('/api/collections/:id', async (req, res) => {
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

app.delete('/api/collections/:id', async (req, res) => {
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

app.post('/api/categories', async (req, res) => {
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

app.put('/api/categories/:oldName', async (req, res) => {
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

app.delete('/api/categories/:name', async (req, res) => {
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

app.post('/api/photos', async (req, res) => {
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

app.delete('/api/photos/:id', async (req, res) => {
  try {
    const photoId = parseInt(req.params.id);
    const data = await fs.readFile(DATA_FILE, 'utf8');
    let photos = JSON.parse(data);
    
    photos = photos.filter(p => p.id !== photoId);
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
  
  const fullPath = path.join(__dirname, 'public', cleanImagePath);
  const command = `/usr/bin/exiftool -j -DateTimeOriginal -ISOSpeedRatings -ISO -FNumber -ExposureTime -FocalLength -Make -Model -LensModel -ExposureProgram -MeteringMode -ExposureCompensation -WhiteBalance -FocusMode -Copyright -GPSLatitude -GPSLongitude -GPSLatitudeRef -GPSLongitudeRef "${fullPath}"`;
  
  exec(command, (error, stdout, stderr) => {
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
// INICIA O SERVIDOR
// ========================================
initDataFiles().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor a correr em http://localhost:${PORT}`);
    console.log(`📸 API disponível em http://localhost:${PORT}/api/photos`);
    console.log(`📁 Coleções: http://localhost:${PORT}/api/collections`);
    console.log(`🔍 Scan de pastas: http://localhost:${PORT}/api/collections/scan`);
    console.log(`🏷️  Categorias: http://localhost:${PORT}/api/categories`);
  });
});