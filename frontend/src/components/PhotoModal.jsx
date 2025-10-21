// ========================================
// frontend/src/components/PhotoModal.jsx - COM FULLSCREEN AUTOMÁTICO
// ========================================
import { useState, useEffect } from 'react'

export default function PhotoModal({ photo, onClose, onEdit, onDelete, authenticated }) {
  const [fullScreen, setFullScreen] = useState(false)
  
  const imageUrl = `${photo.imageUrl}?t=${photo.timestamp || Date.now()}`
  
  const handleClose = () => {
    onClose()
  }
  
  if (fullScreen) {
    return (
      <div
        className="fixed inset-0 bg-black z-50 flex items-center justify-center p-0"
        onClick={() => setFullScreen(false)}
      >
        <div className="relative w-full h-full flex items-center justify-center">
          <img
            src={imageUrl}
            alt={photo.title}
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={(e) => {
              e.stopPropagation()
              setFullScreen(false)
            }}
            className="absolute top-4 right-4 bg-gray-900 hover:bg-gray-700 rounded-full w-16 h-16 flex items-center justify-center shadow-2xl transition-all z-10 border border-gray-600"            title="Fechar"
          >
            <svg className="w-12 h-12 text-white" fill="none" stroke="white" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    )
  }
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="max-w-7xl w-full my-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:items-start">
          {/* IMAGEM */}
          <div className="lg:col-span-2 flex items-center justify-center bg-gray-900 rounded-lg">
            <img
              src={imageUrl}
              alt={photo.title}
              className="max-w-full max-h-[60vh] lg:max-h-[100vh] object-contain rounded-lg shadow-2xl cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => setFullScreen(true)}
              title="Clique para ver em ecrã inteiro"
            />
          </div>
          
          {/* INFORMAÇÕES */}
          <div className="bg-gray-800 rounded-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">{photo.title}</h2>
              {/* Categorias (múltiplas) */}
              {photo.categories && Array.isArray(photo.categories) && photo.categories.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {photo.categories.map(cat => (
                    <span key={cat} className="px-3 py-1 bg-blue-600 text-white text-sm rounded-full">
                      {cat}
                    </span>
                  ))}
                </div>
              )}
            </div>
            
            {photo.description && (
              <div>
                <p className="text-gray-300">{photo.description}</p>
              </div>
            )}
            
            {/* LOCALIZAÇÃO E DATA */}
            <div className="border-t border-gray-700 pt-4 space-y-2">
              {/* Linha 1: Local (ocupa toda a largura) */}
              {photo.location && (
                <div>
                  <div className="text-gray-400 text-xs mb-1">Local</div>
                  <div className="text-white font-medium text-sm flex items-center">
                    <svg className="w-4 h-4 mr-1.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    </svg>
                    {photo.location}
                  </div>
                </div>
              )}
              {/* Linha 2: Data + Hora */}
              {(photo.date || photo.time) && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-gray-400 text-xs mb-1">Data</div>
                    <div className="text-white font-medium text-sm">
                      {photo.date ? new Date(photo.date).toLocaleDateString('pt-PT') : '-'}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs mb-1">Hora</div>
                    <div className="text-white font-medium text-sm">{photo.time || '-'}</div>
                  </div>
                </div>
              )}
            </div>
            
            {/* ✨ DADOS TÉCNICOS BÁSICOS */}
            {(photo.aperture || photo.iso || photo.shutterSpeed || photo.focalLength) && (
              <div className="border-t border-gray-700 pt-4">
                <h3 className="text-white font-semibold mb-3 flex items-center">
                  <svg className="w-5 h-5 mr-2 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Dados Técnicos
                </h3>
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <div className="text-gray-400 text-xs mb-1">Abertura</div>
                    <div className="text-white font-medium text-sm">{photo.aperture ? `ƒ/${photo.aperture}` : '-'}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs mb-1">ISO</div>
                    <div className="text-white font-medium text-sm">{photo.iso || '-'}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs mb-1">Velocidade</div>
                    <div className="text-white font-medium text-sm">{photo.shutterSpeed ? `${photo.shutterSpeed}s` : '-'}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs mb-1">Focal</div>
                    <div className="text-white font-medium text-sm">{photo.focalLength ? `${photo.focalLength} mm` : '-'}</div>
                  </div>
                </div>
              </div>
            )}
            
            {/* ✨ CONFIGURAÇÕES AVANÇADAS */}
            {(photo.exposureMode || photo.meteringMode || photo.exposureCompensation || 
              photo.whiteBalance || photo.focusMode || photo.gpsLatitude || photo.gpsLongitude) && (
              <div className="border-t border-gray-700 pt-4">
                <h3 className="text-white font-semibold mb-3 flex items-center">
                  <svg className="w-5 h-5 mr-2 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                  Configurações
                </h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  {/* Linha 1 */}
                  <div>
                    <div className="text-gray-400 text-xs mb-1">Modo de Exposição</div>
                    <div className="text-white font-medium text-sm">{photo.exposureMode || '-'}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs mb-1">Modo de Medição</div>
                    <div className="text-white font-medium text-sm">{photo.meteringMode || '-'}</div>
                  </div>
                  
                  {/* Linha 2 */}
                  <div>
                    <div className="text-gray-400 text-xs mb-1">Compensação EV</div>
                    <div className="text-white font-medium text-sm">{photo.exposureCompensation || '-'}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs mb-1">Balanço de Brancos</div>
                    <div className="text-white font-medium text-sm">{photo.whiteBalance || '-'}</div>
                  </div>
                  
                  {/* Linha 3 */}
                  <div>
                    <div className="text-gray-400 text-xs mb-1">Modo de Focagem</div>
                    <div className="text-white font-medium text-sm">{photo.focusMode || '-'}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs mb-1">Coordenadas GPS</div>
                    <div className="text-white font-medium text-xs leading-relaxed">
                      {photo.gpsLatitude || photo.gpsLongitude ? (
                        <>
                          {photo.gpsLatitude && <div>{photo.gpsLatitude}</div>}
                          {photo.gpsLongitude && <div>{photo.gpsLongitude}</div>}
                        </>
                      ) : (
                        <div className="text-sm">-</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* EQUIPAMENTO */}
            {(photo.camera || photo.lens) && (
              <div className="border-t border-gray-700 pt-4">
                <h3 className="text-white font-semibold mb-3 flex items-center">
                  <svg className="w-5 h-5 mr-2 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  </svg>
                  Equipamento
                </h3>
                <div className="space-y-2">
                  {photo.camera && (
                    <div>
                      <div className="text-gray-400 text-xs mb-1">Câmara</div>
                      <div className="text-white">{photo.camera}</div>
                    </div>
                  )}
                  {photo.lens && (
                    <div>
                      <div className="text-gray-400 text-xs mb-1">Lente</div>
                      <div className="text-white">{photo.lens}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* ✨ COPYRIGHT */}
            {photo.copyright && (
              <div className="border-t border-gray-700 pt-4">
                <div className="text-sm">
                  <div className="flex items-center space-x-2 text-yellow-400 font-semibold mb-1">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span>Copyright</span>
                  </div>
                  <div className="text-gray-300">{photo.copyright}</div>
                </div>
              </div>
            )}

            {/* BOTÕES DE AÇÃO */}
              {authenticated && (
                <div className="pt-4 border-t border-gray-700">
                  <div className="flex gap-2">
                    <button
                      onClick={onDelete}
                      className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center justify-center space-x-2"
                      title="Eliminar Foto"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      <span className="hidden sm:inline">Eliminar</span>
                    </button>
                    <button
                      onClick={onEdit}
                      className="flex-1 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors flex items-center justify-center space-x-2"
                      title="Editar Foto"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      <span className="hidden sm:inline">Editar</span>
                    </button>
                  </div>
                </div>
              )}

              {/* BOTÕES DE NAVEGAÇÃO */}
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleClose}
                  className="w-full mt-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center justify-center space-x-2"
                  title="Voltar à Galeria"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  <span className="hidden sm:inline">Voltar</span>
                </button>
              </div>
          </div>
        </div>
      </div>
    </div>
  )
}