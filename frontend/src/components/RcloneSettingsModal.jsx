// ========================================
// frontend/src/components/RcloneSettingsModal.jsx
// Credenciais do rclone (Google Drive) na área de administração.
// Os segredos nunca voltam ao browser: só se mostra se existem.
// Paulo: este ecrã substitui o rclone.conf copiado à mão. O token fica só no servidor (ficheiro com
// permissões 600); campos secretos vazios mantêm o valor guardado.
// ========================================
import { useState, useEffect } from 'react';
import { apiFetch } from '../api';

const SOURCE_LABELS = {
  stored: 'Credenciais guardadas neste ecrã',
  env: 'Variáveis de ambiente (RCLONE_CONFIG_GDRIVE_*)',
  legacy: 'Ficheiro rclone.conf antigo na pasta das fotos'
};

const inputClass = 'w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500';

function extractFolderId(value) {
  const v = value.trim();
  const m = v.match(/\/folders\/([A-Za-z0-9_-]+)/) || v.match(/[?&]id=([A-Za-z0-9_-]+)/);
  return m ? m[1] : v;
}

export default function RcloneSettingsModal({ isOpen, onClose, reason }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    token: '', client_id: '', client_secret: '', root_folder_id: '', path: '', scope: 'drive.readonly', team_drive: ''
  });

  const loadStatus = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/admin/rclone');
      if (!res.ok) throw new Error((await res.json()).error || 'Erro ao ler o estado');
      const data = await res.json();
      setStatus(data);
      setForm(f => ({
        ...f,
        token: '', client_id: '', client_secret: '',
        root_folder_id: data.stored.rootFolderId || '',
        path: data.stored.path || '',
        scope: data.stored.scope || 'drive.readonly',
        team_drive: data.stored.teamDrive || ''
      }));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setError('');
      setTestResult(null);
      loadStatus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setTestResult(null);
    if (!status?.stored?.hasToken && !form.token.trim()) {
      setError('Cole o token do Google Drive (JSON devolvido pelo "rclone authorize").');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch('/api/admin/rclone', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, root_folder_id: extractFolderId(form.root_folder_id) })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao guardar');
      await loadStatus();
      await handleTest();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiFetch('/api/admin/rclone/test', { method: 'POST' });
      const data = await res.json();
      setTestResult({ ok: !!data.ok, message: data.message || data.error, folders: data.folders || [] });
      const st = await apiFetch('/api/admin/rclone');
      if (st.ok) setStatus(await st.json());
    } catch {
      setTestResult({ ok: false, message: 'Erro de ligação ao servidor.' });
    } finally {
      setTesting(false);
    }
  };

  const handleRemove = async () => {
    if (!window.confirm('Remover as credenciais guardadas do Google Drive?')) return;
    await apiFetch('/api/admin/rclone', { method: 'DELETE' });
    setTestResult(null);
    loadStatus();
  };

  const stored = status?.stored || {};
  const lastTest = status?.lastTest;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-2 sm:p-4 overscroll-contain">
      <div className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-vd-90 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between gap-3 px-4 py-4 sm:p-6 short:py-3 border-b border-gray-700">
          <h2 className="text-xl sm:text-2xl font-bold text-white min-w-0">☁️ Ligação ao Google Drive</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white shrink-0 flex items-center justify-center" title="Fechar">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto overscroll-contain flex-1 min-h-0 space-y-5">
          {reason && (
            <div className="bg-yellow-900 bg-opacity-50 border border-yellow-700 text-yellow-200 rounded-lg p-3 text-sm">
              ⚠️ {reason}
            </div>
          )}

          {/* Estado */}
          <div className="bg-gray-900 rounded-lg p-4 text-sm space-y-1 break-words">
            {loading ? (
              <p className="text-gray-400">A carregar estado...</p>
            ) : status ? (
              <>
                <p className="text-white">
                  Estado:{' '}
                  {status.configured
                    ? <span className="text-green-400 font-semibold">configurado</span>
                    : <span className="text-red-400 font-semibold">não configurado</span>}
                </p>
                {status.configured && (
                  <>
                    <p className="text-gray-400">Origem: {SOURCE_LABELS[status.source] || status.source}</p>
                    <p className="text-gray-400">Pasta remota: <code className="text-gray-300 break-all">{status.remote}</code></p>
                  </>
                )}
                {stored.updatedAt && (
                  <p className="text-gray-400">Atualizado em: {new Date(stored.updatedAt).toLocaleString('pt-PT')}</p>
                )}
                {lastTest && (
                  <p className={lastTest.ok ? 'text-green-400' : 'text-red-400'}>
                    Último teste ({new Date(lastTest.at).toLocaleString('pt-PT')}): {lastTest.ok ? '✅' : '❌'} {lastTest.message}
                  </p>
                )}
              </>
            ) : null}
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1">
                Token OAuth (JSON) {stored.hasToken && <span className="text-green-400">• guardado</span>}
              </label>
              <textarea
                value={form.token}
                onChange={set('token')}
                rows={3}
                className={`${inputClass} font-mono text-base sm:text-xs`}
                placeholder={stored.hasToken ? 'Deixe vazio para manter o token atual' : '{"access_token":"...","token_type":"Bearer","refresh_token":"...","expiry":"..."}'}
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-gray-500 mt-1">
                Num computador com o rclone, corra <code className="break-all">rclone authorize "drive" "eyJzY29wZSI6ImRyaXZlLnJlYWRvbmx5In0"</code> (acesso só de leitura), inicie sessão na conta Google e cole aqui o JSON que aparece.
              </p>
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1">ID ou URL da pasta das fotos no Drive</label>
              <input
                type="text"
                value={form.root_folder_id}
                onChange={set('root_folder_id')}
                className={inputClass}
                placeholder="https://drive.google.com/drive/folders/1AbC...xyz  ou  1AbC...xyz"
              />
              <p className="text-xs text-gray-500 mt-1">
                Funciona com uma conta Google normal. A pasta indicada passa a ser a raiz; dentro dela deve haver uma subpasta por coleção.
              </p>
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1">Caminho dentro dessa pasta (opcional)</label>
              <input
                type="text"
                value={form.path}
                onChange={set('path')}
                className={inputClass}
                placeholder="vazio = a própria pasta; ex.: fotos-site"
              />
            </div>

            <details className="bg-gray-900 rounded-lg">
              {/* O padding está no summary para toda a faixa ser clicável (mais fácil com o dedo) */}
              <summary className="text-sm text-gray-300 cursor-pointer p-4">Opções avançadas</summary>
              <div className="space-y-4 px-4 pb-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">
                    Client ID (opcional) {stored.clientId && <span className="text-green-400">• {stored.clientId}</span>}
                  </label>
                  <input type="text" value={form.client_id} onChange={set('client_id')} className={inputClass}
                    placeholder={stored.clientId ? 'Deixe vazio para manter' : 'Só se usou um client ID próprio no rclone authorize'} autoComplete="off" />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">
                    Client Secret (opcional) {stored.hasClientSecret && <span className="text-green-400">• guardado</span>}
                  </label>
                  <input type="password" value={form.client_secret} onChange={set('client_secret')} className={inputClass}
                    placeholder={stored.hasClientSecret ? 'Deixe vazio para manter' : ''} autoComplete="new-password" />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Âmbito</label>
                  <select value={form.scope} onChange={set('scope')} className={inputClass}>
                    <option value="drive.readonly">Só leitura (recomendado)</option>
                    <option value="drive">Acesso total</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">ID de Drive partilhada (opcional)</label>
                  <input type="text" value={form.team_drive} onChange={set('team_drive')} className={inputClass}
                    placeholder="Só para Drives partilhadas do Google Workspace" />
                </div>
              </div>
            </details>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            {testResult && (
              <div className={`rounded-lg p-3 text-sm break-words ${testResult.ok ? 'bg-green-900 bg-opacity-50 text-green-200' : 'bg-red-900 bg-opacity-50 text-red-200'}`}>
                <p>{testResult.ok ? '✅' : '❌'} {testResult.message}</p>
                {testResult.ok && testResult.folders.length > 0 && (
                  <p className="mt-1 text-xs break-words">📁 {testResult.folders.join(', ')}</p>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-3 pt-2">
              <button type="submit" disabled={saving || loading}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
                {saving ? 'A guardar...' : '💾 Guardar'}
              </button>
              <button type="button" onClick={handleTest} disabled={testing || loading || !status?.configured}
                className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg disabled:opacity-50">
                {testing ? 'A testar...' : '🔌 Testar ligação'}
              </button>
              {stored.hasToken && (
                <button type="button" onClick={handleRemove}
                  className="py-2 px-4 bg-red-700 hover:bg-red-800 text-white rounded-lg">
                  🗑️ Remover
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
