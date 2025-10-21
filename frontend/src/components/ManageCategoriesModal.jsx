// ========================================
// frontend/src/components/ManageCategoriesModal.jsx - VERSÃO CORRIGIDA
// ========================================
import { useState } from 'react';

export default function ManageCategoriesModal({ 
  isOpen, 
  onClose, 
  categories = [],
  photos = [],
  onCategoriesUpdate 
}) {
  const [newCategory, setNewCategory] = useState('');
  const [editingCategory, setEditingCategory] = useState(null);
  const [editValue, setEditValue] = useState('');

  if (!isOpen) return null;

  const handleAdd = async () => {
    if (!newCategory.trim()) {
      alert('Nome da categoria é obrigatório');
      return;
    }
    try {
      await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCategory.trim() })
      });
      setNewCategory('');
      onCategoriesUpdate();
      alert('Categoria adicionada!');
    } catch (error) {
      console.error('Erro ao adicionar categoria:', error);
      alert('Erro ao adicionar categoria');
    }
  };

  const handleEdit = async (oldName) => {
    if (!editValue.trim()) {
      alert('Nome da categoria não pode estar vazio');
      return;
    }
    try {
      await fetch(`/api/categories/${encodeURIComponent(oldName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName: editValue.trim() })
      });
      setEditingCategory(null);
      setEditValue('');
      onCategoriesUpdate();
      alert('Categoria renomeada!');
    } catch (error) {
      console.error('Erro ao renomear categoria:', error);
      alert('Erro ao renomear categoria');
    }
  };

  const handleDelete = async (categoryName) => {
    const photoCount = photos.filter(p => 
      Array.isArray(p.categories) ? p.categories.includes(categoryName) : p.category === categoryName
    ).length;

    const message = photoCount > 0 
      ? `Tem a certeza que deseja eliminar a categoria "${categoryName}"?\n\n${photoCount} foto${photoCount !== 1 ? 's' : ''} ${photoCount !== 1 ? 'perderão' : 'perderá'} esta categoria.`
      : `Tem a certeza que deseja eliminar a categoria "${categoryName}"?`;

    if (!window.confirm(message)) {
      return;
    }
    
    try {
      await fetch(`/api/categories/${encodeURIComponent(categoryName)}`, {
        method: 'DELETE'
      });
      onCategoriesUpdate();
      alert('Categoria eliminada!');
    } catch (error) {
      console.error('Erro ao eliminar categoria:', error);
      alert('Erro ao eliminar categoria');
    }
  };

  const startEdit = (category) => {
    setEditingCategory(category);
    setEditValue(category);
  };

  const cancelEdit = () => {
    setEditingCategory(null);
    setEditValue('');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-2xl font-bold text-white">Gerir Categorias</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1">
          <div className="mb-6">
            <h3 className="text-white font-semibold mb-3">Categorias Atuais</h3>
            {categories.length === 0 ? (
              <p className="text-gray-400 text-center py-8">Nenhuma categoria criada ainda.</p>
            ) : (
              <div className="space-y-2">
                {categories.map(category => {
                  // Calcular fotos desta categoria
                  const photoCount = photos.filter(p => 
                    Array.isArray(p.categories) ? p.categories.includes(category) : p.category === category
                  ).length;
                  
                  return (
                    <div 
                      key={category} 
                      className="bg-gray-900 rounded-lg p-3 flex items-center justify-between"
                    >
                      {editingCategory === category ? (
                        <>
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                            onKeyPress={(e) => {
                              if (e.key === 'Enter') handleEdit(category);
                              if (e.key === 'Escape') cancelEdit();
                            }}
                          />
                          <div className="flex items-center gap-2 ml-3">
                            <button
                              onClick={() => handleEdit(category)}
                              className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm transition-colors"
                              title="Confirmar"
                            >
                              ✓
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm transition-colors"
                              title="Cancelar"
                            >
                              ✕
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex-1 flex items-center justify-between">
                            <span className="text-white">🏷️ {category}</span>
                            <span className="text-gray-400 text-sm ml-3">
                              {photoCount} {photoCount === 1 ? 'foto' : 'fotos'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            <button
                              onClick={() => startEdit(category)}
                              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
                              title="Renomear"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => handleDelete(category)}
                              className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm transition-colors"
                              title="Eliminar"
                            >
                              🗑️
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          
          <div className="border-t border-gray-700 pt-6">
            <h3 className="text-white font-semibold mb-3">Nova Categoria</h3>
            <div className="flex gap-3">
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="ex: Paisagem"
                className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') handleAdd();
                }}
              />
              <button
                onClick={handleAdd}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center space-x-2"
                title="Adicionar Categoria"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="hidden sm:inline">Adicionar</span>
              </button>
            </div>
          </div>
        </div>
        
        <div className="p-6 border-t border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center space-x-2"
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
  );
}