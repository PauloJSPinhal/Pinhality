// ========================================
// frontend/src/components/ManageCollectionsModal.jsx
// ========================================
import { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import DeleteCollectionModal from './DeleteCollectionModal';

export default function ManageCollectionsModal({ 
  isOpen, 
  onClose, 
  collections = [],
  activeCollectionId,
  onCollectionsUpdate,
  onSetActive
}) {
  const [newName, setNewName] = useState('');
  const [newFolderPath, setNewFolderPath] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [orphans, setOrphans] = useState([]);
  const [loadingOrphans, setLoadingOrphans] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null); // NOVO: para o modal de eliminação

  // Buscar orfãos quando o modal abre
  useEffect(() => {
    if (!isOpen) return;
    setLoadingOrphans(true);
    apiFetch('/api/orphans')
      .then(res => res.json())
      .then(data => setOrphans(Array.isArray(data) ? data : []))
      .catch(() => setOrphans([]))
      .finally(() => setLoadingOrphans(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAdd = async () => {
    if (!newName.trim()) {
      alert('Nome da coleção é obrigatório');
      return;
    }
    try {
      const res = await apiFetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: newName.trim(), 
          folderPath: newFolderPath.trim() || undefined,
          description: newDescription.trim() 
        })
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Erro ao adicionar coleção');
        return;
      }
      setNewName('');
      setNewFolderPath('');
      setNewDescription('');
      onCollectionsUpdate();
    } catch (error) {
      console.error('Erro ao adicionar coleção:', error);
      alert('Erro ao adicionar coleção');
    }
  };

  const startEdit = (col) => {
    setEditingId(col.id);
    setEditName(col.name);
    setEditDescription(col.description || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditDescription('');
  };

  const handleEdit = async (col) => {
    if (!editName.trim()) {
      alert('Nome não pode estar vazio');
      return;
    }
    try {
      const res = await apiFetch(`/api/collections/${encodeURIComponent(col.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: editName.trim(),
          description: editDescription.trim()
        })
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Erro ao editar coleção');
        return;
      }
      cancelEdit();
      onCollectionsUpdate();
    } catch (error) {
      console.error('Erro ao editar coleção:', error);
      alert('Erro ao editar coleção');
    }
  };

  // NOVO: Apenas abre o DeleteCollectionModal (deixa o trabalho pesado para ele)
  const handleDelete = (col) => {
    // Proteger favoritas
    if (col.id === 'favoritas' || col.folderPath === 'favoritas' || (col.name || '').toLowerCase() === 'favoritas') {
      alert('A coleção "favoritas" não pode ser eliminada.');
      return;
    }
    setDeleteTarget(col);
  };

  // NOVO: Callback quando a eliminação é concluída com sucesso
  const handleDeleteComplete = () => {
    setDeleteTarget(null);
    onCollectionsUpdate();
  };

  const handleSetActive = (col) => {
    onSetActive(col.folderPath || col.id);
    onClose();
  };

  const isActive = (col) => activeCollectionId === col.id || activeCollectionId === col.folderPath;

  // Agrupar coleções: top-level vs sub-coleções (agrupadas por pasta-mãe)
  const topLevel = collections.filter(c => !c.folderPath || !c.folderPath.includes('/'));
  const subCollections = collections.filter(c => c.folderPath && c.folderPath.includes('/'));
  const parentGroups = {};
  for (const col of subCollections) {
    const parent = col.folderPath.split('/')[0];
    if (!parentGroups[parent]) parentGroups[parent] = [];
    parentGroups[parent].push(col);
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-2 sm:p-4 overscroll-contain">
      <div className="bg-gray-800 rounded-lg max-w-3xl w-full max-h-vd-90 sm:max-h-vd-80 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-4 sm:p-6 border-b border-gray-700">
          <h2 className="text-xl sm:text-2xl font-bold text-white">Gerir Coleções</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white shrink-0" title="Fechar">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="p-4 sm:p-6 overflow-y-auto overscroll-contain flex-1 min-h-0">
          {/* Coleções existentes */}
          <div className="mb-6">
            <h3 className="text-white font-semibold mb-3">Coleções Existentes ({collections.length})</h3>
            
            {collections.length === 0 && (
              <p className="text-gray-400 text-center py-4">Nenhuma coleção criada.</p>
            )}

            {/* Coleções top-level */}
            {topLevel.length > 0 && (
              <div className="space-y-2 mb-3">
                {topLevel.map(col => (
                  <CollectionRow 
                    key={col.id} 
                    col={col} 
                    editing={editingId === col.id}
                    editName={editName}
                    editDescription={editDescription}
                    setEditName={setEditName}
                    setEditDescription={setEditDescription}
                    onStartEdit={startEdit}
                    onCancelEdit={cancelEdit}
                    onConfirmEdit={handleEdit}
                    onDelete={handleDelete}
                    onSetActive={handleSetActive}
                    isActive={isActive(col)}
                  />
                ))}
              </div>
            )}

            {/* Sub-coleções agrupadas por pasta-mãe */}
            {Object.keys(parentGroups).map(parent => (
              <div key={parent} className="mb-3">
                <div className="flex items-center gap-2 mb-2 px-2">
                  <span className="text-gray-400 text-sm font-semibold">
                    📂 {parent.charAt(0).toUpperCase() + parent.slice(1)}
                  </span>
                  <span className="text-gray-500 text-xs">({parentGroups[parent].length} sub-coleções)</span>
                </div>
                <div className="space-y-2 ml-4 border-l-2 border-gray-700 pl-3">
                  {parentGroups[parent].map(col => (
                    <CollectionRow 
                      key={col.id} 
                      col={col} 
                      editing={editingId === col.id}
                      editName={editName}
                      editDescription={editDescription}
                      setEditName={setEditName}
                      setEditDescription={setEditDescription}
                      onStartEdit={startEdit}
                      onCancelEdit={cancelEdit}
                      onConfirmEdit={handleEdit}
                      onDelete={handleDelete}
                      onSetActive={handleSetActive}
                      isActive={isActive(col)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          
          {/* Nova coleção */}
          <div className="border-t border-gray-700 pt-6">
            <h3 className="text-white font-semibold mb-3">Nova Coleção</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-300 text-xs mb-1">Nome apresentado *</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Ex: Viagem ao Porto"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onKeyPress={(e) => { if (e.key === 'Enter') handleAdd(); }}
                  />
                </div>
                <div>
                  <label className="block text-gray-300 text-xs mb-1">Pasta no Drive</label>
                  <input
                    type="text"
                    value={newFolderPath}
                    onChange={(e) => setNewFolderPath(e.target.value)}
                    placeholder="Ex: passeios/porto-2024"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onKeyPress={(e) => { if (e.key === 'Enter') handleAdd(); }}
                  />
                </div>
              </div>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Descrição (opcional)"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows={2}
              />
              <button
                onClick={handleAdd}
                className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Adicionar Coleção
              </button>
              <p className="text-gray-500 text-xs">
                💡 A "Pasta no Drive" deve corresponder ao caminho da pasta no Google Drive (ex: <code className="text-gray-400">passeios/porto-2024</code>). Se vazio, usa o nome como ID.
              </p>
            </div>
          </div>

          {/* Secção de Pastas Órfãs */}
          <div className="border-t border-gray-700 pt-6 mt-6">
            <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
              <span>⚠️</span>
              <span>Pastas Órfãs</span>
              {orphans.length > 0 && (
                <span className="bg-yellow-500 text-black text-xs font-bold px-2 py-0.5 rounded-full">
                  {orphans.length}
                </span>
              )}
            </h3>
            {loadingOrphans ? (
              <p className="text-gray-400 text-sm">A carregar...</p>
            ) : orphans.length === 0 ? (
              <p className="text-green-400 text-sm">✓ Sem pastas órfãs. Tudo em ordem!</p>
            ) : (
              <div className="space-y-2">
                {orphans.map((orphan, i) => (
                  <div key={i} className="bg-gray-900 rounded-lg p-3 border border-yellow-700">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                        orphan.reason === 'empty' ? 'bg-gray-600 text-gray-300' :
                        orphan.reason === 'no-photos' ? 'bg-yellow-500 text-black' :
                        orphan.reason === 'mixed' ? 'bg-red-600 text-white' :
                        orphan.reason === 'too-deep' ? 'bg-orange-600 text-white' :
                        'bg-yellow-600 text-black'
                      }`}>
                        {orphan.reason === 'empty' ? 'VAZIA' :
                         orphan.reason === 'no-photos' ? 'SEM FOTOS ASSOCIADAS' :
                         orphan.reason === 'mixed' ? 'MISTA' :
                         orphan.reason === 'too-deep' ? 'PROFUNDIDADE' :
                         orphan.reason.toUpperCase()}
                      </span>
                      <code className="text-white text-sm font-mono break-all">{orphan.folderPath}</code>
                    </div>
                    <p className="text-gray-400 text-xs">{orphan.message}</p>
                  </div>
                ))}
                {orphans.some(orphan => ['empty', 'mixed', 'too-deep'].includes(orphan.reason)) && (
                  <p className="text-gray-500 text-xs mt-2">
                    💡 Para resolver, organize as pastas no Google Drive: cada pasta deve conter OU só fotos OU só subpastas (máx 2 níveis).
                  </p>
                )}
              </div>
            )}
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

      {/* NOVO: Modal de Eliminação de Coleção */}
      {deleteTarget && (
        <DeleteCollectionModal
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          collection={deleteTarget}
          onDeleted={handleDeleteComplete}
        />
      )}
    </div>
  );
}

