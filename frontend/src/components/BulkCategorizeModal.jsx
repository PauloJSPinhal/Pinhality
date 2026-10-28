// ========================================
// frontend/src/components/BulkCategorizeModal.jsx
// ========================================
import { useState, useMemo, useEffect } from 'react'

// Configuração de cores por grupo (Tailwind)
const GROUP_COLORS = {
  rostos: {
    name: 'Rostos & Expressões',
    icon: '👤',
    active: 'bg-amber-600 hover:bg-amber-700 text-white border-amber-400',
    inactive: 'bg-amber-900/20 hover:bg-amber-900/40 text-amber-300 border-amber-800',
    guide: 'border-amber-700 bg-amber-900/10'
  },
  acao: {
    name: 'Ação & Sociedade',
    icon: '✊',
    active: 'bg-rose-600 hover:bg-rose-700 text-white border-rose-400',
    inactive: 'bg-rose-900/20 hover:bg-rose-900/40 text-rose-300 border-rose-800',
    guide: 'border-rose-700 bg-rose-900/10'
  },
  vida: {
    name: 'Vida & Rotina',
    icon: '🌍',
    active: 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-400',
    inactive: 'bg-emerald-900/20 hover:bg-emerald-900/40 text-emerald-300 border-emerald-800',
    guide: 'border-emerald-700 bg-emerald-900/10'
  },
  ambiente: {
    name: 'Ambiente & Detalhes',
    icon: '🏙️',
    active: 'bg-sky-600 hover:bg-sky-700 text-white border-sky-400',
    inactive: 'bg-sky-900/20 hover:bg-sky-900/40 text-sky-300 border-sky-800',
    guide: 'border-sky-700 bg-sky-900/10'
  }
}

