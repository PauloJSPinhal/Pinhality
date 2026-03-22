// ========================================
// frontend/src/components/PhotoGrid.jsx
// ========================================
export default function PhotoGrid({ photos, onPhotoClick }) {
  const photoList = Array.isArray(photos) ? photos : []

  if (photoList.length === 0) {
    return (
      <div className="text-center py-20">
        <svg className="w-20 h-20 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
        </svg>
        <p className="text-gray-400 text-lg">Nenhuma foto encontrada.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 mx-auto max-w-[1920px]">
      {photoList.map(photo => {
        const imageUrl = `${photo.imageUrl}?t=${photo.timestamp || Date.now()}`

        return (
          <div
            key={photo.id}
            onClick={() => onPhotoClick(photo)}
            className="group cursor-pointer bg-gray-800 rounded-lg overflow-hidden shadow-lg hover:shadow-2xl transition-all transform hover:scale-[1.02]"
          >
            <div className="relative overflow-hidden">
              <img
                src={imageUrl}
                alt={photo.title}
                className="w-full h-56 object-cover group-hover:scale-105 transition-transform duration-300"
              />
              {/* Título SOBRE a imagem REMOVIDO */}
            </div>
            <div className="p-4">
              <h3 className="text-white font-semibold text-base mb-2 truncate">{photo.title}</h3>
              {photo.categories && photo.categories.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {photo.categories.slice(0, 3).map(cat => (
                    <span key={cat} className="px-2 py-1 bg-blue-600 text-white text-xs rounded-full whitespace-nowrap">
                      {cat}
                    </span>
                  ))}
                  {photo.categories.length > 3 && (
                    <span className="px-2 py-1 bg-gray-600 text-white text-xs rounded-full">
                      +{photo.categories.length - 3}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}