// Sub-componente: linha de coleção (modo visualização ou edição)
function CollectionRow({ 
  col, editing, editName, editDescription, 
  setEditName, setEditDescription,
  onStartEdit, onCancelEdit, onConfirmEdit, onDelete, onSetActive, isActive 
}) {
  if (editing) {
    return (
      <div className="bg-gray-900 rounded-lg p-3 space-y-2">
        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Nome apresentado"
          autoFocus
        />
        <textarea
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          placeholder="Descrição"
          rows={2}
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => onConfirmEdit(col)}
            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs"
          >
            ✓ Guardar
          </button>
          <button
            onClick={onCancelEdit}
            className="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-xs"
          >
            ✕ Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-gray-900 rounded-lg p-3 ${isActive ? 'border border-yellow-500' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white text-sm font-medium">{col.name}</span>
            <span className="text-gray-500 text-xs">({col.photoCount || 0})</span>
            {isActive && <span className="text-yellow-400 text-xs">⭐ ativa</span>}
          </div>
          {col.folderPath && (
            <code className="text-gray-500 text-xs font-mono block mt-0.5 break-all">📁 {col.folderPath}</code>
          )}
          {col.description && (
            <p className="text-gray-400 text-xs mt-1">{col.description}</p>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          {!isActive && (
            <button
              onClick={() => onSetActive(col)}
              className="px-2 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-xs"
              title="Definir como ativa"
            >
              ⭐
            </button>
          )}
          <button
            onClick={() => onStartEdit(col)}
            className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs"
            title="Editar"
          >
            ✏️
          </button>
          <button
            onClick={() => onDelete(col)}
            className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs"
            title="Eliminar"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
}