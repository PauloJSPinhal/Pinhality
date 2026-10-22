// ========================================
// frontend/src/components/BulkCategorizeModal.jsx
// ========================================
import { useState } from 'react'

export default function BulkCategorizeModal({ isOpen, onClose, photos, categories, onUpdatePhoto }) {
  const [showOnlyUncategorized, setShowOnlyUncategorized] = useState(false)
  const [saving, setSaving] = useState(null)
  const [editingTitle, setEditingTitle] = useState(null)
  const [titleDraft, setTitleDraft] = useState('')
  
  // Estado para a ação em massa (localização)
  const [bulkLocation, setBulkLocation] = useState('')
  const [bulkEditing, setBulkEditing] = useState(false) // Controla se a barra está "ativa"
  const [bulkSaving, setBulkSaving] = useState(false)

  if (!isOpen) return null

  const filteredPhotos = showOnlyUncategorized
    ? photos.filter(p => !p.categories || p.categories.length === 0)
    : photos

  const toggleCategory = async (photo, category) => {
    setSaving(photo.id)
    const currentCats = Array.isArray(photo.categories) ? photo.categories : []
    const newCats = currentCats.includes(category)
      ? currentCats.filter(c => c !== category)
      : [...currentCats, category]

    const updatedPhoto = { ...photo, categories: newCats, timestamp: Date.now() }
    await onUpdatePhoto(updatedPhoto)
    setSaving(null)
  }

  const saveTitle = async (photo) => {
    if (titleDraft.trim() === photo.title || titleDraft.trim() === '') {
      setEditingTitle(null)
      return
    }
    setSaving(photo.id)
    const updatedPhoto = { ...photo, title: titleDraft.trim(), timestamp: Date.now() }
    await onUpdatePhoto(updatedPhoto)
    setSaving(null)
    setEditingTitle(null)
  }

  // Aplicar o local a TODAS as fotos filtradas
  const applyBulkLocation = async () => {
    if (!bulkLocation.trim() || filteredPhotos.length === 0) return
    setBulkSaving(true)
    for (const photo of filteredPhotos) {
      const updatedPhoto = { ...photo, location: bulkLocation.trim(), timestamp: Date.now() }
      await onUpdatePhoto(updatedPhoto)
    }
    setBulkSaving(false)
    setBulkLocation('')
    setBulkEditing(false)
  }

  const cancelBulkLocation = () => {
    setBulkLocation('')
    setBulkEditing(false)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-lg w-full max-w-7xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Categorização Rápida</h2>
          <div className="flex items-center gap-4">
            <label className="flex items-center text-white text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={showOnlyUncategorized}
                onChange={(e) => setShowOnlyUncategorized(e.target.checked)}
                className="mr-2"
              />
              Só não categorizadas
            </label>
            <button onClick={onClose} className="text-white hover:text-red-400 text-2xl leading-none">
              ✕
            </button>
          </div>
        </div>

        {/* Barra de Ação em Massa (Localização) */}
        <div className="p-4 border-b border-gray-700 bg-gray-800">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <div className="flex items-center gap-2 text-white text-sm font-medium shrink-0">
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>Local para todas ({filteredPhotos.length}):</span>
            </div>
            
            {!bulkEditing ? (
              <button
                onClick={() => setBulkEditing(true)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
              >
                📍 Definir local em massa
              </button>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2 flex-1">
                <input
                  type="text"
                  value={bulkLocation}
                  onChange={(e) => setBulkLocation(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && bulkLocation.trim()) applyBulkLocation()
                    if (e.key === 'Escape') cancelBulkLocation()
                  }}
                  placeholder="Ex: Porto, Portugal"
                  autoFocus
                  disabled={bulkSaving}
                  className="flex-1 px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none text-sm"
                />
                <div className="flex gap-2">
                  <button
                    onClick={applyBulkLocation}
                    disabled={!bulkLocation.trim() || bulkSaving}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
                  >
                    {bulkSaving ? '⏳ A guardar...' : '✓ Confirmar'}
                  </button>
                  <button
                    onClick={cancelBulkLocation}
                    disabled={bulkSaving}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    ✕ Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
          {bulkEditing && (
            <p className="text-gray-400 text-xs mt-2">
              ⚠️ Isto vai substituir o local de <strong className="text-white">{filteredPhotos.length} foto(s)</strong>. 
              Se alguma foto tiver um local diferente, podes corrigi-la depois na edição individual.
            </p>
          )}
        </div>

        {/* Tabela */}
        <div className="overflow-auto flex-1">
          <table className="w-full">
            <thead className="sticky top-0 bg-gray-800 z-10">
              <tr>
                <th className="p-3 text-left text-white min-w-[260px]">Foto</th>
                {categories.map(cat => (
                  <th key={cat} className="p-3 text-center text-white text-sm whitespace-nowrap">
                    {cat}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredPhotos.length === 0 && (
                <tr>
                  <td colSpan={categories.length + 1} className="p-8 text-center text-gray-400">
                    {showOnlyUncategorized ? "✓ Todas as fotos já têm categorias!" : "Sem fotos para mostrar."}
                  </td>
                </tr>
              )}
              {filteredPhotos.map(photo => (
                <tr key={photo.id} className="border-b border-gray-800 hover:bg-gray-800">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <img 
                        src={`/${photo.imageUrl}`} 
                        alt={photo.title}
                        className="w-16 h-16 object-cover rounded shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <input
                          type="text"
                          value={editingTitle === photo.id ? titleDraft : photo.title}
                          onChange={(e) => {
                            setEditingTitle(photo.id)
                            setTitleDraft(e.target.value)
                          }}
                          onBlur={() => saveTitle(photo)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.target.blur()
                            if (e.key === 'Escape') {
                              setEditingTitle(null)
                              setTitleDraft('')
                            }
                          }}
                          className="w-full bg-gray-700 text-white text-sm font-medium px-2 py-1.5 rounded border border-transparent focus:border-blue-500 focus:outline-none"
                          placeholder="Sem título"
                        />
                        <p className="text-gray-400 text-xs mt-1">
                          {photo.collection}{photo.location ? ` • 📍 ${photo.location}` : ''}
                        </p>
                      </div>
                    </div>
                  </td>
                  {categories.map(cat => {
                    const hasCat = Array.isArray(photo.categories) && photo.categories.includes(cat)
                    return (
                      <td key={cat} className="p-3 text-center">
                        <button
                          onClick={() => toggleCategory(photo, cat)}
                          disabled={saving === photo.id}
                          className={`w-8 h-8 rounded-full transition-all ${
                            hasCat 
                              ? 'bg-blue-600 text-white hover:bg-blue-700' 
                              : 'bg-gray-700 text-gray-500 hover:bg-gray-600 hover:text-white'
                          } ${saving === photo.id ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
                          title={hasCat ? `Remover "${cat}"` : `Adicionar "${cat}"`}
                        >
                          {hasCat && '✓'}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 text-gray-400 text-sm text-center">
          {filteredPhotos.length} foto(s) • Clica nas células para categorias • Edita o título diretamente (Enter para guardar)
        </div>
      </div>
    </div>
  )
}