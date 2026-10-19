// ========================================
// frontend/src/components/ManageCollectionsModal.jsx - VERSÃO FINAL
// ========================================
import { useState, useEffect } from 'react';
import { apiFetch } from '../api';

export default function ManageCollectionsModal({ 
  isOpen, 
  onClose, 
  collections, 
  photos = [],
  activeCollectionId,
  onCollectionsUpdate,
  onSetActive 
}) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCollection, setEditingCollection] = useState(null);

  if (!isOpen) return null;

  const handleDelete = async (collectionId, collectionName) => {
    if (!window.confirm(`Tem a certeza que deseja eliminar a coleção "${collectionName}"?\n\nAs fotos desta coleção ficarão sem coleção.`)) {
      return;
    }

    try {
      await apiFetch(`/api/collections/${collectionId}`, { method: 'DELETE' });
      onCollectionsUpdate();
      alert('Coleção eliminada com sucesso!');
    } catch (error) {
      console.error('Erro ao eliminar coleção:', error);
      alert('Erro ao eliminar coleção');
    }
  };

  const handleSetActive = async (collectionId) => {
    try {
      await apiFetch('/api/settings/active-collection', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collectionId })
      });
      onSetActive(collectionId);
      alert('Coleção ativa definida!');
    } catch (error) {
      console.error('Erro ao definir coleção ativa:', error);
      alert('Erro ao definir coleção ativa');
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-2 sm:p-4 overscroll-contain">
        <div className="bg-gray-800 rounded-lg max-w-3xl w-full max-h-vd-90 sm:max-h-vd-80 short:max-h-vd-90 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between gap-3 px-4 py-4 sm:p-6 short:py-3 border-b border-gray-700">
            <h2 className="text-xl sm:text-2xl font-bold text-white min-w-0">Gerir Coleções</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white shrink-0 flex items-center justify-center" title="Fechar">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="p-4 sm:p-6 overflow-y-auto overscroll-contain flex-1 min-h-0">
            {collections.length === 0 ? (
              <div className="text-center py-12">
                <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <p className="text-gray-400">Ainda não há coleções criadas.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {collections.map(collection => (
                  <div 
                    key={collection.id} 
                    className={`bg-gray-900 rounded-lg p-4 border-2 ${
                      collection.id === activeCollectionId 
                        ? 'border-yellow-500' 
                        : 'border-transparent'
                    }`}
                  >
                    {/* Paulo: em ecrãs estreitos os botões passam para baixo do nome, em vez de o esmagarem */}
                    <div className="flex flex-col xs:flex-row xs:items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-2 min-w-0">
                          <h3 className="text-lg font-semibold text-white min-w-0 break-words">
                            {collection.name}
                          </h3>
                          {collection.id === activeCollectionId && (
                            <span className="text-yellow-400 text-xl" title="Coleção Ativa">⭐</span>
                          )}
                        </div>
                        {collection.description && (
                          <p className="text-gray-400 text-sm mb-2 break-words">{collection.description}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                          <span>📸 {collection.photoCount} foto{collection.photoCount !== 1 ? 's' : ''}</span>
                          <span>📅 {new Date(collection.createdAt).toLocaleDateString('pt-PT')}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 xs:ml-4 shrink-0">
                        {collection.id !== activeCollectionId && (
                            <button
                            onClick={() => handleSetActive(collection.id)}
                            className="px-3 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm transition-colors flex items-center space-x-1"
                            title="Definir como ativa"
                            >
                            <span>⭐</span>
                            <span className="hidden sm:inline">Ativar</span>
                            </button>
                        )}
                        <button
                            onClick={() => setEditingCollection(collection)}
                            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
                            title="Editar"
                        >
                            ✏️
                        </button>
                        <button
                            onClick={() => handleDelete(collection.id, collection.name)}
                            className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm transition-colors"
                            title="Eliminar"
                        >
                            🗑️
                        </button>
                        </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="px-4 py-4 sm:p-6 short:py-3 border-t border-gray-700 flex gap-3">
            <button
                onClick={() => setShowCreateModal(true)}
                className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center justify-center space-x-2"
                title="Nova Coleção"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="hidden sm:inline">Nova</span>
            </button>
            <button
                onClick={onClose}
                className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center justify-center space-x-2"
                title="Fechar"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="hidden sm:inline">Fechar</span>
            </button>
            </div>
        </div>
      </div>

      {/* Modal Criar/Editar Coleção */}
      {(showCreateModal || editingCollection) && (
        <CreateEditCollectionModal
          isOpen={true}
          onClose={() => {
            setShowCreateModal(false);
            setEditingCollection(null);
          }}
          onSave={onCollectionsUpdate}
          collection={editingCollection}
        />
      )}
    </>
  );
}

// ========================================
// SUB-COMPONENTE: CreateEditCollectionModal
// ========================================
function CreateEditCollectionModal({ isOpen, onClose, onSave, collection = null }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    setAsActive: false
  });

  useEffect(() => {
    if (collection) {
      setFormData({
        name: collection.name,
        description: collection.description || '',
        setAsActive: false
      });
    } else {
      setFormData({
        name: '',
        description: '',
        setAsActive: true // Por padrão, nova coleção fica ativa
      });
    }
  }, [collection]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      alert('Nome da coleção é obrigatório');
      return;
    }

    try {
      if (collection) {
        // Editar
        await apiFetch(`/api/collections/${collection.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        alert('Coleção atualizada!');
      } else {
        // Criar
        await apiFetch('/api/collections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        alert('Coleção criada!');
      }
      onSave();
      onClose();
    } catch (error) {
      console.error('Erro ao guardar coleção:', error);
      alert('Erro ao guardar coleção');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[60] p-2 sm:p-4 overscroll-contain">
      <div className="bg-gray-800 rounded-lg max-w-lg w-full max-h-vd-90 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-4 sm:p-6 short:py-3 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white min-w-0">
            {collection ? 'Editar Coleção' : 'Nova Coleção'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white shrink-0 flex items-center justify-center" title="Fechar">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div>
            <label className="block text-gray-300 mb-2">Nome da Coleção *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="ex: Reportagem Mercado Bolhão"
              required
            />
          </div>

          <div>
            <label className="block text-gray-300 mb-2">Descrição (opcional)</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows="3"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Cobertura fotográfica da renovação..."
            />
          </div>

          {!collection && (
            <div className="flex items-center space-x-2 py-1">
              <input
                type="checkbox"
                id="setAsActive"
                checked={formData.setAsActive}
                onChange={(e) => setFormData({ ...formData, setAsActive: e.target.checked })}
                className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
              />
              <label htmlFor="setAsActive" className="text-gray-300 text-sm py-2">
                Definir como coleção ativa
              </label>
            </div>
          )}
        </form>

        <div className="flex justify-end space-x-3 px-4 py-4 sm:p-6 short:py-3 border-t border-gray-700">
            <button
                onClick={onClose}
                className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center space-x-2"
                title="Cancelar"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="hidden sm:inline">Cancelar</span>
            </button>
            <button
                onClick={handleSubmit}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center space-x-2"
                title={collection ? 'Guardar' : 'Criar'}
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="hidden sm:inline">{collection ? 'Guardar' : 'Criar'}</span>
            </button>
            </div>
      </div>
    </div>
  );
}