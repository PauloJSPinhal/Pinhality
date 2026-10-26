export default function HelpModal({ onClose }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-3 sm:p-4"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-gray-700 bg-gray-800 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-gray-700 px-4 py-4 sm:px-6">
          <h2 id="help-title" className="flex items-center gap-2 text-xl font-bold text-white sm:text-2xl">
            <svg className="h-6 w-6 shrink-0 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" strokeWidth="2" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.6 9a2.4 2.4 0 1 1 4.1 1.7c-.9.8-1.7 1.1-1.7 2.3M12 16.5h.01" />
            </svg>
            Ajuda
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Fechar ajuda"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto p-4 sm:p-6">
          <section>
            <h3 className="mb-3 text-lg font-semibold text-white">Como utilizar o Pinhality</h3>
            <ul className="space-y-3 text-sm leading-relaxed text-gray-300">
              <li><strong className="text-white">Explorar fotografias:</strong> percorra a grelha e selecione uma foto para ver os detalhes.</li>
              <li><strong className="text-white">Pesquisar:</strong> escreva no campo de pesquisa para encontrar fotos pelo título, descrição, local ou categoria.</li>
              <li><strong className="text-white">Filtrar:</strong> combine coleção, categoria, ano e mês para restringir as fotografias apresentadas.</li>
              <li><strong className="text-white">Ordenar:</strong> escolha a ordenação por data, nome ou categoria e alterne entre ordem ascendente e descendente.</li>
              <li><strong className="text-white">Ver uma fotografia:</strong> na janela de detalhes pode consultar a descrição e os dados disponíveis. Selecione a imagem para a abrir em ecrã inteiro.</li>
              <li><strong className="text-white">Percorrer fotos:</strong> use as setas na janela de detalhes; em dispositivos móveis também pode deslizar a imagem para o lado.</li>
              <li><strong className="text-white">Informações da coleção:</strong> selecione o nome da coleção apresentado por baixo de “Pinhality” para consultar a descrição, o número de fotos e as categorias mais frequentes.</li>
            </ul>
          </section>

          <section className="border-t border-gray-700 pt-5">
            <h3 className="mb-3 text-lg font-semibold text-white">Sobre o desenvolvimento</h3>
            <dl className="grid gap-3 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
              <dt className="font-medium text-gray-400">Projeto</dt>
              <dd className="text-gray-200">Paulo Pinhal</dd>
              <dt className="font-medium text-gray-400">Correção do código e publicação</dt>
              <dd className="text-gray-200">Júlio Papel, com a sua IA LAISS, fez a correção integral do código e a publicação do site.</dd>
              <dt className="font-medium text-gray-400">Objetivo</dt>
              <dd className="text-gray-200">Portefólio fotográfico para organizar e explorar fotografias por coleções e categorias.</dd>
              <dt className="font-medium text-gray-400">Tecnologias</dt>
              <dd className="text-gray-200">React e Vite (interface), Node.js e Express (servidor), Docker (execução).</dd>
              <dt className="font-medium text-gray-400">Fotografias</dt>
              <dd className="text-gray-200">Sincronização com Google Drive.</dd>
            </dl>
          </section>
        </div>
      </section>
    </div>
  )
}
