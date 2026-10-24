// ========================================
// frontend/src/components/PhotoModal.jsx
// ========================================
import { useEffect, useRef } from 'react'
import { webSrc, originalSrc } from '../api'

export default function PhotoModal({ photo, photos = [], onNavigate, onClose, onEdit, onDelete, onOpenFullscreen, authenticated }) {
  // Paulo: também dá para andar para a esquerda e para a direita no detalhe da foto
  // (setas no ecrã, teclas ← → e deslizar o dedo no telemóvel), tal como no ecrã completo.
  const currentIndex = photos.findIndex(p => p.id === photo.id)
  const prev = currentIndex > 0 ? photos[currentIndex - 1] : null
  const next = currentIndex >= 0 && currentIndex < photos.length - 1 ? photos[currentIndex + 1] : null
  const touchX = useRef(null)

  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && prev && onNavigate) onNavigate(prev)
      else if (e.key === 'ArrowRight' && next && onNavigate) onNavigate(next)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prev, next, onNavigate, onClose])

  const onTouchStart = (e) => { touchX.current = e.touches[0].clientX }
  const onTouchEnd = (e) => {
    if (touchX.current == null || !onNavigate) return
    const dx = e.changedTouches[0].clientX - touchX.current
    touchX.current = null
    if (dx > 50 && prev) onNavigate(prev)
    else if (dx < -50 && next) onNavigate(next)
  }

  const arrowClass = "absolute top-1/2 -translate-y-1/2 p-2 sm:p-3 rounded-full bg-black bg-opacity-40 hover:bg-opacity-70 text-white z-10 transition-all hover:scale-110 flex items-center justify-center"

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-95 z-50 flex items-start justify-center page-x py-2 sm:py-4 overflow-y-auto overscroll-contain"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-7xl 3xl:max-w-[1800px] mx-auto my-2 sm:my-4 short:my-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Paulo: imagem por cima da informação no telemóvel; lado a lado a partir de 1024px
            e também no telemóvel deitado (short:), onde não há altura para as duas coisas empilhadas */}
        <div className="grid grid-cols-1 lg:grid-cols-3 short:grid-cols-3 gap-4 sm:gap-6 short:gap-3 min-h-0">
          
          {/* Imagem */}
          <div className="lg:col-span-2 short:col-span-2 flex items-center justify-center min-h-0 min-w-0 relative" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            {prev && onNavigate && (
              <button type="button" onClick={() => onNavigate(prev)} className={`${arrowClass} left-2`} title="Anterior">
                <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
            )}
            {next && onNavigate && (
              <button type="button" onClick={() => onNavigate(next)} className={`${arrowClass} right-2`} title="Próxima">
                <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            )}
            <img
              src={webSrc(photo)}
              alt={photo.title}
              className="max-h-vd-70 sm:max-h-vd-80 short:max-h-vd-90 w-auto max-w-full h-auto object-contain cursor-zoom-in"
              onClick={() => onOpenFullscreen(photo)}
              title="Clique para ver em fullscreen"
            />
          </div>

          {/* Painel de Informações — SCROLL FUNCIONAL EM MOBILE */}
          {/* Paulo: no telemóvel o painel cresce e a página faz scroll (antes havia um scroll dentro de outro);
              só tem altura máxima quando está ao lado da imagem */}
          <div className="bg-gray-800 rounded-lg p-4 sm:p-6 short:p-3 flex flex-col min-h-0 min-w-0 lg:max-h-vd-85 lg:overflow-y-auto short:max-h-vd-90 short:overflow-y-auto">
            
            <h2 className="text-xl font-bold text-white mb-3 break-words">{photo.title}</h2>

            {photo.description && (
              <p className="text-gray-300 mb-4 break-words">{photo.description}</p>
            )}

            {(photo.location || photo.date) && (
              <div className="space-y-2 mb-4 pb-4 border-b border-gray-700">
                {photo.location && (
                  <div className="flex items-center text-gray-300">
                    <svg className="w-5 h-5 mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="min-w-0 break-words">{photo.location}</span>
                  </div>
                )}
                {photo.date && (
                  <div className="flex items-center text-gray-300">
                    <svg className="w-5 h-5 mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>{new Date(photo.date).toLocaleDateString('pt-PT')} {photo.time && `às ${photo.time}`}</span>
                  </div>
                )}
              </div>
            )}

            {/* Dados Técnicos Básicos */}
            {(photo.aperture || photo.iso || photo.shutterSpeed || photo.focalLength) && (
              <div className="mb-4 pb-4 border-b border-gray-700">
                <h3 className="text-white font-semibold mb-3 flex items-center">
                  <svg className="w-5 h-5 mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Dados Técnicos
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {photo.aperture && <div><span className="text-gray-400">Abertura:</span> <p className="text-white break-words">f/{photo.aperture}</p></div>}
                  {photo.iso && <div><span className="text-gray-400">ISO:</span> <p className="text-white break-words">{photo.iso}</p></div>}
                  {photo.shutterSpeed && <div><span className="text-gray-400">Velocidade:</span> <p className="text-white break-words">{photo.shutterSpeed}</p></div>}
                  {photo.focalLength && <div><span className="text-gray-400">Focal:</span> <p className="text-white break-words">{photo.focalLength}mm</p></div>}
                </div>
              </div>
            )}

            {/* GPS */}
            {(photo.gpsLatitude || photo.gpsLongitude) && (
              <div className="mb-4 pb-4 border-b border-gray-700">
                <h3 className="text-white font-semibold mb-3">Localização GPS</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {photo.gpsLatitude && <div><span className="text-gray-400">Latitude:</span> <p className="text-white font-mono text-xs break-all">{photo.gpsLatitude}</p></div>}
                  {photo.gpsLongitude && <div><span className="text-gray-400">Longitude:</span> <p className="text-white font-mono text-xs break-all">{photo.gpsLongitude}</p></div>}
                </div>
              </div>
            )}

            {/* Equipamento */}
            {(photo.camera || photo.lens) && (
              <div className="mb-4 pb-4 border-b border-gray-700">
                <h3 className="text-white font-semibold mb-3 flex items-center">
                  <svg className="w-5 h-5 mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  </svg>
                  Equipamento
                </h3>
                {photo.camera && <p className="text-gray-300 text-sm mb-2"><span className="text-gray-400">Câmara:</span> {photo.camera}</p>}
                {photo.lens && <p className="text-gray-300 text-sm"><span className="text-gray-400">Lente:</span> {photo.lens}</p>}
              </div>
            )}

            {/* Copyright */}
            {photo.copyright && (
              <div className="mb-4 pb-4 border-b border-gray-700">
                <h3 className="text-white font-semibold mb-2">© Copyright</h3>
                <p className="text-gray-300 text-sm break-words">{photo.copyright}</p>
              </div>
            )}


            {/* Botão Voltar — AGORA NO TOPO (entre a foto e o texto) */}
            <button
              onClick={onClose}
              className="w-full mb-4 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg flex items-center justify-center"
              title="Voltar à Galeria"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span className="ml-2">Voltar à Galeria</span>
            </button>

            

            {/* Paulo: o detalhe mostra a versão web (~1600px); o original completo vem do Drive só se o pedirem */}
            <div className="flex flex-wrap gap-2 mb-4">
              {/* Paulo: "Ver original" abre o teu ecrã completo, centrado como antes, em vez de uma aba nova */}
              <button
                type="button"
                onClick={() => onOpenFullscreen(photo)}
                className="flex-auto px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg text-center"
                title="Ver o original em resolução completa"
              >
                🔍 Ver original{photo.width && photo.height ? ` (${photo.width}×${photo.height})` : ''}
              </button>
              <a
                href={originalSrc(photo, true)}
                download
                className="flex-auto px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg text-center inline-flex items-center justify-center"
                title="Descarregar o original"
              >
                ⬇️ Descarregar{photo.originalSize ? ` (${(photo.originalSize / 1024 / 1024).toFixed(1)} MB)` : ''}
              </a>
            </div>



            {/* Botões de ação (Editar / Eliminar) — sempre na parte inferior */}
            {authenticated && (
              <div className="flex gap-2 pt-3 mt-auto">
                <button
                  onClick={onEdit}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg flex items-center justify-center"
                  title="Editar"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span className="ml-2 hidden sm:inline">Editar</span>
                </button>
                <button
                  onClick={onDelete}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg flex items-center justify-center"
                  title="Eliminar"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span className="ml-2 hidden sm:inline">Eliminar</span>
                </button>
              </div>
            )}  
          </div>
        </div>
      </div>
    </div>
  );
}