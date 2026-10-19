// Paulo: o Tailwind passou a ser compilado no build (antes vinha de cdn.tailwindcss.com em cada visita).
// Assim o site não depende de servidores de terceiros, os visitantes não são contactados por eles,
// e a Content-Security-Policy pode proibir scripts de fora. O CSS final só inclui as classes usadas.
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: { extend: {} },
  plugins: []
}
