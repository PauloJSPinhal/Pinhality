// ========================================
// frontend/src/components/ManageCategoriesModal.jsx
// ========================================
import { useState } from 'react';
import { apiFetch } from '../api';

const GROUPS = [
  { id: 'rostos', name: 'Rostos & Expressões', icon: '👤', description: 'Foco no indivíduo, nas suas emoções e na perspetiva humana.' },
  { id: 'acao', name: 'Ação & Sociedade', icon: '✊', description: 'Foco em manifestações, eventos coletivos e dinâmica de grupos.' },
  { id: 'vida', name: 'Vida & Rotina', icon: '🌍', description: 'Foco no dia a dia, trabalho, deslocação e tradições.' },
  { id: 'ambiente', name: 'Ambiente & Detalhes', icon: '🏙️', description: 'Foco no cenário, na natureza e nos elementos que contextualizam a cena.' }
];

export default function ManageCategoriesModal({ 
  isOpen, 
  onClose, 
  categories = [],
  photos = [],
  onCategoriesUpdate 
}) {
  // categories agora é { groups: [...], categories: [...] }
  const data = categories && categories.categories ? categories : { groups: GROUPS, categories: [] };
  const allCategories = data.categories || [];
  
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newGroupId, setNewGroupId] = useState('rostos');
  const [editingCat, setEditingCat] = useState(null); // nome da categoria em edição
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editGroupId, setEditGroupId] = useState('');

  if (!isOpen) return null;

  const handleAdd = async () => {
    if (!newName.trim()) {
      alert('Nome da categoria é obrigatório');
      return;
    }
    try {
      await apiFetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), description: newDescription.trim(), groupId: newGroupId })
      });
      setNewName('');
      setNewDescription('');
      setNewGroupId('rostos');
      onCategoriesUpdate();
    } catch (error) {
      console.error('Erro ao adicionar categoria:', error);
      alert('Erro ao adicionar categoria');
    }
  };

  const startEdit = (cat) => {
    setEditingCat(cat.name);
    setEditName(cat.name);
    setEditDescription(cat.description || '');
    setEditGroupId(cat.groupId || 'ambiente');
  };

  const cancelEdit = () => {
    setEditingCat(null);
    setEditName('');
    setEditDescription('');
    setEditGroupId('');
  };

  const handleEdit = async (oldName) => {
    if (!editName.trim()) {
      alert('Nome não pode estar vazio');
      return;
    }
    try {
      await apiFetch(`/api/categories/${encodeURIComponent(oldName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newName: editName.trim(),
          newDescription: editDescription.trim(),
          newGroupId: editGroupId
        })
      });
      cancelEdit();
      onCategoriesUpdate();
    } catch (error) {
      console.error('Erro ao editar categoria:', error);
      alert('Erro ao editar categoria');
    }
  };

  const handleDelete = async (categoryName) => {
    const photoCount = photos.filter(p => 
      Array.isArray(p.categories) ? p.categories.includes(categoryName) : p.category === categoryName
    ).length;

    const message = photoCount > 0 
      ? `Tem a certeza que deseja eliminar a categoria "${categoryName}"?\n\n${photoCount} foto(s) perderá(ão) esta categoria.`
      : `Tem a certeza que deseja eliminar a categoria "${categoryName}"?`;

    if (!window.confirm(message)) return;
    
    try {
      await apiFetch(`/api/categories/${encodeURIComponent(categoryName)}`, { method: 'DELETE' });
      onCategoriesUpdate();
    } catch (error) {
      console.error('Erro ao eliminar categoria:', error);
      alert('Erro ao eliminar categoria');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-2 sm:p-4 overscroll-contain">
      <div className="bg-gray-800 rounded-lg max-w-3xl w-full max-h-vd-90 sm:max-h-vd-80 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-4 sm:p-6 border-b border-gray-700">
          <h2 className="text-xl sm:text-2xl font-bold text-white">Gerir Categorias</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white shrink-0" title="Fechar">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="p-4 sm:p-6 overflow-y-auto overscroll-contain flex-1 min-h-0">
          
          {/* Categorias existentes, agrupadas */}
          <div className="mb-6">
            <h3 className="text-white font-semibold mb-3">Categorias Atuais</h3>
            {GROUPS.map(group => {
              const catsInGroup = allCategories.filter(c => c.groupId === group.id);
              if (catsInGroup.length === 0) return null;
              return (
                <div key={group.id} className="mb-4">
                  <div className="flex items-center gap-2 mb-2 px-2">
                    <span className="text-xl">{group.icon}</span>
                    <span className="text-white font-semibold text-sm">{group.name}</span>
                    <span className="text-gray-500 text-xs">({catsInGroup.length})</span>
                  </div>
                  <p className="text-gray-500 text-xs mb-2 px-2">{group.description}</p>
                  <div className="space-y-2">
                    {catsInGroup.map(cat => {
                      const photoCount = photos.filter(p => 
                        Array.isArray(p.categories) ? p.categories.includes(cat.name) : p.category === cat.name
                      ).length;
                      const isEditing = editingCat === cat.name;
                      return (
                        <div key={cat.name} className="bg-gray-900 rounded-lg p-3">
                          {isEditing ? (
                            <div className="space-y-2">
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  placeholder="Nome"
                                  autoFocus
                                />
                                <select
                                  value={editGroupId}
                                  onChange={(e) => setEditGroupId(e.target.value)}
                                  className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                  {GROUPS.map(g => (
                                    <option key={g.id} value={g.id}>{g.icon} {g.name}</option>
                                  ))}
                                </select>
                              </div>
                              <textarea
                                value={editDescription}
                                onChange={(e) => setEditDescription(e.target.value)}
                                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                placeholder="Descrição da categoria"
                                rows={2}
                              />
                              <div className="flex gap-2 justify-end">
                                <button
                                  onClick={() => handleEdit(cat.name)}
                                  className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm"
                                >
                                  ✓ Guardar
                                </button>
                                <button
                                  onClick={cancelEdit}
                                  className="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm"
                                >
                                  ✕ Cancelar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-white text-sm font-medium">{cat.name}</span>
                                  <span className="text-gray-500 text-xs">({photoCount})</span>
                                </div>
                                {cat.description && (
                                  <p className="text-gray-400 text-xs mt-0.5">{cat.description}</p>
                                )}
                              </div>
                              <div className="flex gap-1 shrink-0">
                                <button
                                  onClick={() => startEdit(cat)}
                                  className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs"
                                  title="Editar"
                                >
                                  ✏️
                                </button>
                                <button
                                  onClick={() => handleDelete(cat.name)}
                                  className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs"
                                  title="Eliminar"
                                >
                                  🗑️
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {allCategories.length === 0 && (
              <p className="text-gray-400 text-center py-8">Nenhuma categoria criada ainda.</p>
            )}
          </div>
          
          {/* Nova categoria */}
          <div className="border-t border-gray-700 pt-6">
            <h3 className="text-white font-semibold mb-3">Nova Categoria</h3>
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nome da categoria"
                  className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyPress={(e) => { if (e.key === 'Enter') handleAdd(); }}
                />
                <select
                  value={newGroupId}
                  onChange={(e) => setNewGroupId(e.target.value)}
                  className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {GROUPS.map(g => (
                    <option key={g.id} value={g.id}>{g.icon} {g.name}</option>
                  ))}
                </select>
              </div>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Descrição da categoria"
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows={2}
              />
              <button
                onClick={handleAdd}
                className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Adicionar Categoria
              </button>
            </div>
          </div>
        </div>
        
        <div className="px-4 py-4 sm:p-6 border-t border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}