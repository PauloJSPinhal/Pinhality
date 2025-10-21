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
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6 mx-auto max-w-[1920px]">
      {photoList.map(photo => {
        const imageUrl = `${photo.imageUrl}?t=${photo.timestamp || Date.now()}`
        
        return (
          <div
            key={photo.id}
            onClick={() => onPhotoClick(photo)}
            className="group cursor-pointer bg-gray-800 rounded-lg overflow-hidden shadow-lg hover:shadow-2xl transition-all transform hover:scale-105"
          >
            <div className="aspect-w-16 aspect-h-12 bg-gray-700 relative overflow-hidden">
              <img
                src={imageUrl}
                alt={photo.title}
                className="w-full h-48 object-cover group-hover:scale-110 transition-transform duration-300"
              />
            </div>
            <div className="p-4">
              <h3 className="text-white font-semibold text-lg mb-2">{photo.title}</h3>
              {photo.location && (
                <div className="flex items-center text-gray-400 text-sm space-x-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>{photo.location}</span>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}