export default function BulkCategorizeModal({ isOpen, onClose, photos, categoriesData, onUpdatePhoto, onRefresh }) {
  const groups = categoriesData?.groups || []
  const allCategories = categoriesData?.categories || []
  
  const [showOnlyUncategorized, setShowOnlyUncategorized] = useState(false)
  const [drafts, setDrafts] = useState({})
  const [bulkLocation, setBulkLocation] = useState('')
  const [saving, setSaving] = useState(false)
  const [showGuide, setShowGuide] = useState(false)

  // Pré-preencher o local quando o modal abre
  useEffect(() => {
    if (!isOpen) return
    if (photos.length === 0) { setBulkLocation(''); return }
    const locations = photos.map(p => p.location || '').filter(l => l)
    if (locations.length === 0) setBulkLocation('')
    else if (locations.every(l => l === locations[0])) setBulkLocation(locations[0])
    else setBulkLocation(locations[0])
  }, [isOpen, photos])

  if (!isOpen) return null

  const filteredPhotos = showOnlyUncategorized
    ? photos.filter(p => {
        const effective = drafts[p.id] ? { ...p, ...drafts[p.id] } : p
        return !effective.categories || effective.categories.length === 0
      })
    : photos

  const getEffective = (photo) => drafts[photo.id] ? { ...photo, ...drafts[photo.id] } : photo
  const pendingCount = Object.keys(drafts).length

  // Agrupar categorias por grupo, alfabética dentro de cada grupo
  const categoriesByGroup = useMemo(() => {
    const map = {}
    for (const group of groups) {
      map[group.id] = allCategories
        .filter(c => c.groupId === group.id)
        .sort((a, b) => a.name.localeCompare(b.name))
    }
    return map
  }, [groups, allCategories])

  const toggleCategory = (photo, categoryName) => {
    setDrafts(prev => {
      const currentDraft = prev[photo.id] || {}
      const effectiveCats = Array.isArray(currentDraft.categories)
        ? currentDraft.categories
        : (Array.isArray(photo.categories) ? photo.categories : [])
      const newCats = effectiveCats.includes(categoryName)
        ? effectiveCats.filter(c => c !== categoryName)
        : [...effectiveCats, categoryName]
      return { ...prev, [photo.id]: { ...currentDraft, categories: newCats } }
    })
  }

  const editTitle = (photo, title) => {
    setDrafts(prev => ({ ...prev, [photo.id]: { ...(prev[photo.id] || {}), title } }))
  }

  const applyBulkLocation = () => {
    if (!bulkLocation.trim() || filteredPhotos.length === 0) return
    const newDrafts = { ...drafts }
    for (const photo of filteredPhotos) {
      newDrafts[photo.id] = { ...(newDrafts[photo.id] || {}), location: bulkLocation.trim() }
    }
    setDrafts(newDrafts)
  }

  const handleConfirm = async () => {
    if (pendingCount === 0) { onClose(); return }
    setSaving(true)
    let saved = 0, failed = 0
    for (const [photoId, changes] of Object.entries(drafts)) {
      const photo = photos.find(p => String(p.id) === String(photoId))
      if (!photo) { failed++; continue }
      const updatedPhoto = { ...photo, ...changes, timestamp: Date.now() }
      await onUpdatePhoto(updatedPhoto)
      saved++
      await new Promise(r => setTimeout(r, 100))
    }
    if (onRefresh) await onRefresh()
    setDrafts({})
    setSaving(false)
    alert(failed > 0 ? `⚠️ ${saved} atualizada(s), ${failed} falharam.` : `✅ ${saved} foto(s) atualizada(s) com sucesso!`)
    onClose()
  }

  const handleCancel = () => {
    if (pendingCount > 0 && !window.confirm(`Há ${pendingCount} alteração(ões) por guardar. Sair sem guardar?`)) return
    setDrafts({})
    setShowGuide(false)
    onClose()
  }

  // Helpers para tooltips e cores
  const getTooltip = (cat) => {
    const group = groups.find(g => g.id === cat.groupId)
    return `${group?.icon || ''} ${group?.name || ''}\n${cat.name}: ${cat.description || 'Sem descrição'}`
  }
  const getColorClasses = (groupId, isActive) => {
    const c = GROUP_COLORS[groupId]
    return isActive ? c?.active : c?.inactive
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-lg w-full max-w-7xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-white">Categorização Rápida</h2>
            {pendingCount > 0 && (
              <span className="bg-yellow-500 text-black text-xs font-bold px-2 py-1 rounded-full">
                {pendingCount} pendente(s)
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="text-white hover:text-blue-400 text-sm flex items-center gap-1"
              title="Ver guia de categorias"
            >
              📖 <span className="hidden sm:inline">Guia</span>
            </button>
            <label className="flex items-center text-white text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={showOnlyUncategorized}
                onChange={(e) => setShowOnlyUncategorized(e.target.checked)}
                className="mr-2"
              />
              Só não categorizadas
            </label>
            <button onClick={handleCancel} className="text-white hover:text-red-400 text-2xl leading-none">✕</button>
          </div>
        </div>

        {/* Barra de Local em Massa */}
        <div className="p-4 border-b border-gray-700 bg-gray-800">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <div className="flex items-center gap-2 text-white text-sm font-medium shrink-0">
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>Local para todas ({filteredPhotos.length}):</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 flex-1">
              <input
                type="text"
                value={bulkLocation}
                onChange={(e) => setBulkLocation(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') applyBulkLocation() }}
                placeholder="Ex: Porto, Portugal"
                className="flex-1 px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none text-sm"
              />
              <button
                onClick={applyBulkLocation}
                disabled={!bulkLocation.trim() || filteredPhotos.length === 0}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
              >
                ↧ Aplicar a todas
              </button>
            </div>
          </div>
        </div>

        {/* Tabela com labels horizontais e primeira coluna fixa */}
        <div className="overflow-auto flex-1">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-gray-800 z-20">
              <tr>
                {/* Coluna Foto FIXA (sticky left) */}
                <th
                  className="p-3 text-left text-white min-w-[260px] border-b border-gray-700 sticky left-0 bg-gray-800 z-30"
                  style={{ boxShadow: '2px 0 4px rgba(0,0,0,0.3)' }}
                >
                  Foto
                </th>
                {/* Labels horizontais agrupadas por grupo - ordenar alfabeticamente */}
                {[...groups].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase(), 'pt-PT')).map(group => {
                  const catsInGroup = categoriesByGroup[group.id] || []
                  if (catsInGroup.length === 0) return null
                  return catsInGroup.map(cat => (
                    <th key={cat.name} className="p-2 text-center border-b border-gray-700 min-w-[110px]">
                      <div
                        title={getTooltip(cat)}
                        className={`inline-block whitespace-nowrap text-xs font-medium px-2 py-1 rounded border-l-2 ${GROUP_COLORS[group.id]?.guide || ''}`}
                      >
                        {group.icon} {cat.name}
                      </div>
                    </th>
                  ))
                })}
              </tr>
            </thead>
            <tbody>
              {filteredPhotos.length === 0 && (
                <tr>
                  <td colSpan={allCategories.length + 1} className="p-8 text-center text-gray-400">
                    {showOnlyUncategorized ? "✓ Todas as fotos já têm categorias!" : "Sem fotos para mostrar."}
                  </td>
                </tr>
              )}
              {filteredPhotos.map(photo => {
                const effective = getEffective(photo)
                const hasPending = !!drafts[photo.id]
                const thumbSrc = photo.thumbUrl ? `/${photo.thumbUrl}` : `/${photo.imageUrl}`
                return (
                  <tr
                    key={photo.id}
                    className={`border-b border-gray-800 hover:bg-gray-800 ${hasPending ? 'bg-yellow-900 bg-opacity-20' : ''}`}
                  >
                    {/* Coluna Foto FIXA (sticky left) */}
                    <td
                      className={`p-3 sticky left-0 z-10 ${hasPending ? 'bg-yellow-900 bg-opacity-95' : 'bg-gray-900'}`}
                      style={{ boxShadow: '2px 0 4px rgba(0,0,0,0.2)' }}
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={thumbSrc}
                          alt={effective.title}
                          className="w-16 h-16 object-cover rounded shrink-0"
                          onError={(e) => { e.target.src = `/${photo.imageUrl}` }}
                        />
                        <div className="min-w-0 flex-1">
                          <input
                            type="text"
                            value={effective.title}
                            onChange={(e) => editTitle(photo, e.target.value)}
                            className={`w-full bg-gray-700 text-white text-sm font-medium px-2 py-1.5 rounded border ${hasPending ? 'border-yellow-500' : 'border-transparent'} focus:border-blue-500 focus:outline-none`}
                            placeholder="Sem título"
                          />
                          <p className="text-gray-400 text-xs mt-1">
                            {photo.collection}{effective.location ? ` • 📍 ${effective.location}` : ''}
                          </p>
                        </div>
                      </div>
                    </td>
                    {/* Células de categorias (scroll horizontal) */}
                    {groups.map(group => {
                      const catsInGroup = categoriesByGroup[group.id] || []
                      if (catsInGroup.length === 0) return null
                      return catsInGroup.map(cat => {
                        const hasCat = Array.isArray(effective.categories) && effective.categories.includes(cat.name)
                        return (
                          <td key={cat.name} className="p-2 text-center">
                            <button
                              onClick={() => toggleCategory(photo, cat.name)}
                              title={getTooltip(cat)}
                              className={`w-8 h-8 rounded transition-all border ${getColorClasses(group.id, hasCat)} cursor-pointer`}
                            >
                              {hasCat && '✓'}
                            </button>
                          </td>
                        )
                      })
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Footer com Confirmar / Cancelar */}
        <div className="p-4 border-t border-gray-700 bg-gray-800 flex items-center justify-between gap-3">
          <div className="text-gray-400 text-sm">
            {filteredPhotos.length} foto(s) • {pendingCount > 0 ? `${pendingCount} alteração(ões) pendente(s)` : 'Sem alterações pendentes'}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              disabled={saving}
              className="px-6 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              ✕ Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={saving}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
            >
              {saving ? '⏳ A guardar...' : `✓ Confirmar${pendingCount > 0 ? ` (${pendingCount})` : ''}`}
            </button>
          </div>
        </div>
      </div>

      {/* Painel Guia de Categorias (overlay) */}
      {showGuide && (
        <div className="fixed inset-0 bg-black bg-opacity-75 z-[60] flex items-center justify-center p-4" onClick={() => setShowGuide(false)}>
          <div className="bg-gray-900 rounded-lg max-w-2xl w-full max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h3 className="text-lg font-bold text-white">📖 Guia de Categorias</h3>
              <button onClick={() => setShowGuide(false)} className="text-white hover:text-red-400 text-2xl leading-none">✕</button>
            </div>
            <div className="overflow-y-auto p-4 space-y-4">
              {groups.map(group => {
                const catsInGroup = categoriesByGroup[group.id] || []
                if (catsInGroup.length === 0) return null
                return (
                  <div key={group.id} className={`rounded-lg p-3 border ${GROUP_COLORS[group.id]?.guide}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">{group.icon}</span>
                      <span className="text-white font-semibold">{group.name}</span>
                    </div>
                    <p className="text-gray-400 text-xs mb-3 italic">{group.description}</p>
                    <div className="space-y-1.5">
                      {catsInGroup.map(cat => (
                        <div key={cat.name} className="text-sm">
                          <span className="text-white font-medium">{cat.name}:</span>{' '}
                          <span className="text-gray-400">{cat.description || 'Sem descrição'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}