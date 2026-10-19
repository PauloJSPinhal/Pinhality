// Paulo: todos os pedidos de admin passam por aqui. O cookie da sessão vai automaticamente;
// se o servidor responder 401 (sessão expirada), a App volta ao modo público e pede o login.
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

// Paulo: cada parte do caminho é codificada (nomes com espaços, "©", "#" ou "?" deixam de partir as imagens)
// e o caminho começa sempre por "/", por isso um imageUrl estranho nunca vira um link para outro site.
// Caminhos de imagem ("photos/<coleção>/<ficheiro>") -> URL com cada parte codificada
export function mediaUrl(relPath, version) {
  if (!relPath) return ''
  const url = '/' + String(relPath).replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')
  return version ? `${url}?v=${encodeURIComponent(version)}` : url
}

// Miniatura (~400px) para a grelha, versão web (~1600px) para o detalhe e o ecrã inteiro
export const thumbSrc = (photo) => mediaUrl(photo.thumbUrl || photo.imageUrl, photo.mediaVersion || photo.timestamp)
export const webSrc = (photo) => mediaUrl(photo.webUrl || photo.imageUrl, photo.mediaVersion || photo.timestamp)
export const originalSrc = (photo, download = false) => {
  const url = mediaUrl(photo.originalUrl || photo.imageUrl)
  return download ? `${url}?download=1` : url
}
