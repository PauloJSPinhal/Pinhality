import { useMemo, useState, useRef } from 'react'
import { thumbSrc } from '../api'

const normalizeName = (value) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLocaleLowerCase('pt-PT')

const normalizeFileName = (value) => value.normalize('NFC')

const photoFileName = (photo) => {
  const fileName = String(photo.imageUrl || '').split('/').pop() || ''
  try {
    return decodeURIComponent(fileName)
  } catch {
    return fileName
  }
}

const sourceFileName = (value) => {
  if (typeof value !== 'string') return ''
  const hasControlCharacter = Array.from(value).some(character => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127
  })
  return value && value === value.trim() && !value.includes('/') && !value.includes('\\') && !hasControlCharacter
    ? value
    : ''
}

const categoriesForPhoto = (photo) => Array.isArray(photo.categories)
  ? photo.categories
  : photo.category ? [photo.category] : []

export default function ImportClassificationsModal({
  isOpen,
  onClose,
  photos = [],
  categories = [],
  onImport
}) {
  const [records, setRecords] = useState([])
  const [fileName, setFileName] = useState('')
  const [fileError, setFileError] = useState('')
  const [importError, setImportError] = useState('')
  const [importSuccess, setImportSuccess] = useState('')
  const [importing, setImporting] = useState(false)
  const recordIdCounterRef = useRef(0)

  const categoryLookup = useMemo(() => {
    const lookup = new Map()
    for (const category of categories) {
      if (typeof category.name === 'string') {
        lookup.set(normalizeName(category.name), category.name)
      }
    }
    return lookup
  }, [categories])

  const photoLookup = useMemo(() => {
    const lookup = new Map()
    for (const photo of photos) {
      const key = normalizeFileName(photoFileName(photo))
      if (!key) continue
      const matches = lookup.get(key) || []
      matches.push(photo)
      lookup.set(key, matches)
    }
    return lookup
  }, [photos])

  const rows = useMemo(() => {
    const filenameCounts = new Map()
    const targetCounts = new Map()
    for (const record of records) {
      const key = normalizeFileName(record.fileName)
      if (key) filenameCounts.set(key, (filenameCounts.get(key) || 0) + 1)
      if (record.photoId) targetCounts.set(String(record.photoId), (targetCounts.get(String(record.photoId)) || 0) + 1)
    }

    return records.map((record, recordIndex) => {
      const errors = []
      const warnings = []
      const nameKey = normalizeFileName(record.fileName)
      const photo = photos.find(item => String(item.id) === String(record.photoId))
      const recordCategories = Array.isArray(record.categories) ? record.categories : []

      // Debug: log de registos problemáticos
      if (recordIndex === 1 || recordIndex === 56 || recordIndex === 70) {
        console.log(`[DEBUG] Registo ${recordIndex}:`, {
          fileName: record.fileName,
          photoId: record.photoId,
          foundPhoto: photo ? photo.title : 'NOT FOUND',
          allPhotosIds: photos.map(p => p.id)
        })
      }

      if (!record.validObject) errors.push('O registo não é um objeto JSON.')
      if (!record.fileName) errors.push('Nome de ficheiro inválido ou em falta.')
      if (!record.titleValid) errors.push('O campo "titulo" tem de ser texto.')
      if (!record.title.trim()) errors.push('O título é obrigatório.')
      if (record.title.length > 300) errors.push('O título excede 300 caracteres.')
      if (!record.descriptionValid) errors.push('O campo "descricao" tem de ser texto.')
      if (record.description.length > 5000) errors.push('A descrição excede 5000 caracteres.')
      if (!Array.isArray(record.categories)) errors.push('As categorias têm de ser uma lista.')
      if (recordCategories.length > 50) errors.push('O registo excede 50 categorias.')
      if (recordCategories.some(category => !category.sourceName)) errors.push('Há uma categoria vazia ou inválida.')
      if (recordCategories.some(category => category.name === '')) errors.push('Há categorias sem correspondência; escolha uma categoria válida ou remova-as.')

      const normalizedCategories = recordCategories.map(category => normalizeName(category.name || category.sourceName))
      if (normalizedCategories.some((category, index) => normalizedCategories.indexOf(category) !== index)) {
        errors.push('O registo contém categorias repetidas.')
      }
      if (nameKey && filenameCounts.get(nameKey) > 1) errors.push('O ficheiro aparece mais do que uma vez no JSON.')
      if (photo && targetCounts.get(String(photo.id)) > 1) errors.push('A mesma fotografia foi escolhida para mais do que um registo.')
      if (!photo && record.fileName && filenameCounts.get(nameKey) === 1) warnings.push('Selecione manualmente a fotografia correspondente.')

      return { ...record, photo, errors, warnings, canImport: !!photo && errors.length === 0 }
    })
  }, [photos, records])

  const selectedRows = rows.filter(row => row.include && row.canImport)

  if (!isOpen) return null

  const readFile = async (event) => {
    const file = event.target.files?.[0]
    setRecords([])
    setImportError('')
    setImportSuccess('')
    setFileError('')
    setFileName(file?.name || '')
    if (!file) return

    try {
      const parsed = JSON.parse(await file.text())
      if (!Array.isArray(parsed)) throw new Error('O conteúdo tem de ser uma lista JSON de classificações.')
      if (parsed.length === 0) throw new Error('O ficheiro não contém classificações.')
      if (parsed.length > 500) throw new Error('O ficheiro excede o limite de 500 classificações por importação.')

      recordIdCounterRef.current = 0
      setRecords(parsed.map((raw, index) => {
        const validObject = raw !== null && typeof raw === 'object' && !Array.isArray(raw)
        const fileName = validObject ? sourceFileName(raw.ficheiro) : ''
        const sourceCategories = validObject ? raw.categorias : null
        const categoriesAreList = Array.isArray(sourceCategories)
        const matches = fileName ? photoLookup.get(normalizeFileName(fileName)) || [] : []
        return {
          id: `import-${recordIdCounterRef.current++}`,
          validObject,
          fileName,
          title: validObject && typeof raw.titulo === 'string' ? raw.titulo : '',
          titleValid: validObject && typeof raw.titulo === 'string',
          description: validObject && typeof raw.descricao === 'string' ? raw.descricao : '',
          descriptionValid: validObject && typeof raw.descricao === 'string',
          categories: categoriesAreList
            ? sourceCategories.map(sourceName => {
              const categoryName = typeof sourceName === 'string' ? sourceName.trim() : ''
              return {
                sourceName: categoryName,
                name: categoryLookup.get(normalizeName(categoryName)) || ''
              }
            })
            : null,
          photoId: matches.length === 1 ? String(matches[0].id) : '',
          include: true
        }
      }))
    } catch (error) {
      setFileError(error instanceof SyntaxError
        ? 'Não foi possível ler o ficheiro: confirme que contém JSON válido.'
        : error.message || 'Não foi possível ler o ficheiro.')
    }
  }

  const updateRecord = (id, changes) => {
    setRecords(current => current.map(record => record.id === id ? { ...record, ...changes } : record))
  }

  const updateCategory = (record, index, name) => {
    updateRecord(record.id, {
      categories: record.categories.map((category, categoryIndex) =>
        categoryIndex === index ? { ...category, name } : category
      )
    })
  }

  const removeCategory = (record, index) => {
    updateRecord(record.id, {
      categories: record.categories.filter((_, categoryIndex) => categoryIndex !== index)
    })
  }

  const close = () => {
    if (importing) return
    setRecords([])
    setFileName('')
    setFileError('')
    setImportError('')
    setImportSuccess('')
    onClose()
  }

  const confirmImport = async () => {
    if (!selectedRows.length) return
    const items = selectedRows.map(row => ({
      photoId: row.photo.id,
      title: row.title.trim(),
      description: row.description.trim(),
      categories: row.categories.map(category => category.name)
    }))
    if (new Blob([JSON.stringify({ items })]).size > 900000) {
      setImportError('Os registos selecionados excedem o tamanho máximo seguro. Desmarque alguns e importe em lotes menores.')
      return
    }

    setImporting(true)
    setImportError('')
    try {
      const importedCount = await onImport(items)
      setRecords([])
      setFileName('')
      setFileError('')
      setImportSuccess(`${importedCount} classificação(ões) importada(s) com sucesso.`)
    } catch (error) {
      setImportError(error.message || 'A importação falhou; nenhuma alteração foi aplicada.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-2 sm:p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-classifications-title"
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-gray-800 shadow-xl"
      >
        <header className="flex items-center justify-between border-b border-gray-700 p-4">
          <div>
            <h2 id="import-classifications-title" className="text-xl font-bold text-white">Importar classificações</h2>
            <p className="mt-1 text-sm text-gray-400">Reveja e valide os dados antes de os aplicar às fotografias.</p>
          </div>
          <button type="button" onClick={close} disabled={importing} className="rounded p-2 text-gray-400 hover:bg-gray-700 hover:text-white" aria-label="Fechar">✕</button>
        </header>

        <div className="space-y-4 overflow-y-auto p-4">
          <div className="rounded-lg border border-yellow-700/60 bg-yellow-900/20 p-3 text-sm text-yellow-100">
            A importação substitui o título, a descrição e todas as categorias da fotografia selecionada. Nada é gravado até confirmar.
          </div>

          <label className="block text-sm font-medium text-gray-200">
            Ficheiro JSON
            <input
              type="file"
              accept=".json,application/json"
              onChange={readFile}
              disabled={importing}
              className="mt-2 block w-full rounded border border-gray-600 bg-gray-900 p-2 text-sm text-gray-200 file:mr-3 file:rounded file:border-0 file:bg-gray-700 file:px-3 file:py-2 file:text-white"
            />
          </label>
          {fileName && <p className="text-sm text-gray-400">Ficheiro: {fileName}</p>}
          {fileError && <p role="alert" className="rounded bg-red-900/40 p-3 text-sm text-red-200">{fileError}</p>}
          {importSuccess && <p role="status" className="rounded bg-green-900/40 p-3 text-sm text-green-200">{importSuccess}</p>}

          {rows.length > 0 && (
            <>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-300" aria-live="polite">
                <span>{rows.length} registo(s)</span>
                <span className="text-green-300">{rows.filter(row => row.canImport).length} válido(s)</span>
                <span className="text-red-300">{rows.filter(row => row.errors.length > 0).length} com erros</span>
                <span>{selectedRows.length} selecionado(s) para importar</span>
              </div>

              <div className="space-y-3">
                {rows.map((row, index) => (
                  <article key={row.id} className={`rounded-lg border p-3 ${row.errors.length ? 'border-red-800 bg-red-950/20' : 'border-gray-700 bg-gray-900/50'}`}>
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={row.include && row.canImport}
                        disabled={!row.canImport || importing}
                        onChange={event => updateRecord(row.id, { include: event.target.checked })}
                        aria-label={`Importar registo ${index + 1}`}
                        className="mt-1 h-4 w-4 accent-blue-500"
                      />
                      <div className="min-w-0 flex-1 space-y-3">
                        <div>
                          <p className="break-all text-sm font-semibold text-white">
                            {index + 1}. {row.fileName || 'Sem nome de ficheiro'}
                          </p>
                          <label className="mt-2 block text-xs text-gray-400">
                            Fotografia de destino
                            <select
                              value={row.photoId}
                              disabled={importing}
                              onChange={event => updateRecord(row.id, { photoId: event.target.value })}
                              className="mt-1 block w-full rounded border border-gray-600 bg-gray-800 p-2 text-sm text-white"
                            >
                              <option value="">— Escolha a fotografia —</option>
                              {photos.map(photo => (
                                <option key={photo.id} value={String(photo.id)}>
                                  {(photo.title || 'Sem título') + ' — ' + (photoFileName(photo) || 'sem ficheiro')}
                                </option>
                              ))}
                            </select>
                          </label>
                          {row.photo && (
                            <div className="mt-2 flex items-center gap-3 rounded bg-gray-800 p-2">
                              <img src={thumbSrc(row.photo)} alt="" loading="lazy" className="h-16 w-20 rounded object-cover" />
                              <span className="text-xs text-gray-300">Confirme visualmente que esta é a fotografia pretendida.</span>
                            </div>
                          )}
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="text-xs text-gray-400">
                            Título a importar
                            <input
                              value={row.title}
                              maxLength={300}
                              disabled={importing}
                              onChange={event => updateRecord(row.id, { title: event.target.value })}
                              className="mt-1 block w-full rounded border border-gray-600 bg-gray-800 p-2 text-sm text-white"
                            />
                            {row.photo && <span className="mt-1 block">Atual: {row.photo.title || '—'}</span>}
                          </label>
                          <label className="text-xs text-gray-400">
                            Descrição a importar
                            <textarea
                              value={row.description}
                              maxLength={6000}
                              rows={3}
                              disabled={importing}
                              onChange={event => updateRecord(row.id, { description: event.target.value })}
                              className="mt-1 block w-full rounded border border-gray-600 bg-gray-800 p-2 text-sm text-white"
                            />
                            {row.photo && <span className="mt-1 block">Descrição atual: {row.photo.description || '—'}</span>}
                          </label>
                        </div>

                        <div>
                          <p className="mb-2 text-xs text-gray-400">
                            Categorias a importar
                            {row.photo && <span className="ml-2">| atuais: {categoriesForPhoto(row.photo).join(', ') || 'nenhuma'}</span>}
                          </p>
                          {Array.isArray(row.categories) ? row.categories.length ? (
                            <div className="space-y-2">
                              {row.categories.map((category, categoryIndex) => (
                                <div key={`${categoryIndex}-${category.sourceName}`} className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm text-gray-200">{category.sourceName || 'Categoria vazia'}</span>
                                  <span className="text-gray-500">→</span>
                                  <select
                                    value={category.name}
                                    disabled={importing}
                                    onChange={event => updateCategory(row, categoryIndex, event.target.value)}
                                    className="min-w-40 rounded border border-gray-600 bg-gray-800 p-1.5 text-sm text-white"
                                  >
                                    <option value="">— escolher categoria —</option>
                                    {categories.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
                                  </select>
                                  <button type="button" disabled={importing} onClick={() => removeCategory(row, categoryIndex)} className="text-xs text-gray-400 hover:text-red-300">Remover</button>
                                </div>
                              ))}
                            </div>
                          ) : <p className="text-sm text-gray-300">Sem categorias (serão removidas as atuais).</p> : (
                            <p className="text-sm text-red-300">Formato de categorias inválido.</p>
                          )}
                        </div>

                        {(row.errors.length > 0 || row.warnings.length > 0) && (
                          <ul className="space-y-1 text-sm">
                            {row.errors.map(error => <li key={error} className="text-red-300">Erro: {error}</li>)}
                            {row.warnings.map(warning => <li key={warning} className="text-yellow-200">Atenção: {warning}</li>)}
                          </ul>
                        )}
                        {row.canImport && <p className="text-xs text-green-300">Pronto para importar</p>}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}

          {importError && <p role="alert" className="rounded bg-red-900/40 p-3 text-sm text-red-200">{importError}</p>}
        </div>

        <footer className="flex flex-wrap justify-end gap-2 border-t border-gray-700 p-4">
          {importSuccess ? (
            <button type="button" onClick={close} className="rounded bg-gray-700 px-4 py-2 text-white hover:bg-gray-600">Fechar</button>
          ) : (
            <>
              <button type="button" onClick={close} disabled={importing} className="rounded bg-gray-700 px-4 py-2 text-white hover:bg-gray-600">Cancelar</button>
              <button
                type="button"
                onClick={confirmImport}
                disabled={importing || selectedRows.length === 0}
                className="rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {importing ? 'A importar…' : `Importar ${selectedRows.length} classificação(ões)`}
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  )
}
