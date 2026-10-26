import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../api';

function folderAndFilename(photo) {
  const parts = String(photo.imageUrl || '').replace(/^\/+/, '').split('/');
  if (parts[0] === 'photos') parts.shift();
  return {
    folder: parts.length > 1 ? parts.slice(0, -1).join('/') : photo.orphanedFromCollection || '',
    filename: parts.at(-1) || ''
  };
}

export default function ManageOrphansModal({ isOpen, onClose, photos = [], collections = [], onPhotosChanged, onFinalize }) {
  const [folders, setFolders] = useState([]);
  const [appsScriptUrl, setAppsScriptUrl] = useState('');
  const [busyPhotoId, setBusyPhotoId] = useState(null);
  const [finalizing, setFinalizing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [jsonCopied, setJsonCopied] = useState(false);
  const [appsScriptOpened, setAppsScriptOpened] = useState(false);
  const [error, setError] = useState('');

  const orphanPhotos = useMemo(() => photos.filter(photo => photo.orphaned), [photos]);
  const pendingPhotos = useMemo(() => orphanPhotos.filter(photo => photo.pendingDriveDelete), [orphanPhotos]);

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setCopied(false);
    setJsonCopied(false);
    setAppsScriptOpened(false);
    Promise.all([
      apiFetch('/api/orphans').then(async response => {
        if (!response.ok) throw new Error('Não foi possível carregar as pastas órfãs.');
        return response.json();
      }),
      apiFetch('/api/apps-script-url').then(async response => {
        if (!response.ok) throw new Error('Não foi possível carregar o URL do Apps Script.');
        return response.json();
      })
    ]).then(([orphanFolders, scriptData]) => {
      setFolders(Array.isArray(orphanFolders) ? orphanFolders : []);
      setAppsScriptUrl(scriptData.url || '');
    }).catch(loadError => {
      console.error('Erro ao carregar dados de órfãos:', loadError);
      setError(loadError.message || 'Erro ao carregar dados de órfãos.');
    });
  }, [isOpen]);

  if (!isOpen) return null;

  const buildCopyText = () => {
    const actions = [];
    const orphanLocations = orphanPhotos.map(photo => ({
      ...folderAndFilename(photo),
      pendingDriveDelete: photo.pendingDriveDelete
    }));
    const folderPaths = [...new Set(
      folders
        .filter(folder => ['empty', 'no-photos'].includes(folder.reason))
        .filter(folder => !orphanLocations.some(photo =>
          photo.folder === folder.folderPath && !photo.pendingDriveDelete
        ))
        .map(folder => folder.folderPath)
        .filter(Boolean)
    )];

    for (const folder of folderPaths) {
      actions.push({ acao: 'apagar_pasta', pasta: folder });
    }

    const filesByFolder = new Map();
    for (const photo of pendingPhotos) {
      const { folder, filename } = folderAndFilename(photo);
      if (!folder || !filename) continue;
      if (!filesByFolder.has(folder)) filesByFolder.set(folder, new Set());
      filesByFolder.get(folder).add(filename);
    }

    for (const [folder, filenames] of filesByFolder) {
      actions.push({
        acao: 'apagar_ficheiros',
        pasta: folder,
        ficheiros: [...filenames].sort()
      });
    }

    return JSON.stringify(actions, null, 2);
  };
  const hasJsonActions = buildCopyText() !== '[]';

  const handleRestore = async (photo) => {
    const { folder } = folderAndFilename(photo);
    const matchingCollection = collections.find(collection =>
      (collection.folderPath || collection.id) === folder
    );
    if (!matchingCollection) {
      setError(`Não existe uma coleção correspondente à pasta "${folder || 'desconhecida'}". Sincroniza a base de dados ou cria primeiro a coleção.`);
      return;
    }

    setBusyPhotoId(photo.id);
    setError('');
    try {
      const response = await apiFetch('/api/photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...photo,
          collection: matchingCollection.folderPath || matchingCollection.id,
          orphaned: false,
          orphanedFromCollection: null,
          pendingDriveDelete: false
        })
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Não foi possível restaurar a fotografia.');
      }
      setJsonCopied(false);
      setAppsScriptOpened(false);
      await onPhotosChanged();
      const foldersResponse = await apiFetch('/api/orphans');
      if (foldersResponse.ok) setFolders(await foldersResponse.json());
    } catch (restoreError) {
      console.error('Erro ao restaurar foto órfã:', restoreError);
      setError(restoreError.message || 'Erro ao restaurar fotografia.');
    } finally {
      setBusyPhotoId(null);
    }
  };

  const handleMarkForDeletion = async (photo) => {
    setBusyPhotoId(photo.id);
    setError('');
    try {
      const response = await apiFetch(`/api/photos/${encodeURIComponent(photo.id)}/mark-drive-delete`, {
        method: 'POST'
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Não foi possível marcar a fotografia para apagar.');
      }
      setJsonCopied(false);
      setAppsScriptOpened(false);
      await onPhotosChanged();
      const foldersResponse = await apiFetch('/api/orphans');
      if (foldersResponse.ok) setFolders(await foldersResponse.json());
    } catch (deleteError) {
      console.error('Erro ao marcar foto órfã para apagar:', deleteError);
      setError(deleteError.message || 'Erro ao marcar fotografia para apagar.');
    } finally {
      setBusyPhotoId(null);
    }
  };

  const handleCopy = async () => {
    const text = buildCopyText();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (!successful) {
        setError('Não foi possível copiar o JSON para a área de transferência.');
        return;
      }
    }
    setCopied(true);
    setJsonCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleFinalize = async () => {
    setFinalizing(true);
    setError('');
    try {
      await onFinalize(JSON.parse(buildCopyText()));
      onClose();
    } catch (finalizeError) {
      console.error('Erro ao concluir gestão de fotos órfãs:', finalizeError);
      setError(finalizeError.message || 'Erro ao atualizar a base de dados a partir do Drive.');
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-2 sm:p-4">
      <div className="flex max-h-vd-90 w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-gray-800">
        <div className="flex items-center justify-between gap-3 border-b border-gray-700 px-4 py-4 sm:px-6">
          <h2 className="text-xl font-bold text-white sm:text-2xl">Gerir Fotos Órfãs</h2>
          <button onClick={onClose} disabled={finalizing} className="shrink-0 text-gray-400 hover:text-white disabled:opacity-50" title="Fechar">
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
          <section>
            <h3 className="mb-3 font-semibold text-white">Fotografias sem coleção ({orphanPhotos.length})</h3>
            {orphanPhotos.length === 0 ? (
              <p className="text-sm text-gray-400">Não há fotografias órfãs.</p>
            ) : (
              <div className="space-y-3">
                {orphanPhotos.map(photo => {
                  const { folder, filename } = folderAndFilename(photo);
                  const matchingCollection = collections.find(collection =>
                    (collection.folderPath || collection.id) === folder
                  );
                  const busy = busyPhotoId === photo.id;

                  return (
                    <div key={photo.id} className="rounded-lg border border-gray-700 bg-gray-900 p-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                          <p className="break-words font-medium text-white">{photo.title}</p>
                          <p className="break-all font-mono text-xs text-gray-400">{folder}/{filename}</p>
                          <p className="mt-1 text-xs text-gray-400">
                            Categorias: {Array.isArray(photo.categories) && photo.categories.length
                              ? photo.categories.join(', ')
                              : photo.category || 'nenhuma'}
                          </p>
                          <p className="mt-1 text-xs text-gray-400">
                            {matchingCollection
                              ? `Será restaurada automaticamente em: ${matchingCollection.name}`
                              : `Sem coleção para a pasta "${folder || 'desconhecida'}". Sincroniza ou cria a coleção primeiro.`}
                          </p>
                          {photo.pendingDriveDelete && (
                            <p className="mt-1 text-xs font-semibold text-yellow-300">Marcada para apagar do Drive</p>
                          )}
                        </div>
                        <div className="flex flex-col gap-2 sm:w-64">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleRestore(photo)}
                              disabled={busy || finalizing || !matchingCollection}
                              className="flex-1 rounded bg-green-700 px-3 py-2 text-sm text-white hover:bg-green-600 disabled:opacity-50"
                            >
                              Restaurar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMarkForDeletion(photo)}
                              disabled={busy || finalizing || photo.pendingDriveDelete}
                              className="flex-1 rounded bg-red-700 px-3 py-2 text-sm text-white hover:bg-red-600 disabled:opacity-50"
                            >
                              {photo.pendingDriveDelete ? 'Marcada' : 'Apagar'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="border-t border-gray-700 pt-5">
            <h3 className="mb-2 font-semibold text-white">Pastas órfãs ({folders.length})</h3>
            <p className="mb-3 text-xs text-gray-400">
              Depois de executar o JSON no Apps Script, clica em Concluir para atualizar apenas as pastas e fotos indicadas no JSON.
            </p>
            {folders.length === 0 ? (
              <p className="text-sm text-gray-400">Não há pastas órfãs registadas.</p>
            ) : (
              <ul className="space-y-2">
                {folders.map((folder, index) => (
                  <li key={`${folder.folderPath}-${folder.reason}-${index}`} className="rounded bg-gray-900 p-3">
                    <code className="break-all text-sm text-white">{folder.folderPath}</code>
                    <span className="ml-2 text-xs text-gray-400">
                      {folder.reason === 'no-photos' ? 'sem fotos associadas' : folder.reason}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="border-t border-gray-700 pt-5">
            <h3 className="mb-2 font-semibold text-white">JSON para o Google Apps Script</h3>
            <pre className="max-h-64 overflow-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-gray-200">
              {buildCopyText()}
            </pre>
            <p className="mt-2 text-xs text-gray-400">
              O JSON inclui as pastas vazias/sem coleção e as fotos marcadas para apagar.
            </p>
          </section>
        </div>

        <div className="border-t border-gray-700 px-4 py-4 sm:px-6">
          {error && (
            <div role="alert" className="mb-3 rounded-lg border border-red-700 bg-red-900/30 p-3 text-sm text-red-300">
              {error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={finalizing || busyPhotoId !== null}
              className="rounded bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-600 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleCopy}
              disabled={finalizing || busyPhotoId !== null || !hasJsonActions}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {copied ? '✓ Copiado!' : 'Copiar JSON'}
            </button>
            <a
              href={appsScriptUrl || undefined}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={!appsScriptUrl || !jsonCopied || finalizing || busyPhotoId !== null}
              onClick={event => {
                if (!appsScriptUrl || !jsonCopied || finalizing || busyPhotoId !== null) {
                  event.preventDefault();
                  return;
                }
                setAppsScriptOpened(true);
              }}
              className={`rounded px-4 py-2 text-center text-sm font-medium text-white ${
                appsScriptUrl && jsonCopied && !finalizing && busyPhotoId === null
                  ? 'bg-indigo-600 hover:bg-indigo-700'
                  : 'cursor-not-allowed bg-indigo-900 opacity-50'
              }`}
            >
              Abrir Apps Script
            </a>
            <button
              type="button"
              onClick={handleFinalize}
              disabled={finalizing || busyPhotoId !== null || !hasJsonActions || !jsonCopied || !appsScriptOpened}
              className="rounded bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50"
            >
              {finalizing ? 'A atualizar a base de dados...' : 'Concluir'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
