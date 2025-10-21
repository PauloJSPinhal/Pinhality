// ========================================
// frontend/src/App.jsx - VERSÃO COMPLETA COM SCAN DE PASTAS
// ========================================
import { useState, useEffect } from 'react'
import PhotoGrid from './components/PhotoGrid'
import PhotoModal from './components/PhotoModal'
import AddEditModal from './components/AddEditModal'
import AuthModal from './components/AuthModal'
import ManageCollectionsModal from './components/ManageCollectionsModal'
import ManageCategoriesModal from './components/ManageCategoriesModal'

export default function App() {
  const [photos, setPhotos] = useState([])
  const [collections, setCollections] = useState([])
  const [categories, setCategories] = useState([])
  const [activeCollectionId, setActiveCollectionId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingPhoto, setEditingPhoto] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState('todas')
  const [filterCollection, setFilterCollection] = useState('all')
  const [showManageCollections, setShowManageCollections] = useState(false)
  const [showManageCategories, setShowManageCategories] = useState(false)
  const [showManageMenu, setShowManageMenu] = useState(false)

  useEffect(() => {
    loadInitialData()
  }, [])

  // Entrar em fullscreen automaticamente ao carregar a app
  useEffect(() => {
    const enterFullscreen = async () => {
      try {
        if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
          await document.documentElement.requestFullscreen()
        }
      } catch (err) {
        console.log('Fullscreen não disponível:', err)
      }
    }
    
    enterFullscreen()
  }, [])

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
      setCategories(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Erro ao carregar categorias:', error)
      setCategories([])
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
      const res = await fetch('/api/photos', {
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
      setPhotos([...photos, newPhoto])
      setShowAddModal(false)
      loadCollections()
    } catch (error) {
      console.error('Erro ao adicionar foto:', error)
      alert('Erro ao adicionar foto')
    }
  }

  const handleEditPhoto = async (photoData) => {
    try {
      const res = await fetch('/api/photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...photoData, id: editingPhoto.id, timestamp: Date.now() })
      })
      const updatedPhoto = await res.json()
      setPhotos(photos.map(p => p.id === updatedPhoto.id ? updatedPhoto : p))
      setShowEditModal(false)
      setSelectedPhoto(updatedPhoto)
      loadCollections()
    } catch (error) {
      console.error('Erro ao editar foto:', error)
      alert('Erro ao editar foto')
    }
  }

  const handleDeletePhoto = async (id) => {
    if (!window.confirm('Tem a certeza que deseja eliminar esta fotografia?')) return
    
    try {
      await fetch(`/api/photos/${id}`, { method: 'DELETE' })
      setPhotos(photos.filter(p => p.id !== id))
      setSelectedPhoto(null)
      loadCollections()
    } catch (error) {
      console.error('Erro ao eliminar foto:', error)
      alert('Erro ao eliminar foto')
    }
  }

  const openEditModal = (photo) => {
    setEditingPhoto(photo)
    setShowEditModal(true)
    setSelectedPhoto(null)
  }

  const handleChangeCollection = async (collectionId) => {
    setFilterCollection(collectionId)
    
    if (authenticated) {
      try {
        await fetch('/api/settings/active-collection', {
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

    const handleSync = async () => {
    setShowManageMenu(false)
    if (window.confirm('🔄 Sincronizar pastas e fotos?\n\n• Cria coleções para pastas novas\n• Remove coleções de pastas eliminadas\n• Adiciona fotos novas automaticamente\n• Remove fotos de ficheiros eliminados')) {
      try {
        const res = await fetch('/api/sync')
        const data = await res.json()
        
        let message = `✅ Sincronização concluída!\n\n`;
        
        // Coleções
        message += `📁 COLEÇÕES:\n`;
        message += `   Total: ${data.collections.total}\n`;
        if (data.collections.new > 0) {
          message += `   ✨ Novas: ${data.collections.new}\n`;
        }
        if (data.collections.removed > 0) {
          message += `   🗑️ Removidas: ${data.collections.removed}\n`;
        }
        
        // Fotos
        message += `\n📸 FOTOS:\n`;
        message += `   Total: ${data.photos.total}\n`;
        if (data.photos.new > 0) {
          message += `   ✨ Novas: ${data.photos.new}\n`;
        }
        if (data.photos.removed > 0) {
          message += `   🗑️ Removidas: ${data.photos.removed}\n`;
        }
        
        if (data.collections.new === 0 && data.photos.new === 0 && 
            data.collections.removed === 0 && data.photos.removed === 0) {
          message += `\n✓ Tudo já estava sincronizado!`;
        }
        
        alert(message)
        loadInitialData() // Recarrega tudo
      } catch (error) {
        alert('❌ Erro ao sincronizar')
        console.error(error)
      }
    }
  }

  // Filtrar fotos
  const filteredPhotos = photos.filter(photo => {
    // Pesquisa em múltiplas categorias
    const categoriesString = Array.isArray(photo.categories) 
      ? photo.categories.join(' ').toLowerCase() 
      : (photo.category || '').toLowerCase();
    
    const matchesSearch = photo.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         categoriesString.includes(searchTerm.toLowerCase()) ||
                         (photo.location && photo.location.toLowerCase().includes(searchTerm.toLowerCase())) ||
                         (photo.description && photo.description.toLowerCase().includes(searchTerm.toLowerCase()))
    
    // Verificar se a foto tem a categoria selecionada
    const matchesCategory = filterCategory === 'todas' || 
                           (Array.isArray(photo.categories) && photo.categories.includes(filterCategory)) ||
                           photo.category === filterCategory;
    
    const matchesCollection = filterCollection === 'all' || photo.collection === filterCollection
    
    return matchesSearch && matchesCategory && matchesCollection
  })

  // Calcular número de fotos por categoria
  const photosPerCategory = categories.reduce((acc, cat) => {
    acc[cat] = photos.filter(p => 
      Array.isArray(p.categories) ? p.categories.includes(cat) : p.category === cat
    ).length;
    return acc;
  }, {});

  // Calcular número de fotos por coleção
  const photosPerCollection = collections.reduce((acc, col) => {
    acc[col.id] = photos.filter(p => p.collection === col.id).length;
    return acc;
  }, {});

  const activeCollectionName = collections.find(c => c.id === activeCollectionId)?.name || null

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">A carregar...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <header className="bg-black bg-opacity-50 backdrop-blur-md border-b border-gray-700 sticky top-0 z-40">
        <div className="max-w-[1920px] mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <div>
                <h1 className="text-2xl font-bold text-white">Pinhality</h1>
                {!authenticated && activeCollectionName && (
                  <p className="text-xs text-gray-400">📁 {activeCollectionName}</p>
                )}
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              {authenticated ? (
                <>
                  {/* Botão Gerir */}
                  <div className="relative">
                    <button
                      onClick={() => setShowManageMenu(!showManageMenu)}
                      className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="hidden sm:inline">Gerir</span>
                    </button>
                    
                    {showManageMenu && (
                      <div className="absolute right-0 mt-2 w-56 bg-gray-800 rounded-lg shadow-xl border border-gray-700 py-2 z-50">
                        {/* Gerir Coleções */}
                        <button
                          onClick={() => {
                            setShowManageCollections(true)
                            setShowManageMenu(false)
                          }}
                          className="w-full px-4 py-2 text-left text-white hover:bg-gray-700 flex items-center space-x-2"
                        >
                          <span>📁</span>
                          <span>Gerir Coleções</span>
                        </button>
                        {/* Gerir Categorias */}
                        <button
                          onClick={() => {
                            setShowManageCategories(true)
                            setShowManageMenu(false)
                          }}
                          className="w-full px-4 py-2 text-left text-white hover:bg-gray-700 flex items-center space-x-2"
                        >
                          <span>🏷️</span>
                          <span>Gerir Categorias</span>
                        </button>
                        {/* Sincronizar */}
                        <button
                          onClick={handleSync}
                          className="w-full px-4 py-2 text-left text-white hover:bg-gray-700 flex items-center space-x-2 border-t border-gray-600"
                        >
                          <span>🔄</span>
                          <span>Sincronizar Tudo</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => setShowAddModal(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-all transform hover:scale-105"
                    title="Adicionar Fotos"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="hidden sm:inline">Fotos</span>
                  </button>
                  
                  <button
                    onClick={() => setAuthenticated(false)}
                    className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
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
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
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
      <div className="max-w-[1920px] mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Campo de Pesquisa */}
          <div className="flex-1 relative">
            <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Pesquisar fotos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Seletor de Coleções */}
          <select
            value={filterCollection}
            onChange={(e) => handleChangeCollection(e.target.value)}
            className="px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">🌍 Todas as Coleções ({photos.length})</option>
            {collections.map(col => (
              <option key={col.id} value={col.id}>
                {authenticated && col.id === activeCollectionId ? '⭐ ' : ''}📁 {col.name} ({photosPerCollection[col.id] || 0})
              </option>
            ))}
          </select>

          {/* Seletor de Categorias */}
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="todas">🏷️ Todas as Categorias ({photos.length})</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>
                {cat} ({photosPerCategory[cat] || 0})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Photo Grid */}
      <div className="max-w-[1920px] mx-auto px-4 pb-12 sm:px-6 lg:px-8">
        <PhotoGrid 
          photos={filteredPhotos} 
          onPhotoClick={setSelectedPhoto}
        />
      </div>

      {/* Modals */}
      {selectedPhoto && (
        <PhotoModal 
          photo={selectedPhoto}
          onClose={() => setSelectedPhoto(null)}
          onEdit={() => openEditModal(selectedPhoto)}
          onDelete={() => handleDeletePhoto(selectedPhoto.id)}
          authenticated={authenticated}
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

      {showManageCategories && (
        <ManageCategoriesModal
          isOpen={showManageCategories}
          onClose={() => setShowManageCategories(false)}
          categories={categories}
          photos={photos}
          onCategoriesUpdate={handleCategoriesUpdate}
        />
      )}
    </div>
  )
}