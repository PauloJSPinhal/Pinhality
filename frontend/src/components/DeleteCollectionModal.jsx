// ========================================
// frontend/src/components/DeleteCollectionModal.jsx
// ========================================
import { useState, useEffect } from 'react';
import { apiFetch } from '../api';

export default function DeleteCollectionModal({ isOpen, onClose, collection, onDeleted }) {
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [jsonCopied, setJsonCopied] = useState(false);
  const [appsScriptOpened, setAppsScriptOpened] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState('');
  const [appsScriptUrl, setAppsScriptUrl] = useState('');

  useEffect(() => {
    if (!isOpen || !collection) return;
    setLoading(true);
    setError('');
    setFinalizeError('');
    setCopied(false);
    setJsonCopied(false);
    setAppsScriptOpened(false);
    setInfo(null);
    
    // Buscar info da coleção E o URL do Apps Script em paralelo
    Promise.all([
      apiFetch(`/api/collections/${encodeURIComponent(collection.id)}/delete-info`).then(r => r.json()),
      apiFetch('/api/apps-script-url').then(r => r.json()).catch(() => ({ url: '' }))
    ]).then(([data, scriptData]) => {
      if (data.error) setError(data.error);
      else setInfo(data);
      setAppsScriptUrl(scriptData.url || '');
    }).catch(() => setError('Erro ao carregar informações'))
      .finally(() => setLoading(false));
  }, [isOpen, collection]);

  if (!isOpen) return null;

  const buildCopyText = () => {
    if (!info) return '';
    const actions = [];
    if (info.favoritePhotos.length > 0) {
      actions.push({
        acao: 'mover',
        origem: info.folderPath,
        destino: 'favoritas',
        ficheiros: info.favoritePhotos.map(photo => photo.filename)
      });
    }
    actions.push({
      acao: 'apagar_pasta',
      pasta: info.folderPath
    });
    return JSON.stringify(actions, null, 2);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildCopyText());
      setCopied(true);
      setJsonCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = buildCopyText();
      document.body.appendChild(textarea);
      textarea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (!successful) {
        setFinalizeError('Não foi possível copiar o JSON para a área de transferência.');
        return;
      }
      setCopied(true);
      setJsonCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleConcluir = async () => {
    setFinalizing(true);
    setFinalizeError('');
    try {
      const res = await apiFetch(`/api/collections/${encodeURIComponent(collection.id)}/finalize-delete`, {
        method: 'POST'
      });
      const data = await res.json();
      if (!res.ok) {
        setFinalizeError(data.error || 'Erro ao eliminar');
        return;
      }
      onDeleted();
    } catch {
      setFinalizeError('Erro de ligação');
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[60] p-2 sm:p-4">
      <div className="bg-gray-800 rounded-lg max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">⚠️ Eliminar Coleção</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white" disabled={finalizing}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {loading && <p className="text-gray-400 text-center py-8">A carregar...</p>}
          
          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-center">
              <p className="text-red-300">{error}</p>
              <button onClick={onClose} className="mt-3 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">
                Fechar
              </button>
            </div>
          )}

          {info && !error && (
            <div className="space-y-4">
              <p className="text-white">
                Coleção: <strong>{info.name}</strong>
              </p>
              
              {/* Pasta a eliminar */}
              <div className="bg-gray-900 rounded-lg p-3 border border-gray-700">
                <p className="text-gray-400 text-xs mb-1">📂 Pasta a eliminar no Drive:</p>
                <code className="text-white text-sm font-mono break-all">{info.folderPath}</code>
              </div>

              {/* Fotos favoritas */}
              {info.favoritePhotos.length > 0 ? (
                <div className="bg-gray-900 rounded-lg p-3 border border-yellow-700">
                  <p className="text-yellow-300 text-xs mb-2">
                    ⭐ {info.favoritePhotos.length} foto(s) favorita(s) — mover para "favoritas":
                  </p>
                  <div className="space-y-1">
                    {info.favoritePhotos.map((p, i) => (
                      <code key={i} className="text-white text-sm font-mono block break-all">{p.filename}</code>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-gray-900 rounded-lg p-3 border border-gray-700">
                  <p className="text-gray-400 text-sm">Sem fotos favoritas. Pode apagar a pasta diretamente.</p>
                </div>
              )}

              <div className="bg-gray-900 rounded-lg p-3 border border-gray-700">
                <p className="text-gray-400 text-xs mb-2">JSON para o Apps Script:</p>
                <pre className="text-white text-xs font-mono whitespace-pre-wrap break-all">{buildCopyText()}</pre>
              </div>

              {/* Instruções */}
              <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-3">
                <p className="text-blue-300 text-xs font-semibold mb-2">📋 Instruções:</p>
                <ol className="text-gray-300 text-xs space-y-1 list-decimal list-inside">
                  <li>Copia o JSON acima e abre o Apps Script</li>
                  <li>No Apps Script: cola o texto, clica em "Verificar" e depois "Executar"</li>
                  <li>Volta aqui e clica em "Concluir"</li>
                </ol>
              </div>

              {finalizeError && (
                <div className="bg-red-900/30 border border-red-700 rounded-lg p-3">
                  <p className="text-red-300 text-sm">{finalizeError}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {info && !error && (
          <div className="px-4 py-4 border-t border-gray-700">
            <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
              <button
                onClick={onClose}
                disabled={finalizing}
                className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-600 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCopy}
                disabled={finalizing}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {copied ? '✓ Copiado!' : 'Copiar JSON'}
              </button>
              <a
                href={appsScriptUrl || undefined}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={!appsScriptUrl || !jsonCopied || finalizing}
                onClick={event => {
                  if (!appsScriptUrl || !jsonCopied || finalizing) {
                    event.preventDefault();
                    return;
                  }
                  setAppsScriptOpened(true);
                }}
                className={`rounded-lg px-4 py-2 text-center text-sm font-medium text-white ${
                  appsScriptUrl && jsonCopied && !finalizing
                    ? 'bg-indigo-600 hover:bg-indigo-700'
                    : 'cursor-not-allowed bg-indigo-900 opacity-50'
                }`}
              >
                Abrir Apps Script
              </a>
              <button
                onClick={handleConcluir}
                disabled={finalizing || !jsonCopied || !appsScriptOpened}
                className="flex items-center justify-center gap-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {finalizing ? '⏳ A processar...' : 'Concluir'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}