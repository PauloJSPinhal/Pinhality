// ========================================
// frontend/src/App.jsx - COM FULLSCREEN E MODAL SEPARADOS
// ========================================
import { useState, useEffect, useMemo } from 'react'
import PhotoGrid from './components/PhotoGrid'
import PhotoModal from './components/PhotoModal'
import PhotoFullscreen from './components/PhotoFullscreen'
import AddEditModal from './components/AddEditModal'
import AuthModal from './components/AuthModal'
import ManageCollectionsModal from './components/ManageCollectionsModal'
import ManageCategoriesModal from './components/ManageCategoriesModal'
import ManageOrphansModal from './components/ManageOrphansModal'
import BulkCategorizeModal from './components/BulkCategorizeModal'
import RcloneSettingsModal from './components/RcloneSettingsModal'
import DatabaseModal from './components/DatabaseModal'
import { apiFetch, UNAUTHORIZED_EVENT } from './api'

export default function App() {
  const [photos, setPhotos] = useState([])
  const [collections, setCollections] = useState([])
  const [categories, setCategories] = useState([])
  const [activeCollectionId, setActiveCollectionId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [showFullscreen, setShowFullscreen] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingPhoto, setEditingPhoto] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState('todas')
  const [filterCollection, setFilterCollection] = useState('all')
  const [showManageCollections, setShowManageCollections] = useState(false)
  const [showManageCategories, setShowManageCategories] = useState(false)
  const [showManageOrphans, setShowManageOrphans] = useState(false)
  const [showManageMenu, setShowManageMenu] = useState(false)
  const [filterDate, setFilterDate] = useState('all')
  const [filterMonth, setFilterMonth] = useState('all')
  const [filterLocation, setFilterLocation] = useState('all')
  const [sortBy, setSortBy] = useState('date')
  const [sortOrder, setSortOrder] = useState('desc')
  const [showBulkCategorize, setShowBulkCategorize] = useState(false)
  const [showRcloneSettings, setShowRcloneSettings] = useState(false)
  const [showDatabaseModal, setShowDatabaseModal] = useState(false)
  const [rcloneReason, setRcloneReason] = useState('')
  const [syncJob, setSyncJob] = useState(null)

  useEffect(() => {
    loadInitialData()
    fetch('/api/session')
      .then(res => res.json())
      .then(data => setAuthenticated(!!data.authenticated))
      .catch(() => {})

    const onUnauthorized = () => {
      setAuthenticated(false)
      setShowAuthModal(true)
    }
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [])

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' })
    } catch (error) {
      console.error('Erro ao terminar sessão:', error)
    }
    setAuthenticated(false)
    setShowManageMenu(false)
  }

  const openRcloneSettings = (reason = '') => {
    setRcloneReason(reason)
    setShowRcloneSettings(true)
    setShowManageMenu(false)
  }

  const loadInitialData = async () => {
    await Promise.all([
      loadPhotos(),
      loadCollections(),
      loadCategories(),
      loadSettings()
    ])
    setLoading(false)
  }

  const loadPhotos = async () => {
    try {
      const res = await fetch('/api/photos')
      const data = await res.json()
      setPhotos(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Erro ao carregar fotos:', error)
      setPhotos([])
    }
  }

  const loadCollections = async () => {
    try {
      const res = await fetch('/api/collections')
      const data = await res.json()
      setCollections(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Erro ao carregar coleções:', error)
      setCollections([])
    }
  }

  const loadCategories = async () => {
    try {
      const res = await fetch('/api/categories')
      const data = await res.json()
      setCategories(data && data.categories ? data : { groups: [], categories: [] })
    } catch (error) {
      console.error('Erro ao carregar categorias:', error)
      setCategories({ groups: [], categories: [] })
    }
  }

  const loadSettings = async () => {
    try {
      const res = await fetch('/api/settings')
      const data = await res.json()
      setActiveCollectionId(data.activeCollection)
      setFilterCollection(data.activeCollection || 'all')
    } catch (error) {
      console.error('Erro ao carregar settings:', error)
    }
  }

  const handleAddPhoto = async (photoData) => {
    try {
      const res = await apiFetch('/api/photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...photoData, timestamp: Date.now() })
      })
      if (!res.ok) {
        const error = await res.json()
        alert(error.error || 'Erro ao adicionar foto')
        return
      }
      const newPhoto = await res.json()
      setPhotos(prev => [...prev, newPhoto])
      setShowAddModal(false)
      loadCollections()
    } catch (error) {
      console.error('Erro ao adicionar foto:', error)
      alert('Erro ao adicionar foto')
    }
  }

  const handleEditPhoto = async (photoData) => {
    try {
      const res = await apiFetch('/api/photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...photoData, id: editingPhoto.id, timestamp: Date.now() })
      })
      if (!res.ok) return
      const updatedPhoto = await res.json()
      setPhotos(prev => prev.map(p => String(p.id) === String(updatedPhoto.id) ? updatedPhoto : p))
      setShowEditModal(false)
      setSelectedPhoto(null)
      loadCollections()
    } catch (error) {
      console.error('Erro ao editar foto:', error)
      alert('Erro ao editar foto')
    }
  }

  const handleDeletePhoto = async (id) => {
    if (!window.confirm('Desvincular esta fotografia da coleção? O ficheiro continuará no Google Drive.')) return
    try {
      const res = await apiFetch(`/api/photos/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Erro ao desvincular fotografia')
        return
      }
      const orphanedPhoto = await res.json()
      setPhotos(prev => prev.map(p =>
        String(p.id) === String(orphanedPhoto.id) ? orphanedPhoto : p
      ))
      setSelectedPhoto(null)
      setShowFullscreen(false)
      loadCollections()
    } catch (error) {
      console.error('Erro ao eliminar foto:', error)
      alert('Erro ao eliminar foto')
    }
  }

  const handleToggleFavorite = async (photoId) => {
    try {
      const photo = photos.find(p => String(p.id) === String(photoId))
      if (!photo) return
      const updatedPhoto = { ...photo, isFavorite: !photo.isFavorite }
      const res = await apiFetch('/api/photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedPhoto)
      })
      if (!res.ok) return
      const savedPhoto = await res.json()
      setPhotos(prev => prev.map(p => String(p.id) === String(savedPhoto.id) ? savedPhoto : p))
      if (selectedPhoto && String(selectedPhoto.id) === String(photoId)) {
        setSelectedPhoto(savedPhoto)
      }
    } catch (error) {
      console.error('Erro ao atualizar favorito:', error)
      alert('Erro ao atualizar favorito')
    }
  }

  const handlePhotoClick = (photo) => {
    setSelectedPhoto(photo)
    setShowFullscreen(false)
  }

  const handleOpenFullscreen = (photo) => {
    setSelectedPhoto(photo)
    setShowFullscreen(true)
  }

  const handleBackToModal = () => {
    setShowFullscreen(false)
  }

  const handleNavigatePhoto = (photo) => {
    setSelectedPhoto(photo)
  }

  const openEditModal = (photo) => {
    setEditingPhoto(photo)
    setShowEditModal(true)
    setSelectedPhoto(null)
    setShowFullscreen(false)
  }

  const handleChangeCollection = async (collectionId) => {
    setFilterCollection(collectionId)
    if (authenticated) {
      try {
        await apiFetch('/api/settings/active-collection', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ collectionId: collectionId === 'all' ? null : collectionId })
        })
        setActiveCollectionId(collectionId === 'all' ? null : collectionId)
      } catch (error) {
        console.error('Erro ao mudar coleção ativa:', error)
      }
    }
  }

  const handleCollectionsUpdate = () => {
    loadCollections()
    loadSettings()
    loadPhotos()
  }

  const handleCategoriesUpdate = () => {
    loadCategories()
  }

  const handleSetActive = (collectionId) => {
    setActiveCollectionId(collectionId)
    setFilterCollection(collectionId)
  }

  const handleBulkUpdatePhoto = async (photoData) => {
    try {
      const res = await apiFetch('/api/photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(photoData)
      })
      if (!res.ok) return
      const updatedPhoto = await res.json()
      setPhotos(prev => prev.map(p => String(p.id) === String(updatedPhoto.id) ? updatedPhoto : p))
    } catch (error) {
      console.error('Erro ao atualizar foto:', error)
      alert('Erro ao atualizar foto')
    }
  }

  const handleSync = async () => {
    setShowManageMenu(false)
    if (window.confirm('🔄 Sincronizar pastas e fotos?\n\n• Cria coleções para pastas novas\n• Remove coleções de pastas eliminadas\n• Adiciona fotos novas automaticamente\n• Remove fotos de ficheiros eliminados')) {
      try {
        const res = await apiFetch('/api/sync', { method: 'POST' })
        if (!res.ok) return
        const data = await res.json()
        let message = `✅ Sincronização concluída!\n\n`
        message += `📁 COLEÇÕES:\n   Total: ${data.collections.total}\n`
        if (data.collections.new > 0) message += `   ✨ Novas: ${data.collections.new}\n`
        if (data.collections.removed > 0) message += `   🗑️ Removidas: ${data.collections.removed}\n`
        if (data.collections.migrated > 0) message += `   📦 Migradas: ${data.collections.migrated}\n`
        message += `\n📸 FOTOS:\n   Total: ${data.photos.total}\n`
        if (data.photos.new > 0) message += `   ✨ Novas: ${data.photos.new}\n`
        if (data.photos.removed > 0) message += `   🗑️ Removidas: ${data.photos.removed}\n`
        if (data.photos.moved > 0) message += `   📦 Movidas: ${data.photos.moved}\n`
        alert(message)
        loadInitialData()
      } catch (error) {
        alert('❌ Erro ao sincronizar')
        console.error(error)
      }
    }
  }

  const handleSyncDrive = async (syncAllCollections = false) => {
    setShowManageMenu(false)

    try {
      const st = await apiFetch('/api/admin/rclone')
      if (!st.ok) return
      const status = await st.json()
      if (!status.configured) {
        openRcloneSettings('Para sincronizar é preciso configurar primeiro a ligação ao Google Drive.')
        return
      }
    } catch (error) {
      console.error(error)
      alert('❌ Erro de ligação ao servidor.')
      return
    }

    const selectedCollection = syncAllCollections ? 'all' : filterCollection
    const isAll = selectedCollection === 'all' || !selectedCollection
    
    let syncQuestion = ''
    if (isAll) {
      syncQuestion = '☁️ Sincronizar TODAS as coleções com o Google Drive?'
    } else {
      // Verifica se é pasta-mãe para informar o utilizador
      const subCols = collections.filter(c => c.folderPath && c.folderPath.startsWith(selectedCollection + '/'))
      if (subCols.length > 0) {
        syncQuestion = `☁️ Sincronizar a pasta-mãe "${selectedCollection}" e as suas ${subCols.length} sub-coleções conhecidas (e novas) com o Google Drive?`
      } else {
        syncQuestion = `☁️ Sincronizar a coleção "${selectedCollection}" com o Google Drive?`
      }
    }
    
    const syncDetails = syncAllCollections
      ? '\n\nAs fotos e coleções apagadas no Drive também serão removidas da base de dados do site.'
      : '\n\nSão criadas miniaturas e versões web das fotos novas ou alteradas. Os originais ficam no Drive.'
    if (!window.confirm(syncQuestion + syncDetails)) return

    try {
      // NOVA LÓGICA: usa a rota /api/sync-drive/:collectionName para pastas-mãe
      const url = isAll
        ? `/api/sync-drive${syncAllCollections ? '?allow-empty=1' : ''}`
        : `/api/sync-drive/${encodeURIComponent(selectedCollection)}`
      const body = {}
      const res = await apiFetch(url, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (res.status === 401) return
      const data = await res.json()

      if (!res.ok) {
        if (data.code === 'RCLONE_NOT_CONFIGURED' || data.code === 'RCLONE_AUTH') {
          openRcloneSettings(data.code === 'RCLONE_AUTH'
            ? `O Google Drive recusou as credenciais. Atualize o token. (${data.error})`
            : data.error)
          return
        }
        if (data.code === 'SYNC_RUNNING') {
          setSyncJob(data.job)
          await pollSyncJob()
          return
        }
        alert('❌ Erro: ' + (data.error || 'Falha na sincronização'))
        return
      }

      setSyncJob(data.job)
      await pollSyncJob()
    } catch (error) {
      alert('❌ Erro de ligação ao servidor durante a sincronização.')
      console.error(error)
    }
  }

  const handleFinalizeOrphans = async () => {
    const response = await apiFetch('/api/sync-drive?allow-empty=1&wait=1', { method: 'POST' })
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error || 'Não foi possível atualizar a base de dados a partir do Google Drive.')
    }
    if (data.job?.error) throw new Error(data.job.error)
    if (!data.job?.db?.success) {
      throw new Error('A sincronização terminou sem confirmar a atualização da base de dados.')
    }
    await loadInitialData()
  }

  const pollSyncJob = async () => {
    for (;;) {
      await new Promise(r => setTimeout(r, 1500))
      let job
      try {
        const res = await apiFetch('/api/sync-drive/status')
        if (!res.ok) { setSyncJob(null); return }
        job = await res.json()
      } catch (error) {
        console.error(error)
        continue
      }
      setSyncJob(job)
      if (job.running) continue

      setSyncJob(null)
      if (job.error) {
        if (job.code === 'RCLONE_AUTH' || job.code === 'RCLONE_NOT_CONFIGURED') {
          openRcloneSettings(`O Google Drive recusou as credenciais. Atualize o token. (${job.error})`)
        } else {
          alert('❌ Erro na sincronização: ' + job.error)
        }
        return
      }
      const mb = (b) => (b / 1024 / 1024).toFixed(1)
      let message = `✅ Sincronização concluída!\n\n`
      message += `📸 Processadas: ${job.processed}\n`
      message += `⏭️ Sem alterações: ${job.skipped}\n`
      if (job.removed) message += `🗑️ Removidas do Drive: ${job.removed}\n`
      if (job.failed?.length) {
        message += `⚠️ Falhadas: ${job.failed.length}\n`
        message += job.failed.slice(0, 5).map(failure =>
          `   • ${failure.file}: ${failure.error}`
        ).join('\n')
        if (job.failed.length > 5) message += `\n   • e mais ${job.failed.length - 5} ficheiro(s)`
        message += '\n'
      }
      if (job.processed) message += `\n💾 ${mb(job.bytesOriginal)} MB de originais → ${mb(job.bytesDerived)} MB no servidor`
      if (job.db) message += `\n\n📁 Coleções: ${job.db.collections.total} | Fotos: ${job.db.photos.total} (novas: ${job.db.photos.new})`
      alert(message)
      await loadInitialData()
      return
    }
  }

  // ========================================
  // FILTRAGEM E AGRUPAMENTO
  // ========================================

  const filteredPhotos = photos.filter(photo => {
    if (photo.pendingDriveDelete) return false

    const categoriesString = Array.isArray(photo.categories) 
      ? photo.categories.join(' ').toLowerCase() 
      : (photo.category || '').toLowerCase()
    
    const matchesSearch = photo.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         categoriesString.includes(searchTerm.toLowerCase()) ||
                         (photo.location && photo.location.toLowerCase().includes(searchTerm.toLowerCase())) ||
                         (photo.description && photo.description.toLowerCase().includes(searchTerm.toLowerCase()))
    
    const matchesCategory = filterCategory === 'todas' || 
                           (Array.isArray(photo.categories) && photo.categories.includes(filterCategory)) ||
                           photo.category === filterCategory
    
    // Lógica de coleção: suporta pasta-mãe (mostra sub-coleções) + favoritas virtual
    let matchesCollection = false
    if (filterCollection === 'all') {
      matchesCollection = true
    } else if (filterCollection === 'favoritas') {
      // "favoritas" tem DUPla classificação:
      // 1. Fotos fisicamente na pasta "favoritas" (collection === 'favoritas')
      // 2. Fotos marcadas como favoritas noutras coleções (isFavorite === true)
      matchesCollection = photo.collection === 'favoritas' || !!photo.isFavorite
    } else if (photo.collection === filterCollection) {
      matchesCollection = true
    } else if (photo.collection && photo.collection.startsWith(filterCollection + '/')) {
      matchesCollection = true
    }
    
    let matchesDate = filterDate === 'all' || (photo.date && photo.date.startsWith(filterDate))
    if (matchesDate && filterMonth !== 'all') {
      matchesDate = photo.date && photo.date.substring(5, 7) === filterMonth
    }
    const matchesLocation = filterLocation === 'all' || photo.location === filterLocation
    return matchesSearch && matchesCategory && matchesCollection && matchesDate && matchesLocation
  })

  const categoryNames = (categories && categories.categories ? categories.categories : []).map(c => c.name)
  
  const photosPerCategory = categoryNames.reduce((acc, cat) => {
    acc[cat] = photos.filter(p => 
      Array.isArray(p.categories) ? p.categories.includes(cat) : p.category === cat
    ).length
    return acc
  }, {})

  const photosPerCollection = collections.reduce((acc, col) => {
    if (col.id === 'favoritas' || col.folderPath === 'favoritas') {
      // Favoritas: dupla classificação (físicas + virtuais marcadas)
      acc[col.id] = photos.filter(p => 
        p.collection === 'favoritas' || p.collection === col.folderPath || !!p.isFavorite
      ).length
    } else {
      acc[col.id] = photos.filter(p => p.collection === col.id || p.collection === col.folderPath).length
    }
    return acc
  }, {})

  const activeCollectionName = collections.find(c => c.id === activeCollectionId || c.folderPath === activeCollectionId)?.name || null

  // Agrupar coleções para o dropdown
  const topLevelCollections = collections.filter(c => !c.folderPath || !c.folderPath.includes('/'))
  const subCollectionsForDropdown = collections.filter(c => c.folderPath && c.folderPath.includes('/'))
  const collectionParentGroups = {}
  for (const col of subCollectionsForDropdown) {
    const parent = col.folderPath.split('/')[0]
    if (!collectionParentGroups[parent]) collectionParentGroups[parent] = []
    collectionParentGroups[parent].push(col)
  }

  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]

  const preFilteredPhotos = photos.filter(photo => {
    const categoriesString = Array.isArray(photo.categories) 
      ? photo.categories.join(' ').toLowerCase() 
      : (photo.category || '').toLowerCase()
    const matchesSearch = photo.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         categoriesString.includes(searchTerm.toLowerCase()) ||
                         (photo.location && photo.location.toLowerCase().includes(searchTerm.toLowerCase())) ||
                         (photo.description && photo.description.toLowerCase().includes(searchTerm.toLowerCase()))
    const matchesCategory = filterCategory === 'todas' || 
                           (Array.isArray(photo.categories) && photo.categories.includes(filterCategory)) ||
                           photo.category === filterCategory
    let matchesCollection = false
    if (filterCollection === 'all') {
      matchesCollection = true
    } else if (photo.collection === filterCollection) {
      matchesCollection = true
    } else if (photo.collection && photo.collection.startsWith(filterCollection + '/')) {
      matchesCollection = true
    }
    return matchesSearch && matchesCategory && matchesCollection
  })

  const availableDates = preFilteredPhotos.reduce((acc, photo) => {
    if (photo.date && photo.date.length >= 4) {
      const year = photo.date.substring(0, 4)
      if (!acc[year]) acc[year] = new Set()
      if (photo.date.length >= 7) {
        acc[year].add(photo.date.substring(5, 7))
      }
    }
    return acc
  }, {})

  const sortedYears = Object.keys(availableDates).sort((a, b) => b.localeCompare(a))

  // Locais disponíveis nas fotos pré-filtradas (depende de coleção/categoria, não de data/local)
  const availableLocations = useMemo(() => {
    const locations = new Set()
    for (const photo of preFilteredPhotos) {
      if (photo.location && photo.location.trim()) {
        locations.add(photo.location.trim())
      }
    }
    return [...locations].sort((a, b) => a.localeCompare(b))
  }, [preFilteredPhotos])

  if (filterDate !== 'all' && !availableDates[filterDate]) {
    setFilterDate('all')
    setFilterMonth('all')
  }
  if (filterDate !== 'all' && filterMonth !== 'all' && !availableDates[filterDate]?.has(filterMonth)) {
    setFilterMonth('all')
  }
  // Reset do local se já não está disponível
  if (filterLocation !== 'all' && !availableLocations.includes(filterLocation)) {
    setFilterLocation('all')
  }

  // Aplicar ordenação às fotos filtradas
  const sortedPhotos = [...filteredPhotos].sort((a, b) => {
    let comparison = 0
    if (sortBy === 'date') {
      const dateA = a.date || ''
      const dateB = b.date || ''
      comparison = dateA.localeCompare(dateB)
      if (comparison === 0) {
        // Desempate por hora
        comparison = (a.time || '').localeCompare(b.time || '')
      }
    } else if (sortBy === 'name') {
      comparison = (a.title || '').toLowerCase().localeCompare((b.title || '').toLowerCase())
    } else if (sortBy === 'category') {
      const catA = Array.isArray(a.categories) ? a.categories[0] || '' : (a.category || '')
      const catB = Array.isArray(b.categories) ? b.categories[0] || '' : (b.category || '')
      comparison = catA.toLowerCase().localeCompare(catB.toLowerCase())
    }
    return sortOrder === 'asc' ? comparison : -comparison
  })

  const selectClass = "flex-1 basis-40 min-w-0 lg:flex-none lg:basis-auto lg:max-w-xs px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white text-base truncate focus:outline-none focus:ring-2 focus:ring-blue-500"

  if (loading) {
    return (
      <div className="min-h-screen min-h-vd-100 bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">A carregar...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen min-h-vd-100 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {showManageMenu && <div className="fixed inset-0 z-30" onClick={() => setShowManageMenu(false)} />}

      {/* Header */}
      <header className="bg-black bg-opacity-50 backdrop-blur-md border-b border-gray-700 sticky top-0 z-40">
        <div className="max-w-[2200px] mx-auto page-x py-3 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
              <svg className="w-7 h-7 sm:w-8 sm:h-8 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-white">Pinhality</h1>
                {!authenticated && activeCollectionName && (
                  <p className="text-xs text-gray-400 truncate">📁 {activeCollectionName}</p>
                )}
              </div>
            </div>
            
            <div className="relative flex items-center space-x-2 sm:space-x-3 shrink-0">
              {authenticated ? (
                <>
                  <div>
                    <button
                      onClick={() => setShowManageMenu(!showManageMenu)}
                      className="bg-gray-700 hover:bg-gray-600 text-white px-3 sm:px-4 py-2 rounded-lg transition-colors flex items-center justify-center space-x-2"
                      title="Gerir"
                      aria-expanded={showManageMenu}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="hidden sm:inline">Gerir</span>
                    </button>
                    
                    {showManageMenu && (
                      <div className="absolute right-0 top-full mt-2 w-56 max-w-[calc(100vw-2rem)] bg-gray-800 rounded-lg shadow-xl border border-gray-700 py-2 z-50">
                        <button
                          onClick={() => { setShowManageCollections(true); setShowManageMenu(false) }}
                          className="w-full px-4 py-2 text-left text-white hover:bg-gray-700 flex items-center space-x-2"
                        >
                          <span>📁</span><span>Gerir Coleções</span>
                        </button>
                        <button
                          onClick={() => { setShowManageCategories(true); setShowManageMenu(false) }}
                          className="w-full px-4 py-2 text-left text-white hover:bg-gray-700 flex items-center space-x-2"
                        >
                          <span>🏷️</span><span>Gerir Categorias</span>
                        </button>
                        <button
                          onClick={() => { setShowManageOrphans(true); setShowManageMenu(false) }}
                          className="w-full px-4 py-2 text-left text-white hover:bg-gray-700 flex items-center space-x-2"
                        >
                          <span>🧹</span><span>Gerir Fotos Órfãs</span>
                        </button>
                        <button
                          onClick={() => { setShowBulkCategorize(true); setShowManageMenu(false) }}
                          className="w-full px-4 py-2 text-left text-white hover:bg-gray-700 flex items-center space-x-2"
                        >
                          <span>⚡</span><span>Categorização Rápida</span>
                        </button>
                        <button
                          onClick={handleSyncDrive}
                          className="w-full px-4 py-2 text-left text-white hover:bg-gray-700 flex items-center space-x-2 border-t border-gray-600 mt-2"
                        >
                          <span>☁️</span><span>Sincronizar</span>
                        </button>
                        <button
                          onClick={() => openRcloneSettings()}
                          className="w-full px-4 py-2 text-left text-white hover:bg-gray-700 flex items-center space-x-2"
                        >
                          <span>🔑</span><span>Ligação ao Drive</span>
                        </button>
                        <button
                          onClick={() => { setShowDatabaseModal(true); setShowManageMenu(false) }}
                          className="w-full px-4 py-2 text-left text-white hover:bg-gray-700 flex items-center space-x-2"
                        >
                          <span>🗄️</span><span>Base de Dados</span>
                        </button>
                        
                        <button
                          onClick={handleSync}
                          className="w-full px-4 py-2 text-left text-white hover:bg-gray-700 flex items-center space-x-2"
                        >
                          <span>💾</span><span>Atualizar BD</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => setShowAddModal(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 sm:px-4 py-2 rounded-lg flex items-center justify-center space-x-2 transition-all transform hover:scale-105"
                    title="Adicionar Fotos"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="hidden sm:inline">Fotos</span>
                  </button>
                  
                  <button
                    onClick={handleLogout}
                    className="bg-gray-700 hover:bg-gray-600 text-white px-3 sm:px-4 py-2 rounded-lg transition-colors flex items-center justify-center space-x-2"
                    title="Terminar Sessão"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    <span className="hidden sm:inline">Logout</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="bg-green-600 hover:bg-green-700 text-white px-3 sm:px-4 py-2 rounded-lg transition-colors flex items-center justify-center space-x-2"
                  title="Iniciar Sessão"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  <span className="hidden sm:inline">Login</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Search and Filter */}
      <div className="max-w-[2200px] mx-auto page-x py-4 sm:py-6">
        <div className="flex flex-col xl:flex-row gap-3 sm:gap-4">
          <div className="xl:flex-1 relative min-w-0">
            <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="search"
              enterKeyHint="search"
              placeholder="Pesquisar fotos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-wrap gap-3 sm:gap-4">
            {/* Seletor de Coleções (agrupadas por pasta-mãe) */}
            <select
              value={filterCollection}
              onChange={(e) => handleChangeCollection(e.target.value)}
              className={selectClass}
            >
              <option value="all" className="text-sm">🌍 Todas as Coleções ({photos.length})</option>
              {topLevelCollections.map(col => (
                <option key={col.id} value={col.folderPath || col.id} className="text-sm">
                  {authenticated && (col.id === activeCollectionId || col.folderPath === activeCollectionId) ? '⭐ ' : ''}📁 {col.name} ({photosPerCollection[col.id] || 0})
                </option>
              ))}
              {Object.entries(collectionParentGroups).map(([parent, cols]) => {
                const parentDisplayName = parent.charAt(0).toUpperCase() + parent.slice(1)
                const parentPhotoCount = cols.reduce((sum, col) => sum + (photosPerCollection[col.id] || 0), 0)
                  return (
                    <optgroup key={parent} label={`📂 ${parentDisplayName}`} className="text-sm">
                      {cols.length > 1 && (
                        <option value={parent} className="text-sm font-semibold">
                          {authenticated && activeCollectionId === parent ? '⭐ ' : ''}🌐 Todas as sub-coleções ({parentPhotoCount})
                        </option>
                      )}
                      {cols.map(col => (
                      <option key={col.id} value={col.folderPath || col.id} className="text-sm">
                        {authenticated && (col.id === activeCollectionId || col.folderPath === activeCollectionId) ? '⭐ ' : ''}📁 {col.name} ({photosPerCollection[col.id] || 0})
                      </option>
                    ))}
                  </optgroup>
                )
              })}
            </select>

            {/* Seletor de Categorias (agrupadas) */}
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className={selectClass}
            >
              <option value="todas" className="text-sm">🏷️ Todas as Categorias ({photos.length})</option>
              {(categories.groups || []).map(group => {
                const catsInGroup = (categories.categories || []).filter(c => c.groupId === group.id)
                if (catsInGroup.length === 0) return null
                return (
                  <optgroup key={group.id} label={`${group.icon} ${group.name}`} className="text-sm">
                    {catsInGroup.map(cat => (
                      <option key={cat.name} value={cat.name} className="text-sm">
                        {cat.name} ({photosPerCategory[cat.name] || 0})
                      </option>
                    ))}
                  </optgroup>
                )
              })}
            </select>

            {/* Seletor de ANO */}
            <select
              value={filterDate}
              onChange={(e) => { setFilterDate(e.target.value); setFilterMonth('all') }}
              className={selectClass}
            >
              <option value="all" className="text-sm">📅 Todas as Datas</option>
              {sortedYears.map(year => (
                <option key={year} value={year} className="text-sm">📅 {year}</option>
              ))}
            </select>

            {/* Seletor de MÊS */}
            {filterDate !== 'all' && (
              <select
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className={selectClass}
              >
                <option value="all" className="text-sm">🗓️ Todos os Meses</option>
                {[...availableDates[filterDate]].sort((a, b) => a.localeCompare(b)).map(month => (
                  <option key={month} value={month} className="text-sm">
                    🗓️ {monthNames[parseInt(month) - 1]}
                  </option>
                ))}
              </select>
            )}

            {/* Seletor de ORDENAÇÃO */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className={selectClass}
            >
              <option value="date" className="text-sm">📅 Ordenar por Data</option>
              <option value="name" className="text-sm">🔤 Ordenar por Nome</option>
              <option value="category" className="text-sm">🏷️ Ordenar por Categoria</option>
            </select>

            {/* Botão de DIREÇÃO (asc/desc) */}
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className={`${selectClass} text-center`}
              title={sortOrder === 'asc' ? 'Ascendente (clicar para descendente)' : 'Descendente (clicar para ascendente)'}
            >
              {sortOrder === 'asc' ? '↑ Ascendente' : '↓ Descendente'}
            </button>
          </div>
        </div>
      </div>

      {/* Photo Grid */}
      <div className="max-w-[2200px] mx-auto page-x pb-12">
        <PhotoGrid photos={sortedPhotos} onPhotoClick={handlePhotoClick} />
      </div>

      {/* Footer */}
      <footer className="mt-12 safe-pb page-x text-center text-gray-400 text-sm">
        <div className="max-w-[2200px] mx-auto flex flex-col sm:flex-row flex-wrap items-center justify-center gap-1 sm:gap-x-4">
          <div>© {new Date().getFullYear()} Paulo Pinhal.</div>
          <div>Todos os direitos reservados.</div>
          <div>
            <a href="mailto:paulojspinhal@gmail.com" className="tap hover:text-white transition-colors underline-offset-2 hover:underline break-all" title="Enviar email">
              sys.pjsp@gmail.com
            </a>
          </div>
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="text-gray-500 hover:text-white transition-colors p-1 sm:ml-2 flex items-center justify-center"
            title="Voltar ao topo"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
        </div>
      </footer>

      {/* Progresso da sincronização */}
      {syncJob && syncJob.running && (
        <div className="fixed edge-bottom edge-right left-4 sm:left-auto z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-4 sm:w-72 text-sm text-white">
          <p className="font-semibold mb-1 truncate">☁️ A sincronizar ({syncJob.scope})</p>
          <p className="text-gray-400 mb-2">{syncJob.phase}{syncJob.total ? `: ${syncJob.done}/${syncJob.total}` : ''}</p>
          <div className="w-full h-2 bg-gray-700 rounded">
            <div
              className="h-2 bg-blue-500 rounded transition-all"
              style={{ width: `${syncJob.total ? Math.round((syncJob.done / syncJob.total) * 100) : 5}%` }}
            />
          </div>
          {syncJob.skipped > 0 && <p className="text-gray-500 mt-2">{syncJob.skipped} sem alterações</p>}
        </div>
      )}

      {/* Modals */}
      {selectedPhoto && !showFullscreen && (
        <PhotoModal 
          photo={selectedPhoto}
          photos={filteredPhotos}
          onNavigate={handleNavigatePhoto}
          onClose={() => setSelectedPhoto(null)}
          onEdit={() => openEditModal(selectedPhoto)}
          onDelete={() => handleDeletePhoto(selectedPhoto.id)}
          onOpenFullscreen={handleOpenFullscreen}
          authenticated={authenticated}
        />
      )}

      {showFullscreen && selectedPhoto && (
        <PhotoFullscreen
          photo={selectedPhoto}
          photos={filteredPhotos}
          onClose={() => { setShowFullscreen(false); setSelectedPhoto(null) }}
          onToggleFavorite={handleToggleFavorite}
          onNavigate={handleNavigatePhoto}
          onBackToModal={handleBackToModal}
        />
      )}

      <AddEditModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={handleAddPhoto}
        collections={collections}
        categories={categories}
      />

      <AddEditModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSave={handleEditPhoto}
        initialData={editingPhoto}
        isEditing={true}
        collections={collections}
        categories={categories}
      />

      {showAuthModal && (
        <AuthModal 
          onLogin={() => setAuthenticated(true)}
          onClose={() => setShowAuthModal(false)}
        />
      )}

      {showManageCollections && (
        <ManageCollectionsModal
          isOpen={showManageCollections}
          onClose={() => setShowManageCollections(false)}
          collections={collections}
          activeCollectionId={activeCollectionId}
          onCollectionsUpdate={handleCollectionsUpdate}
          onSetActive={handleSetActive}
        />
      )}

      <RcloneSettingsModal
        isOpen={showRcloneSettings}
        onClose={() => setShowRcloneSettings(false)}
        reason={rcloneReason}
      />

      {showDatabaseModal && (
        <DatabaseModal
          isOpen={showDatabaseModal}
          onClose={() => setShowDatabaseModal(false)}
          onDataChange={loadInitialData}
        />
      )}

      {showManageCategories && (
        <ManageCategoriesModal
          isOpen={showManageCategories}
          onClose={() => setShowManageCategories(false)}
          categories={categories}
          photos={photos}
          onCategoriesUpdate={handleCategoriesUpdate}
        />
      )}

      {showManageOrphans && (
        <ManageOrphansModal
          isOpen={showManageOrphans}
          onClose={() => setShowManageOrphans(false)}
          photos={photos}
          collections={collections}
          onFinalize={handleFinalizeOrphans}
          onPhotosChanged={async () => {
            await Promise.all([loadPhotos(), loadCollections()])
          }}
        />
      )}

      {showBulkCategorize && (
        <BulkCategorizeModal
          isOpen={showBulkCategorize}
          onClose={() => setShowBulkCategorize(false)}
          photos={filteredPhotos}
          categoriesData={categories}
          onUpdatePhoto={handleBulkUpdatePhoto}
          onRefresh={loadPhotos}
        />
      )}
    </div>
  )
}