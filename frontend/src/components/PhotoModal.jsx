// ========================================
// frontend/src/components/PhotoModal.jsx
// ========================================

export default function PhotoModal({ photo, onClose, onEdit, onDelete, onOpenFullscreen, authenticated }) {
  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-95 z-50 flex items-start justify-center p-2 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-7xl mx-auto my-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 min-h-0">
          
          {/* Imagem */}
          <div className="lg:col-span-2 flex items-center justify-center min-h-0">
            <img
              src={`/${photo.imageUrl}`}
              alt={photo.title}
              className="max-h-[60vh] sm:max-h-[70vh] w-auto object-contain cursor-zoom-in"
              onClick={() => onOpenFullscreen(photo)}
              title="Clique para ver em fullscreen"
            />
          </div>

          {/* Painel de Informações — SCROLL FUNCIONAL EM MOBILE */}
          <div className="bg-gray-800 rounded-lg p-4 sm:p-6 flex flex-col min-h-0 max-h-[70vh] sm:max-h-[80vh] overflow-y-auto">
            
            <h2 className="text-xl font-bold text-white mb-3">{photo.title}</h2>

            {photo.description && (
              <p className="text-gray-300 mb-4">{photo.description}</p>
            )}

            {(photo.location || photo.date) && (
              <div className="space-y-2 mb-4 pb-4 border-b border-gray-700">
                {photo.location && (
                  <div className="flex items-center text-gray-300">
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>{photo.location}</span>
                  </div>
                )}
                {photo.date && (
                  <div className="flex items-center text-gray-300">
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>{new Date(photo.date).toLocaleDateString('pt-PT')} {photo.time && `às ${photo.time}`}</span>
                  </div>
                )}
              </div>
            )}

            {/* Dados Técnicos */}
            {(photo.aperture || photo.iso || photo.shutterSpeed || photo.focalLength) && (
              <div className="mb-4 pb-4 border-b border-gray-700">
                <h3 className="text-white font-semibold mb-3 flex items-center">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Dados Técnicos
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {photo.aperture && <div><span className="text-gray-400">Abertura:</span> <p className="text-white">f/{photo.aperture}</p></div>}
                  {photo.iso && <div><span className="text-gray-400">ISO:</span> <p className="text-white">{photo.iso}</p></div>}
                  {photo.shutterSpeed && <div><span className="text-gray-400">Velocidade:</span> <p className="text-white">{photo.shutterSpeed}</p></div>}
                  {photo.focalLength && <div><span className="text-gray-400">Focal:</span> <p className="text-white">{photo.focalLength}mm</p></div>}
                </div>
              </div>
            )}

            {/* Configurações Avançadas */}
            {(photo.exposureMode || photo.meteringMode || photo.exposureCompensation || photo.whiteBalance || photo.focusMode) && (
              <div className="mb-4 pb-4 border-b border-gray-700">
                <h3 className="text-white font-semibold mb-3">Configurações Avançadas</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {photo.exposureMode && <div><span className="text-gray-400">Modo de Exposição:</span> <p className="text-white">{photo.exposureMode}</p></div>}
                  {photo.meteringMode && <div><span className="text-gray-400">Modo de Medição:</span> <p className="text-white">{photo.meteringMode}</p></div>}
                  {photo.exposureCompensation && <div><span className="text-gray-400">Compensação EV:</span> <p className="text-white">{photo.exposureCompensation}</p></div>}
                  {photo.whiteBalance && <div><span className="text-gray-400">Balanço de Brancos:</span> <p className="text-white">{photo.whiteBalance}</p></div>}
                  {photo.focusMode && <div><span className="text-gray-400">Modo de Focagem:</span> <p className="text-white">{photo.focusMode}</p></div>}
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
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  </svg>
                  Equipamento
                </h3>
                {photo.camera && <p className="text-gray-300 text-sm mb-2"><span className="text-gray-400">Câmara:</span> {photo.camera}</p>}
                {photo.lens && <p className="text-gray-300 text-sm"><span className="text-gray-400">Lente:</span> {photo.lens}</p>}
              </div>
            )}

            {photo.copyright && (
              <div className="mb-4 pb-4 border-b border-gray-700">
                <h3 className="text-white font-semibold mb-2">Copyright</h3>
                <p className="text-gray-300 text-sm">{photo.copyright}</p>
              </div>
            )}

            {/* Empurrar botões para o fundo */}
            <div className="flex-1"></div>

            {/* Botões de ação */}
            {authenticated && (
              <div className="flex gap-2 pt-3">
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
            
            {/* Botão Voltar — SEMPRE visível */}
            <div className="mt-3">
              <button
                onClick={onClose}
                className="w-full px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg flex items-center justify-center"
                title="Voltar à Galeria"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                <span className="ml-2 hidden sm:inline">Voltar</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}