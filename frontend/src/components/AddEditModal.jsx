// ========================================
// frontend/src/components/AddEditModal.jsx - VERSÃO COM AUTO-DETECÇÃO
// ========================================
import { useState, useEffect } from 'react';

export default function AddEditModal({ 
  isOpen, 
  onClose, 
  onSave, 
  initialData = {},
  isEditing = false,
  collections = [],
  categories = []
}) {
  const [formData, setFormData] = useState({
    title: '',
    imageUrl: '',
    categories: [],
    collection: '',
    location: '',
    date: '',
    time: '',
    aperture: '',
    iso: '',
    shutterSpeed: '',
    focalLength: '',
    camera: '',
    lens: '',
    exposureMode: '',
    meteringMode: '',
    exposureCompensation: '',
    whiteBalance: '',
    focusMode: '',
    copyright: '',
    gpsLatitude: '',
    gpsLongitude: '',
    description: ''
  });

  useEffect(() => {
    if (!isOpen) return; // Se não está aberto, ignora
    
    if (isEditing && initialData) {
      // Extrair apenas o nome do ficheiro do path completo
      let fileName = initialData.imageUrl?.replace('photos/', '') || '';
      if (fileName.includes('/')) {
        const parts = fileName.split('/');
        fileName = parts.slice(1).join('/'); // Remove a pasta da coleção
      }
      
      setFormData({
        title: initialData.title || '',
        imageUrl: fileName,
        categories: Array.isArray(initialData.categories) ? initialData.categories : (initialData.category ? [initialData.category] : []),
        collection: initialData.collection || '',
        location: initialData.location || '',
        date: initialData.date || '',
        time: initialData.time || '',
        aperture: initialData.aperture || '',
        iso: initialData.iso || '',
        shutterSpeed: initialData.shutterSpeed || '',
        focalLength: initialData.focalLength || '',
        camera: initialData.camera || '',
        lens: initialData.lens || '',
        exposureMode: initialData.exposureMode || '',
        meteringMode: initialData.meteringMode || '',
        exposureCompensation: initialData.exposureCompensation || '',
        whiteBalance: initialData.whiteBalance || '',
        focusMode: initialData.focusMode || '',
        copyright: initialData.copyright || '',
        gpsLatitude: initialData.gpsLatitude || '',
        gpsLongitude: initialData.gpsLongitude || '',
        description: initialData.description || ''
      });
    } else {
      // Modo ADICIONAR - só executa UMA VEZ
      setFormData({
        title: '',
        imageUrl: '',
        categories: [],
        collection: '',
        location: '',
        date: '',
        time: '',
        aperture: '',
        iso: '',
        shutterSpeed: '',
        focalLength: '',
        camera: '',
        lens: '',
        exposureMode: '',
        meteringMode: '',
        exposureCompensation: '',
        whiteBalance: '',
        focusMode: '',
        copyright: '',
        gpsLatitude: '',
        gpsLongitude: '',
        description: ''
      });
    }
  }, [isOpen]); 

  const handleChange = (e) => {
  const { name, value } = e.target;
  
  // Se mudou o imageUrl, tentar detectar coleção automaticamente
  if (name === 'imageUrl') {
    const pathParts = value.trim().split('/');
    if (pathParts.length > 1) {
      // Formato: "porto-2024/foto.jpg" -> coleção "porto-2024"
      const detectedCollectionId = pathParts[0];
      const fileName = pathParts.slice(1).join('/');
      
      // Verificar se a coleção existe
      const collectionExists = collections.find(c => c.id === detectedCollectionId);
      
      if (collectionExists) {
        console.log(`✅ Coleção detectada: ${detectedCollectionId}`);
        setFormData(prev => ({ 
          ...prev, 
          imageUrl: fileName, // Guarda só o nome do ficheiro
          collection: detectedCollectionId
        }));
      } else {
        // Se não existe, guarda o valor como está
        setFormData(prev => ({ ...prev, imageUrl: value }));
      }
    } else {
      setFormData(prev => ({ ...prev, imageUrl: value }));
    }
  } else {
    setFormData(prev => ({ ...prev, [name]: value }));
  }
};

  const handleExtractExif = async () => {
    if (!formData.imageUrl.trim()) {
      alert('Por favor, introduza o nome do ficheiro');
      return;
    }
    
    try {
      // Construir path completo para ler EXIF
      const fullPath = formData.collection 
        ? `photos/${formData.collection}/${formData.imageUrl.trim()}`
        : `photos/${formData.imageUrl.trim()}`;
      
      const res = await fetch(`/api/exif?imagePath=${encodeURIComponent(fullPath)}`);
      const exifData = await res.json();
      
      if (Object.keys(exifData).length === 0) {
        alert('A imagem foi carregada, mas não contém dados EXIF.');
      }
      
      setFormData(prev => ({
        ...prev,
        date: exifData.date || prev.date,
        time: exifData.time || prev.time,
        aperture: exifData.aperture || prev.aperture,
        iso: exifData.iso || prev.iso,
        shutterSpeed: exifData.shutterSpeed || prev.shutterSpeed,
        focalLength: exifData.focalLength || prev.focalLength,
        camera: exifData.camera || prev.camera,
        lens: exifData.lens || prev.lens,
        exposureMode: exifData.exposureMode || prev.exposureMode,
        meteringMode: exifData.meteringMode || prev.meteringMode,
        exposureCompensation: exifData.exposureCompensation || prev.exposureCompensation,
        whiteBalance: exifData.whiteBalance || prev.whiteBalance,
        focusMode: exifData.focusMode || prev.focusMode,
        copyright: exifData.copyright || prev.copyright,
        gpsLatitude: exifData.gpsLatitude || prev.gpsLatitude,
        gpsLongitude: exifData.gpsLongitude || prev.gpsLongitude
      }));
    } catch (error) {
      console.error('Erro ao ler EXIF:', error);
      alert('Erro ao ler EXIF');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (formData.title && formData.imageUrl && formData.collection) {
      // Construir path completo: photos/[coleção]/[ficheiro]
      const fullImagePath = `photos/${formData.collection}/${formData.imageUrl.trim()}`;
      
      onSave({
        ...formData,
        imageUrl: fullImagePath,
        timestamp: Date.now()
      });
    } else {
      alert('Por favor, preencha o título, ficheiro e coleção');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-gray-800 rounded-lg max-w-2xl w-full my-8">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-2xl font-bold text-white">
            {isEditing ? 'Editar Foto' : 'Adicionar Nova Foto'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-gray-300 mb-2">Título *</label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-gray-300 mb-2">
              Nome do ficheiro *
            </label>
            <input
              type="text"
              name="imageUrl"
              value={formData.imageUrl}
              onChange={handleChange}
              placeholder="foto.jpg"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              💡 A foto será procurada na pasta da coleção selecionada
            </p>
            
            {/* Feedback visual da coleção */}
            {formData.collection && (
              <div className="mt-2 flex items-center space-x-2 text-sm">
                <span className="text-green-400">✓</span>
                <span className="text-gray-300">
                  Caminho: <strong className="text-white font-mono">
                    photos/{formData.collection}/{formData.imageUrl || '...'}
                  </strong>
                </span>
              </div>
            )}
          </div>

          {formData.imageUrl && (
            <button
              type="button"
              onClick={handleExtractExif}
              className="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm transition-colors flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <span>Ler Dados EXIF</span>
            </button>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-300 mb-2">Coleção *</label>
              <select
                name="collection"
                value={formData.collection}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Selecionar coleção...</option>
                {collections.map(col => (
                  <option key={col.id} value={col.id}>{col.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">Escolha a coleção para esta foto</p>
            </div>

            <div>
              <label className="block text-gray-300 mb-2">Categorias (múltipla seleção)</label>
              <div className="bg-gray-700 border border-gray-600 rounded-lg p-3 max-h-48 overflow-y-auto">
                {categories.map(cat => (
                  <label key={cat} className="flex items-center space-x-2 py-2 cursor-pointer hover:bg-gray-600 px-2 rounded">
                    <input
                      type="checkbox"
                      checked={Array.isArray(formData.categories) ? formData.categories.includes(cat) : false}
                      onChange={(e) => {
                        const currentCategories = Array.isArray(formData.categories) ? formData.categories : [];
                        if (e.target.checked) {
                          setFormData({ ...formData, categories: [...currentCategories, cat] });
                        } else {
                          setFormData({ ...formData, categories: currentCategories.filter(c => c !== cat) });
                        }
                      }}
                      className="w-4 h-4 text-blue-600 bg-gray-600 border-gray-500 rounded focus:ring-blue-500"
                    />
                    <span className="text-white">{cat}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">Selecione uma ou mais categorias</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-gray-300 mb-2">Local</label>
              <input
                type="text"
                name="location"
                value={formData.location}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-300 mb-2">Data</label>
              <input
                type="date"
                name="date"
                value={formData.date}
                readOnly
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-gray-300 mb-2">Hora</label>
              <input
                type="text"
                name="time"
                value={formData.time}
                readOnly
                placeholder="hh:mm:ss"
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 cursor-not-allowed"
              />
            </div>
          </div>

          {/* DADOS TÉCNICOS BÁSICOS */}
          <div className="border-t border-gray-700 pt-4 mt-4">
            <h3 className="text-white font-semibold mb-3">Dados Técnicos Básicos</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-300 mb-2">Abertura (f/)</label>
                <input
                  type="text"
                  name="aperture"
                  value={formData.aperture}
                  readOnly
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-gray-300 mb-2">ISO</label>
                <input
                  type="text"
                  name="iso"
                  value={formData.iso}
                  readOnly
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-gray-300 mb-2">Velocidade</label>
                <input
                  type="text"
                  name="shutterSpeed"
                  value={formData.shutterSpeed}
                  readOnly
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-gray-300 mb-2">Distância Focal (mm)</label>
                <input
                  type="text"
                  name="focalLength"
                  value={formData.focalLength}
                  readOnly
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* CONFIGURAÇÕES AVANÇADAS */}
          <div className="border-t border-gray-700 pt-4 mt-4">
            <h3 className="text-white font-semibold mb-3">Configurações Avançadas</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-300 mb-2">Modo de Exposição</label>
                <input
                  type="text"
                  name="exposureMode"
                  value={formData.exposureMode}
                  readOnly
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-gray-300 mb-2">Modo de Medição</label>
                <input
                  type="text"
                  name="meteringMode"
                  value={formData.meteringMode}
                  readOnly
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-gray-300 mb-2">Compensação EV</label>
                <input
                  type="text"
                  name="exposureCompensation"
                  value={formData.exposureCompensation}
                  readOnly
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-gray-300 mb-2">Balanço de Brancos</label>
                <input
                  type="text"
                  name="whiteBalance"
                  value={formData.whiteBalance}
                  readOnly
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-gray-300 mb-2">Modo de Focagem</label>
                <input
                  type="text"
                  name="focusMode"
                  value={formData.focusMode}
                  readOnly
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-gray-300 mb-2">Copyright</label>
                <input
                  type="text"
                  name="copyright"
                  value={formData.copyright}
                  readOnly
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* GPS */}
          {(formData.gpsLatitude || formData.gpsLongitude) && (
            <div className="border-t border-gray-700 pt-4 mt-4">
              <h3 className="text-white font-semibold mb-3">Localização GPS</h3>
              <div className="grid grid-cols-1 gap-3">
                {formData.gpsLatitude && (
                  <div>
                    <label className="block text-gray-300 mb-2">Latitude</label>
                    <input
                      type="text"
                      name="gpsLatitude"
                      value={formData.gpsLatitude}
                      readOnly
                      className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 cursor-not-allowed font-mono text-sm"
                    />
                  </div>
                )}
                {formData.gpsLongitude && (
                  <div>
                    <label className="block text-gray-300 mb-2">Longitude</label>
                    <input
                      type="text"
                      name="gpsLongitude"
                      value={formData.gpsLongitude}
                      readOnly
                      className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 cursor-not-allowed font-mono text-sm"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* EQUIPAMENTO */}
          <div className="border-t border-gray-700 pt-4 mt-4">
            <h3 className="text-white font-semibold mb-3">Equipamento</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-300 mb-2">Câmara</label>
                <input
                  type="text"
                  name="camera"
                  value={formData.camera}
                  readOnly
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-gray-300 mb-2">Lente</label>
                <input
                  type="text"
                  name="lens"
                  value={formData.lens}
                  readOnly
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-gray-300 mb-2">Descrição</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows="3"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </form>
        
        <div className="flex gap-3 p-6 border-t border-gray-700">
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center justify-center space-x-2"
            title="Cancelar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span className="hidden sm:inline">Cancelar</span>
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center justify-center space-x-2"
            title={isEditing ? 'Guardar Alterações' : 'Adicionar Foto'}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="hidden sm:inline">{isEditing ? 'Guardar' : 'Adicionar'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}