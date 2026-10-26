// ========================================
// frontend/src/components/AddEditModal.jsx
// ========================================
import { useState, useEffect } from 'react';
import { apiFetch } from '../api';

const normalizePeopleNotes = (value) => String(value || '')
  .split(',')
  .map(name => name.replace(/^[#\s]+/, '').replace(/\s+/g, ' ').trim())
  .filter(Boolean)
  .map(name => `#${name}`)
  .join(', ');

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
    description: '',
    peopleNotes: '',
    isFavorite: false
  });

  useEffect(() => {
    if (!isOpen) return;
    
    if (isEditing && initialData) {
      setFormData({
        title: initialData.title || '',
        imageUrl: initialData.imageUrl || '',
        categories: Array.isArray(initialData.categories) ? initialData.categories : (initialData.category ? [initialData.category] : []),
        collection: initialData.collection || initialData.orphanedFromCollection || '',
        location: initialData.location || '',
        date: initialData.date || '',
        time: initialData.time || '',
        aperture: initialData.aperture || '',
        iso: initialData.iso || '',
        shutterSpeed: initialData.shutterSpeed || '',
        focalLength: initialData.focalLength || '',
        camera: initialData.camera || '',
        lens: initialData.lens || '',
        description: initialData.description === 'Adicionada automaticamente - editar para completar'
          ? ''
          : initialData.description || '',
        peopleNotes: initialData.peopleNotes || '',
        isFavorite: !!initialData.isFavorite
      });
    } else {
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
        description: '',
        peopleNotes: '',
        isFavorite: false
      });
    }
  }, [isOpen, isEditing, initialData]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    
    if (!formData.title.trim()) {
      alert('O título é obrigatório');
      return;
    }
    if (!formData.collection) {
      alert('A coleção é obrigatória');
      return;
    }
    
    // Construir path completo apenas no modo Add
    let finalImageUrl = formData.imageUrl;
    if (!isEditing) {
      if (!formData.imageUrl.trim()) {
        alert('O nome do ficheiro é obrigatório');
        return;
      }
      finalImageUrl = `photos/${formData.collection}/${formData.imageUrl.trim()}`;
    }
    
    onSave({
      ...formData,
      peopleNotes: normalizePeopleNotes(formData.peopleNotes),
      imageUrl: finalImageUrl,
      timestamp: Date.now()
    });
  };

  if (!isOpen) return null;

  // Suporta ambos os formatos de categorias (array antigo ou objeto novo)
  const catGroups = Array.isArray(categories) ? [] : (categories?.groups || []);
  const allCats = Array.isArray(categories) 
    ? categories.map(name => ({ name })) 
    : (categories?.categories || []);

  const photoPath = isEditing
    ? formData.imageUrl
    : formData.collection && formData.imageUrl.trim()
      ? `photos/${formData.collection}/${formData.imageUrl.trim()}`
      : '';

  // Verifica se há detalhes técnicos para mostrar
  const hasTechnicalDetails = formData.date || formData.time || formData.aperture || 
    formData.iso || formData.shutterSpeed || formData.focalLength || 
    formData.camera || formData.lens;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-2 sm:p-4 overscroll-contain">
      <div className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-vd-90 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-4 sm:p-6 border-b border-gray-700">
          <h2 className="text-xl sm:text-2xl font-bold text-white min-w-0 break-words">
            {isEditing ? '✏️ Editar Foto' : '➕ Adicionar Nova Foto'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white shrink-0">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5 flex-1 min-h-0 overflow-y-auto overscroll-contain">
          
          <div className="space-y-4">
                        
            <div>
              <label className="block text-gray-300 mb-2 text-sm">Título *</label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                autoFocus
              />
              {photoPath && (
                <p className="mt-1 break-all text-xs text-gray-400">
                  Ficheiro: <span className="font-mono text-gray-300">{photoPath}</span>
                </p>
              )}
            </div>

            <div>
              <label className="block text-gray-300 mb-2 text-sm">Descrição</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows="3"
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Notas sobre a foto..."
              />
            </div>

            <div>
              <label className="block text-gray-300 mb-2 text-sm" htmlFor="peopleNotes">Pessoas identificadas (privado)</label>
              <textarea
                id="peopleNotes"
                name="peopleNotes"
                value={formData.peopleNotes}
                onChange={handleChange}
                onBlur={() => setFormData(prev => ({ ...prev, peopleNotes: normalizePeopleNotes(prev.peopleNotes) }))}
                rows="2"
                maxLength={2000}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                placeholder="#Paulo Pinhal, #Joana Vasconcelos"
              />
              <p className="mt-1 text-xs text-gray-400">
                Use # antes de cada nome e separe vários nomes por vírgula. Esta informação só é visível na gestão e serve para pesquisar.
              </p>
            </div>
            
            
            {/* Nome do ficheiro - SÓ em modo Add */}
            {!isEditing && (
              <div>
                <label className="block text-gray-300 mb-2 text-sm">Nome do ficheiro *</label>
                <input
                  type="text"
                  name="imageUrl"
                  value={formData.imageUrl}
                  onChange={handleChange}
                  placeholder="ex: foto.jpg"
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  💡 A foto será procurada na pasta da coleção selecionada
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-300 mb-2 text-sm">Coleção *</label>
                <select
                  name="collection"
                  value={formData.collection}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Selecionar coleção...</option>
                  {collections.map(col => (
                    <option key={col.id} value={col.folderPath || col.id}>
                      {col.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-gray-300 mb-2 text-sm">Local</label>
                <input
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={handleChange}
                  placeholder="ex: Porto, Portugal"
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Categorias */}
            <div>
              <label className="block text-gray-300 mb-2 text-sm">Categorias</label>
              {/*<div className="bg-gray-700 border border-gray-600 rounded-lg p-3 columns-1 sm:columns-2 lg:columns-3 gap-3">*/}
                <div className="bg-gray-700 border border-gray-600 rounded-lg p-3 columns-1 sm:columns-2 lg:columns-4 gap-3">
                {catGroups.length === 0 ? (
                  // Formato antigo (array de strings)
                  allCats.map(cat => {
                    const catName = typeof cat === 'string' ? cat : cat.name;
                    return (
                      <label key={catName} className="flex items-center space-x-2 py-1.5 cursor-pointer hover:bg-gray-600 px-2 rounded break-inside-avoid">
                        <input
                          type="checkbox"
                          checked={Array.isArray(formData.categories) ? formData.categories.includes(catName) : false}
                          onChange={(e) => {
                            const current = Array.isArray(formData.categories) ? formData.categories : [];
                            if (e.target.checked) {
                              setFormData({ ...formData, categories: [...current, catName] });
                            } else {
                              setFormData({ ...formData, categories: current.filter(c => c !== catName) });
                            }
                          }}
                          className="w-4 h-4 text-blue-600 bg-gray-600 border-gray-500 rounded focus:ring-blue-500"
                        />
                        <span className="text-white text-sm">{catName}</span>
                      </label>
                    );
                  })
                ) : (
                  // Formato novo (com grupos) - distribui em 3 colunas sem partir grupos
                  catGroups.map(group => {
                    const catsInGroup = allCats.filter(c => c.groupId === group.id);
                    if (catsInGroup.length === 0) return null;
                    return (
                      <div key={group.id} className="mb-2 break-inside-avoid">
                        <div className="text-gray-400 text-xs font-semibold mb-1 px-2">
                          {group.icon} {group.name}
                        </div>
                        {catsInGroup.map(cat => (
                          <label key={cat.name} className="flex items-center space-x-2 py-1 cursor-pointer hover:bg-gray-600 px-2 rounded">
                            <input
                              type="checkbox"
                              checked={Array.isArray(formData.categories) ? formData.categories.includes(cat.name) : false}
                              onChange={(e) => {
                                const current = Array.isArray(formData.categories) ? formData.categories : [];
                                if (e.target.checked) {
                                  setFormData({ ...formData, categories: [...current, cat.name] });
                                } else {
                                  setFormData({ ...formData, categories: current.filter(c => c !== cat.name) });
                                }
                              }}
                              className="w-4 h-4 text-blue-600 bg-gray-600 border-gray-500 rounded focus:ring-blue-500"
                            />
                            <span className="text-white text-sm">{cat.name}</span>
                          </label>
                        ))}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            

            {/* Checkbox Favorita */}
            <label className="flex items-center space-x-3 cursor-pointer bg-gray-900 p-3 rounded-lg border border-gray-700 hover:border-yellow-600 transition-colors">
              <input
                type="checkbox"
                name="isFavorite"
                checked={formData.isFavorite}
                onChange={handleChange}
                className="w-5 h-5 text-yellow-600 bg-gray-700 border-gray-600 rounded focus:ring-yellow-500"
              />
              <span className="text-white flex items-center gap-2">
                <span className="text-yellow-400 text-lg">⭐</span>
                <span className="font-medium">Marcar como favorita</span>
              </span>
            </label>
          </div>
        </form>
        
        {/* Footer */}
        <div className="flex gap-3 px-4 py-4 sm:p-6 border-t border-gray-700">
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center justify-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span className="hidden sm:inline">Cancelar</span>
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center justify-center space-x-2"
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