// ========================================
// frontend/src/components/DatabaseModal.jsx
// ========================================
import { useState, useEffect } from 'react';
import { apiFetch } from '../api';

const DB_FILES_INFO = [
  { name: 'photos.json', label: 'Fotos', icon: '📸', description: 'Todas as fotos e metadados' },
  { name: 'collections.json', label: 'Coleções', icon: '📁', description: 'Coleções de fotos' },
  { name: 'categories.json', label: 'Categorias', icon: '🏷️', description: 'Categorias e grupos' },
  { name: 'settings.json', label: 'Configurações', icon: '⚙️', description: 'Configurações do site' },
  { name: 'orphans.json', label: 'Órfãos', icon: '⚠️', description: 'Pastas órfãs detetadas' }
];

export default function DatabaseModal({ isOpen, onClose, onDataChange }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [content, setContent] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    loadFiles();
  }, [isOpen]);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/admin/database');
      if (res.ok) setFiles(await res.json());
    } catch (error) {
      console.error('Erro ao carregar BD:', error);
    } finally {
      setLoading(false);
    }
  };

  const viewFile = async (filename) => {
    try {
      const res = await apiFetch(`/api/admin/database/${filename}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedFile(filename);
        setContent(data.content);
        setEditing(false);
      }
    } catch (error) {
      alert('Erro ao carregar ficheiro');
    }
  };

  const downloadFile = (filename) => {
    window.open(`/api/admin/database/${filename}/download`, '_blank');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/admin/database/${selectedFile}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      if (res.ok) {
        alert('✅ Ficheiro guardado! Um backup (.bak) foi criado.');
        setEditing(false);
        loadFiles();
        if (onDataChange) onDataChange();
      } else {
        const err = await res.json();
        alert('❌ Erro: ' + err.error);
      }
    } catch (error) {
      alert('❌ Erro ao guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (filename, event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!window.confirm(`Substituir o conteúdo de ${filename} pelo ficheiro "${file.name}"?`)) {
      event.target.value = '';
      return;
    }
    
    const text = await file.text();
    try {
      JSON.parse(text);
    } catch (e) {
      alert('❌ O ficheiro não contém JSON válido: ' + e.message);
      event.target.value = '';
      return;
    }
    
    setSaving(true);
    try {
      const res = await apiFetch(`/api/admin/database/${filename}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text })
      });
      if (res.ok) {
        alert('✅ Ficheiro enviado com sucesso!');
        loadFiles();
        if (onDataChange) onDataChange();
      } else {
        const err = await res.json();
        alert('❌ Erro: ' + err.error);
      }
    } catch (error) {
      alert('❌ Erro ao enviar');
    } finally {
      setSaving(false);
      event.target.value = '';
    }
  };

  const handleRestore = async (filename) => {
    if (!window.confirm(`Restaurar ${filename} do backup (.bak)?`)) return;
    try {
      const res = await apiFetch(`/api/admin/database/${filename}/restore`, { method: 'POST' });
      if (res.ok) {
        alert('✅ Restaurado do backup');
        loadFiles();
        if (onDataChange) onDataChange();
      } else {
        const err = await res.json();
        alert('❌ ' + err.error);
      }
    } catch (error) {
      alert('❌ Erro ao restaurar');
    }
  };

  if (!isOpen) return null;

  const fileInfo = (name) => DB_FILES_INFO.find(f => f.name === name);
  const formatBytes = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-gray-800 rounded-lg max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold text-white">🗄️ Base de Dados</h2>
            <span className="text-yellow-500 text-xs">⚠️ Zona perigosa</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Lista de ficheiros */}
          {!selectedFile && (
            <div className="p-4 overflow-y-auto flex-1">
              <p className="text-gray-400 text-sm mb-4">
                Selecione um ficheiro para visualizar, editar, descarregar ou enviar.
              </p>
              {loading ? (
                <p className="text-gray-400 text-center py-8">A carregar...</p>
              ) : (
                <div className="space-y-2">
                  {files.map(file => {
                    const info = fileInfo(file.name) || { icon: '📄', label: file.name, description: '' };
                    return (
                      <div key={file.name} className="bg-gray-900 rounded-lg p-3 flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xl">{info.icon}</span>
                            <span className="text-white font-medium">{file.name}</span>
                            {file.count !== null && (
                              <span className="text-gray-500 text-xs">({file.count} itens)</span>
                            )}
                            <span className="text-gray-600 text-xs">•</span>
                            <span className="text-gray-400 text-xs">{formatBytes(file.size)}</span>
                          </div>
                          <p className="text-gray-500 text-xs mt-0.5">{info.description}</p>
                        </div>
                        <div className="flex gap-1 flex-wrap">
                          <button onClick={() => viewFile(file.name)} className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs" title="Ver/Editar">👁️ Ver</button>
                          <button onClick={() => downloadFile(file.name)} className="px-2 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded text-xs" title="Descarregar">⬇️</button>
                          <label className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs cursor-pointer" title="Enviar ficheiro">
                            ⬆️
                            <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => handleFileUpload(file.name, e)} />
                          </label>
                          <button onClick={() => handleRestore(file.name)} className="px-2 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-xs" title="Restaurar backup">↩️</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-700 rounded-lg">
                <p className="text-yellow-300 text-xs">
                  ⚠️ <strong>Atenção:</strong> Editar a base de dados diretamente pode quebrar o site. 
                  Faça sempre download antes de editar. Um backup (.bak) é criado automaticamente ao guardar.
                </p>
              </div>
            </div>
          )}

          {/* Editor de ficheiro */}
          {selectedFile && (
            <div className="flex flex-col flex-1 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700 bg-gray-900">
                <div className="flex items-center gap-2">
                  <button onClick={() => setSelectedFile(null)} className="text-gray-400 hover:text-white text-sm">← Voltar</button>
                  <span className="text-white text-sm font-mono">{selectedFile}</span>
                </div>
                <div className="flex gap-2">
                  {!editing ? (
                    <button onClick={() => setEditing(true)} className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs">✏️ Editar</button>
                  ) : (
                    <>
                      <button onClick={() => { setEditing(false); viewFile(selectedFile); }} className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded text-xs" disabled={saving}>✕ Cancelar</button>
                      <button onClick={handleSave} className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs" disabled={saving}>{saving ? '⏳' : '💾 Guardar'}</button>
                    </>
                  )}
                </div>
              </div>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                readOnly={!editing}
                className="flex-1 w-full bg-gray-900 text-gray-300 font-mono text-xs p-4 resize-none focus:outline-none overflow-auto"
                spellCheck={false}
                style={{ minHeight: '300px' }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}