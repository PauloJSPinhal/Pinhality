// ========================================
// frontend/src/components/PhotoFullscreen.jsx
// ========================================
import { useEffect, useRef, useState } from 'react';
import { webSrc, originalSrc } from '../api';

export default function PhotoFullscreen({ 
  photo, 
  photos = [], 
  onClose, 
  onToggleFavorite, 
  onNavigate, 
  onBackToModal 
}) {
  // Paulo: mostra logo a versão web (rápida) e troca pelo original do Drive assim que este chega,
  // sempre centrado no ecrã completo como tinhas.
  const [fullSrc, setFullSrc] = useState(webSrc(photo));
  useEffect(() => {
    setFullSrc(webSrc(photo));
    const original = originalSrc(photo);
    const img = new Image();
    img.onload = () => setFullSrc(original);
    img.src = original;
    return () => { img.onload = null; };
  }, [photo]);

  const containerRef = useRef(null);

  const enterFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (containerRef.current.requestFullscreen) {
        await containerRef.current.requestFullscreen();
      } else if (containerRef.current.webkitRequestFullscreen) {
        containerRef.current.webkitRequestFullscreen();
      }
    } catch (err) {
      console.warn('Fullscreen não disponível:', err);
    }
  };

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
  };

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

  useEffect(() => {
    enterFullscreen();
    return () => {
      exitFullscreen();
    };
  }, []);

  const currentIndex = photos.findIndex(p => p.id === photo.id);
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < photos.length - 1;

  // Paulo: no telemóvel, deslizar o dedo para a esquerda/direita muda de foto
  const touchX = useRef(null);
  const onTouchStart = (e) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (dx > 50 && hasPrevious) onNavigate(photos[currentIndex - 1]);
    else if (dx < -50 && hasNext) onNavigate(photos[currentIndex + 1]);
  };

  const handleFavoriteToggle = () => {
    if (onToggleFavorite) onToggleFavorite(photo.id);
  };

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 bg-black z-50 flex items-center justify-center touch-pan-x touch-pinch-zoom"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <img
        src={fullSrc}
        alt={photo.title}
        // Paulo: "max-w-screen" não existe no Tailwind (a imagem podia sair do ecrã) e 100vh no telemóvel
        // inclui a barra do browser; max-h-vd-100 usa a altura visível real (dvh)
        className="max-h-screen max-h-vd-100 max-w-full w-auto h-auto object-contain select-none"
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />

      {/* Botões de NAVEGAÇÃO (superior esquerdo) */}
      <div 
        // Paulo: safe-top/safe-left afastam os botões do notch e dos cantos arredondados do telemóvel
        className="absolute safe-top safe-left flex gap-2 sm:gap-3 z-50"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Voltar ao painel de informações */}
        <button
          onClick={onBackToModal}
          className="p-2.5 sm:p-3 rounded-full bg-black bg-opacity-40 hover:bg-opacity-70 text-white transition-all hover:scale-110 flex items-center justify-center"
          title="Voltar às informações"
          aria-label="Voltar às informações da fotografia"
        >
          <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" strokeWidth={2} />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11v5m0-8h.01" />
          </svg>
        </button>

        {/* Fechar e voltar à grelha (01) */}
        <button
          onClick={onClose}
          className="p-2.5 sm:p-3 rounded-full bg-black bg-opacity-40 hover:bg-opacity-70 text-white transition-all hover:scale-110 flex items-center justify-center"
          title="Fechar e voltar à galeria"
        >
          <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Botão de FAVORITO (superior direito) */}
      <div 
        className="absolute safe-top safe-right flex gap-2 sm:gap-3 z-50"
        onClick={(e) => e.stopPropagation()}
      >
        <a
          href={originalSrc(photo, true)}
          download
          className="p-2.5 sm:p-3 rounded-full bg-black bg-opacity-40 hover:bg-opacity-70 text-white transition-all hover:scale-110 flex items-center justify-center"
          title="Descarregar o original"
        >
          <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </a>
        <button
          onClick={handleFavoriteToggle}
          className="p-2.5 sm:p-3 rounded-full bg-black bg-opacity-40 hover:bg-opacity-70 text-white transition-all hover:scale-110 flex items-center justify-center"
          title={photo.isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
        >
          {photo.isFavorite ? (
            <svg className="w-6 h-6 sm:w-7 sm:h-7 text-red-500 fill-current" viewBox="0 0 24 24">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          ) : (
            <svg className="w-6 h-6 sm:w-7 sm:h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          )}
        </button>
      </div>

      {/* Navegação entre fotos (setas laterais) */}
      {hasPrevious && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(photos[currentIndex - 1]);
          }}
          className="absolute edge-left top-1/2 -translate-y-1/2 p-2.5 sm:p-4 flex items-center justify-center rounded-full bg-black bg-opacity-40 hover:bg-opacity-70 text-white z-50 transition-all hover:scale-110"
          title="Anterior"
        >
          <svg className="w-7 h-7 sm:w-8 sm:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          className="absolute edge-right top-1/2 -translate-y-1/2 p-2.5 sm:p-4 flex items-center justify-center rounded-full bg-black bg-opacity-40 hover:bg-opacity-70 text-white z-50 transition-all hover:scale-110"
          title="Próxima"
        >
          <svg className="w-7 h-7 sm:w-8 sm:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* Contador discreto (canto inferior direito) */}
      {photos.length > 1 && (
        <div 
          className="absolute safe-bottom safe-right bg-black bg-opacity-50 text-white px-3 py-1.5 rounded-full text-xs font-medium z-50"
          onClick={(e) => e.stopPropagation()}
        >
          {currentIndex + 1} / {photos.length}
        </div>
      )}
    </div>
  );
}