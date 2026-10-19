// Paulo: o Tailwind passou a ser compilado no build (antes vinha de cdn.tailwindcss.com em cada visita).
// Assim o site não depende de servidores de terceiros, os visitantes não são contactados por eles,
// e a Content-Security-Policy pode proibir scripts de fora. O CSS final só inclui as classes usadas.
import plugin from 'tailwindcss/plugin'

// Paulo: alturas relativas ao ecrã com "dvh" (altura visível real no telemóvel, que muda quando a barra
// do browser aparece/desaparece) e "vh" antes, para browsers antigos que não conhecem dvh.
// Ex.: max-h-vd-90 → max-height: 90vh; max-height: 90dvh;
const viewportHeights = { 50: '50', 60: '60', 70: '70', 80: '80', 85: '85', 90: '90', 100: '100' }

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  future: {
    // Paulo: os efeitos "hover:" só se aplicam em aparelhos com rato. Num ecrã tátil o hover ficava
    // "preso" depois de um toque (cartões aumentados, botões com a cor errada).
    hoverOnlyWhenSupported: true
  },
  theme: {
    // Paulo: lista completa e por ordem (do mais pequeno para o maior); se só se acrescentassem xs e 3xl,
    // o Tailwind punha-os no fim do CSS e o xs: passava por cima do md:, lg:, etc.
    screens: {
      xs: '480px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
      '3xl': '1920px',
      // Telemóvel deitado (pouca altura): o detalhe da foto passa a ter a imagem ao lado da informação
      short: { raw: '(orientation: landscape) and (max-height: 500px)' }
    },
    extend: {}
  },
  plugins: [
    plugin(({ matchUtilities }) => {
      const make = (prop) => (v) => ({ [prop]: [`${v}vh`, `${v}dvh`] })
      matchUtilities({ 'h-vd': make('height'), 'max-h-vd': make('maxHeight'), 'min-h-vd': make('minHeight') },
        { values: viewportHeights })
    })
  ]
}
