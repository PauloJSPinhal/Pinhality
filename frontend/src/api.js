// Pedidos à API com a sessão de administrador.
// A sessão vai num cookie httpOnly (enviado automaticamente); um 401 avisa a App para pedir novo login.
export const UNAUTHORIZED_EVENT = 'pinhality:unauthorized'

export async function apiFetch(url, options = {}) {
  const res = await fetch(url, { credentials: 'same-origin', ...options })
  if (res.status === 401 && !String(url).startsWith('/api/login')) {
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT))
  }
  return res
}
