// ========================================
// frontend/src/components/PhotoFullscreen.jsx
// ========================================
import { useEffect, useRef } from 'react';

export default function PhotoFullscreen({ 
  photo, 
  photos = [], 
  onClose, 
  onToggleFavorite, 
  onNavigate, 
  onBackToModal 
}) {
  const containerRef = useRef(null);

  // Função para entrar em fullscreen (nativo)
  const enterFullscreen = async () => {
    if (!containerRef.current) return;

    try {
      if (containerRef.current.requestFullscreen) {
        await containerRef.current.requestFullscreen();
      } else if (containerRef.current.webkitRequestFullscreen) {
        // Safari/iOS fallback
        containerRef.current.webkitRequestFullscreen();
      } else {
        // Fallback: modo "pseudo-fullscreen" com scroll-to-top
        document.body.classList.add('fullscreen-fallback');
        document.documentElement.style.height = '100%';
        document.body.style.height = '100%';
        window.scrollTo(0, 1);
        // Forçar layout
        setTimeout(() => window.scrollTo(0, 1), 100);
      }
    } catch (err) {
      console.warn('Fullscreen não disponível:', err);
      // Usa fallback mesmo assim
      document.body.classList.add('fullscreen-fallback');
      window.scrollTo(0, 1);
    }
  };

  // Sair do fullscreen ao desmontar
  const exitFullscreen = async () => {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      try {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
      } catch (err) {
        console.warn('Erro ao sair do fullscreen:', err);
      }
    }
    document.body.classList.remove('fullscreen-fallback');
    document.documentElement.style.height = '';
    document.body.style.height = '';
  };

  // Teclas de atalho
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      const idx = photos.findIndex(p => p.id === photo.id);
      if (e.key === 'ArrowLeft' && idx > 0) {
        onNavigate(photos[idx - 1]);
      } else if (e.key === 'ArrowRight' && idx < photos.length - 1) {
        onNavigate(photos[idx + 1]);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [photo, photos, onNavigate, onClose]);

  // Entrar em fullscreen ao montar
  useEffect(() => {
    enterFullscreen();
    return () => {
      exitFullscreen();
    };
  }, []);

  const currentIndex = photos.findIndex(p => p.id === photo.id);
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < photos.length - 1;

  const handleFavoriteToggle = () => {
    if (onToggleFavorite) onToggleFavorite(photo.id);
  };

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 bg-black z-50 flex items-center justify-center touch-pan-x touch-pinch-zoom"
      onClick={onClose}
    >
      <img
        src={`/${photo.imageUrl}`}
        alt={photo.title}
        className="max-h-screen max-w-screen object-contain"
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />

      {/* Botões de ação (superior direito) */}
      <div 
        className="absolute top-6 right-6 flex gap-3 z-50"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleFavoriteToggle}
          className="p-3 rounded-full bg-black bg-opacity-40 hover:bg-opacity-70 text-white transition-all hover:scale-110"
          title={photo.isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
        >
          {photo.isFavorite ? (
            <svg className="w-7 h-7 text-red-500 fill-current" viewBox="0 0 24 24">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          ) : (
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          )}
        </button>

        <button
          onClick={onBackToModal}
          className="p-3 rounded-full bg-black bg-opacity-40 hover:bg-opacity-70 text-white transition-all hover:scale-110"
          title="Ver informações"
        >
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      </div>

      {/* Navegação */}
      {hasPrevious && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(photos[currentIndex - 1]);
          }}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-4 rounded-full bg-black bg-opacity-40 hover:bg-opacity-70 text-white z-50 transition-all hover:scale-110"
          title="Anterior"
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}
      {hasNext && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(photos[currentIndex + 1]);
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-4 rounded-full bg-black bg-opacity-40 hover:bg-opacity-70 text-white z-50 transition-all hover:scale-110"
          title="Próxima"
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* Título + contador */}
      <div 
        className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex flex-col items-center z-50"
        onClick={(e) => e.stopPropagation()}
      >
        {photos.length > 1 && (
          <div className="mb-2 bg-black bg-opacity-50 text-white px-4 py-1.5 rounded-full text-sm font-medium">
            {currentIndex + 1} / {photos.length}
          </div>
        )}
        <div className="bg-black bg-opacity-60 text-white px-4 py-2 rounded-lg max-w-md text-center">
          <h3 className="font-semibold">{photo.title}</h3>
          {photo.location && (
            <p className="text-sm text-gray-300 mt-1">{photo.location}</p>
          )}
        </div>
      </div>
    </div>
  );
}