import { useEffect, useMemo, useState, useRef } from 'react'
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

const MAX_CATEGORIES = 3
const AUTO_DESCRIPTION = 'Adicionada automaticamente'
const collator = (a, b) => String(a).localeCompare(String(b), 'pt-PT', { sensitivity: 'base' })
const fileStem = (name) => name.replace(/\.[^.]+$/, '')
const sameCategories = (a, b) => {
  const left = [...a].sort(collator)
  const right = [...b].sort(collator)
  return left.length === right.length && left.every((name, index) => name === right[index])
}

function DiffModal({ row, onClose }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-2 sm:p-4" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section role="dialog" aria-modal="true" aria-label="Antes e depois" className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-gray-600 bg-gray-800 shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-gray-700 p-4">
          <h3 className="break-all text-lg font-bold text-white">Antes e depois — {row.fileName}</h3>
          <button type="button" onClick={onClose} className="rounded p-2 text-gray-400 hover:bg-gray-700 hover:text-white" aria-label="Fechar">✕</button>
        </header>
        <div className="space-y-4 overflow-y-auto p-4">
          {row.changes.map(change => (
            <div key={change.key}>
              <p className="mb-1 text-sm font-semibold text-gray-200">{change.label}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded border border-red-900/60 bg-red-950/20 p-2">
                  <p className="text-xs text-red-300">Antes</p>
                  <p className="whitespace-pre-wrap break-words text-sm text-gray-200">{change.before || '—'}</p>
                </div>
                <div className="rounded border border-green-900/60 bg-green-950/20 p-2">
                  <p className="text-xs text-green-300">Depois</p>
                  <p className="whitespace-pre-wrap break-words text-sm text-gray-200">{change.after || '—'}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <footer className="flex justify-end border-t border-gray-700 p-4">
          <button type="button" onClick={onClose} className="rounded bg-gray-700 px-4 py-2 text-white hover:bg-gray-600">Fechar</button>
        </footer>
      </section>
    </div>
  )
}

export default function ImportClassificationsModal({
  isOpen,
  onClose,
  photos = [],
  collectionName = '',
  categories = [],
  groups = [],
  onImport
}) {
  const [records, setRecords] = useState([])
  const [fileName, setFileName] = useState('')
  const [fileError, setFileError] = useState('')
  const [importError, setImportError] = useState('')
  const [importSuccess, setImportSuccess] = useState('')
  const [importing, setImporting] = useState(false)
  const [filter, setFilter] = useState('all')
  const [editingTargets, setEditingTargets] = useState(() => new Set())
  const [diffRowId, setDiffRowId] = useState(null)
  const recordIdCounterRef = useRef(0)

  const groupedCategories = useMemo(() => {
    const byGroup = new Map()
    for (const category of categories) {
      if (typeof category.name !== 'string') continue
      const key = category.groupId ?? ''
      byGroup.set(key, [...(byGroup.get(key) || []), category.name])
    }
    const result = []
    for (const group of groups) {
      const names = byGroup.get(group.id)
      if (names?.length) result.push({ id: String(group.id), label: `${group.icon || ''} ${group.name}`.trim(), name: group.name, names: names.sort(collator) })
      byGroup.delete(group.id)
    }
    result.sort((a, b) => collator(a.name, b.name))
    const loose = [...byGroup.values()].flat().sort(collator)
    if (loose.length) result.push({ id: 'sem-grupo', label: 'Sem grupo', name: '', names: loose })
    return result
  }, [categories, groups])

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

      if (!record.validObject) errors.push('O registo não é um objeto JSON.')
      if (!record.fileName) errors.push('Nome de ficheiro inválido ou em falta.')
      if (!record.titleValid) errors.push('O campo "titulo" tem de ser texto.')
      if (!record.title.trim()) errors.push('O título é obrigatório.')
      if (record.title.length > 300) errors.push('O título excede 300 caracteres.')
      if (!record.descriptionValid && record.includeDescription) errors.push('O campo "descricao" tem de ser texto.')
      if (record.description.length > 5000) errors.push('A descrição excede 5000 caracteres.')
      if (!Array.isArray(record.categories)) errors.push('As categorias têm de ser uma lista.')
      if (recordCategories.length > MAX_CATEGORIES) errors.push(`Máximo de ${MAX_CATEGORIES} categorias: remova as restantes.`)
      if (recordCategories.some(category => !category.sourceName)) errors.push('Há uma categoria vazia ou inválida.')
      if (recordCategories.some(category => category.name === '')) errors.push('Há categorias sem correspondência; escolha uma categoria válida ou remova-as.')

      const normalizedCategories = recordCategories.map(category => normalizeName(category.name || category.sourceName))
      if (normalizedCategories.some((category, index) => normalizedCategories.indexOf(category) !== index)) {
        errors.push('O registo contém categorias repetidas.')
      }
      if (nameKey && filenameCounts.get(nameKey) > 1) errors.push('O ficheiro aparece mais do que uma vez no JSON.')
      if (photo && targetCounts.get(String(photo.id)) > 1) errors.push('A mesma fotografia foi escolhida para mais do que um registo.')
      if (!photo && record.fileName && filenameCounts.get(nameKey) === 1) warnings.push('Selecione manualmente a fotografia correspondente.')
      if (Array.isArray(record.categories) && recordCategories.length === 0) warnings.push('Sem categorias.')
      if (photo && record.includeDescription && !record.description.trim() && photo.description) {
        warnings.push('Descrição vazia: a descrição atual será apagada.')
      }

      const changes = []
      let replaces = false
      if (photo) {
        const newTitle = record.title.trim()
        const oldTitle = photo.title || ''
        if (newTitle !== oldTitle) {
          changes.push({ key: 'title', label: 'Título', before: oldTitle, after: newTitle })
          if (oldTitle && oldTitle !== fileStem(photoFileName(photo))) replaces = true
        }
        if (record.includeDescription) {
          const newDescription = record.description.trim()
          const oldDescription = photo.description || ''
          if (newDescription !== oldDescription) {
            changes.push({ key: 'description', label: 'Descrição', before: oldDescription, after: newDescription })
            if (oldDescription && !oldDescription.startsWith(AUTO_DESCRIPTION)) replaces = true
          }
        }
        const oldCategories = categoriesForPhoto(photo)
        const newCategories = recordCategories.map(category => category.name || category.sourceName)
        if (!sameCategories(oldCategories, newCategories)) {
          changes.push({ key: 'categories', label: 'Categorias', before: oldCategories.join(', '), after: newCategories.join(', ') })
          if (oldCategories.length > 0) replaces = true
        }
      }

      const canImport = !!photo && errors.length === 0
      const status = !photo ? 'error' : errors.length ? 'error' : warnings.length ? 'warning' : 'ready'
      return { ...record, index: recordIndex, photo, errors, warnings, changes, replaces, status, canImport }
    })
  }, [photos, records])

  const selectedRows = rows.filter(row => row.include && row.canImport)
  const counts = {
    ready: rows.filter(row => row.status === 'ready').length,
    warning: rows.filter(row => row.status === 'warning').length,
    error: rows.filter(row => row.status === 'error').length,
    replace: rows.filter(row => row.replaces).length
  }
  const visibleRows = rows.filter(row =>
    filter === 'all' ||
    (filter === 'warning' && row.status === 'warning') ||
    (filter === 'replace' && row.replaces) ||
    (filter === 'error' && row.status === 'error')
  )
  const diffRow = rows.find(row => row.id === diffRowId)

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
      setRecords(parsed.map(raw => {
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
          include: true,
          includeDescription: validObject && typeof raw.descricao === 'string' && raw.descricao.trim() !== ''
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

  const addCategory = (record) => {
    updateRecord(record.id, { categories: [...record.categories, { sourceName: 'manual', name: '' }] })
  }

  const toggleTargetEditing = (id, editing) => {
    setEditingTargets(current => {
      const next = new Set(current)
      if (editing) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const close = () => {
    if (importing) return
    setRecords([])
    setFileName('')
    setFileError('')
    setImportError('')
    setImportSuccess('')
    setFilter('all')
    setDiffRowId(null)
    setEditingTargets(new Set())
    onClose()
  }

  const confirmImport = async () => {
    if (!selectedRows.length) return
    const items = selectedRows.map(row => ({
      photoId: row.photo.id,
      title: row.title.trim(),
      ...(row.includeDescription ? { description: row.description.trim() } : {}),
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
            <p className="mt-1 text-sm text-gray-400">
              {collectionName ? <>Coleção: <span className="text-gray-200">{collectionName}</span> · </> : null}
              Reveja e valide os dados antes de os aplicar às fotografias.
            </p>
          </div>
          <button type="button" onClick={close} disabled={importing} className="rounded p-2 text-gray-400 hover:bg-gray-700 hover:text-white" aria-label="Fechar">✕</button>
        </header>

        <div className="space-y-4 overflow-y-auto p-4">
          <div className="rounded-lg border border-yellow-700/60 bg-yellow-900/20 p-3 text-sm text-yellow-100">
            A importação substitui o título e as categorias da fotografia; a descrição só é substituída se estiver marcada. Nada é gravado até confirmar.
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
              <div className="flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
                <span className="text-gray-300">{rows.length} registo(s) · {selectedRows.length} a importar</span>
                {[
                  ['all', `Todos (${rows.length})`],
                  ['warning', `⚠ Avisos (${counts.warning})`],
                  ['replace', `↻ Substituem (${counts.replace})`],
                  ['error', `✕ Erros (${counts.error})`]
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={`rounded-full px-3 py-1 text-xs ${filter === key ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                  >
                    {label}
                  </button>
                ))}
                <span className="text-green-300">✓ {counts.ready} prontos</span>
              </div>

              <div className="space-y-3">
                {visibleRows.length === 0 && <p className="text-sm text-gray-400">Nenhum registo neste filtro.</p>}
                {visibleRows.map(row => {
                  const targetOpen = !row.photo || editingTargets.has(row.id)
                  const usedElsewhere = new Set(rows.filter(other => other.id !== row.id && other.photoId).map(other => other.photoId))
                  const statusStyle = {
                    ready: 'text-green-300',
                    warning: 'text-yellow-300',
                    error: 'text-red-300'
                  }[row.status]
                  const statusLabel = {
                    ready: '✓ Pronto para importar',
                    warning: '⚠ Aviso',
                    error: row.photo ? '✕ Erro' : '✕ Sem fotografia'
                  }[row.status]
                  return (
                    <article key={row.id} className={`rounded-lg border p-3 ${row.status === 'error' ? 'border-red-800 bg-red-950/20' : 'border-gray-700 bg-gray-900/50'}`}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <input
                          type="checkbox"
                          checked={row.include && row.canImport}
                          disabled={!row.canImport || importing}
                          onChange={event => updateRecord(row.id, { include: event.target.checked })}
                          aria-label={`Importar registo ${row.index + 1}`}
                          className="h-4 w-4 accent-blue-500"
                        />
                        <p className="break-all text-sm font-semibold text-white">
                          {row.index + 1}. {row.fileName || 'Sem nome de ficheiro'}
                        </p>
                        <span className={`text-xs font-medium ${statusStyle}`}>{statusLabel}</span>
                        {row.replaces && (
                          <button
                            type="button"
                            onClick={() => setDiffRowId(row.id)}
                            className="rounded bg-amber-700/40 px-2 py-0.5 text-xs text-amber-200 hover:bg-amber-700/60"
                          >
                            ↻ Substitui classificação existente · ver antes/depois
                          </button>
                        )}
                      </div>

                      <div className="mt-3 flex gap-3">
                        <div className="w-28 shrink-0 sm:w-40">
                          {row.photo ? (
                            <img src={thumbSrc(row.photo)} alt={photoFileName(row.photo)} loading="lazy" className="aspect-[3/2] w-full rounded bg-gray-800 object-cover" />
                          ) : (
                            <div className="flex aspect-[3/2] w-full items-center justify-center rounded bg-gray-800 text-xs text-gray-500">Sem foto</div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1 space-y-2">
                          {targetOpen ? (
                            <label className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                              Foto
                              <select
                                value={row.photoId}
                                disabled={importing}
                                onChange={event => {
                                  updateRecord(row.id, { photoId: event.target.value })
                                  if (event.target.value) toggleTargetEditing(row.id, false)
                                }}
                                className="min-w-0 flex-1 rounded border border-gray-600 bg-gray-800 p-1.5 text-sm text-white"
                              >
                                <option value="">— Escolha a fotografia —</option>
                                {[...photos].sort((a, b) => collator(photoFileName(a), photoFileName(b))).map(photo => (
                                  <option key={photo.id} value={String(photo.id)} disabled={usedElsewhere.has(String(photo.id))}>
                                    {(photoFileName(photo) || 'sem ficheiro') + (usedElsewhere.has(String(photo.id)) ? ' (já escolhida)' : '')}
                                  </option>
                                ))}
                              </select>
                              {row.photo && <button type="button" onClick={() => toggleTargetEditing(row.id, false)} className="text-gray-400 hover:text-white">cancelar</button>}
                            </label>
                          ) : (
                            <p className="text-xs text-gray-400">
                              Foto: <span className="text-gray-200">{photoFileName(row.photo)}</span>
                              <button type="button" disabled={importing} onClick={() => toggleTargetEditing(row.id, true)} className="ml-2 text-blue-400 hover:text-blue-300">alterar</button>
                            </p>
                          )}

                          <label className="flex items-center gap-2 text-xs text-gray-400">
                            <span className="w-16 shrink-0">Título</span>
                            <input
                              value={row.title}
                              maxLength={300}
                              disabled={importing}
                              onChange={event => updateRecord(row.id, { title: event.target.value })}
                              className="min-w-0 flex-1 rounded border border-gray-600 bg-gray-800 p-1.5 text-sm text-white"
                            />
                          </label>

                          <div className="flex items-start gap-2 text-xs text-gray-400">
                            <label className="flex w-16 shrink-0 items-center gap-1 pt-1.5">
                              <input
                                type="checkbox"
                                checked={row.includeDescription}
                                disabled={importing}
                                onChange={event => updateRecord(row.id, { includeDescription: event.target.checked })}
                                aria-label="Importar descrição"
                                className="h-3.5 w-3.5 accent-blue-500"
                              />
                              Descr.
                            </label>
                            <textarea
                              value={row.description}
                              maxLength={6000}
                              rows={2}
                              disabled={importing || !row.includeDescription}
                              onChange={event => updateRecord(row.id, { description: event.target.value })}
                              className="min-w-0 flex-1 rounded border border-gray-600 bg-gray-800 p-1.5 text-sm text-white disabled:opacity-40"
                            />
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                            <span className="w-16 shrink-0">Categ.</span>
                            {Array.isArray(row.categories) ? (
                              <>
                                {row.categories.map((category, categoryIndex) => (
                                  <span key={`${categoryIndex}-${category.sourceName}`} className="flex items-center gap-1">
                                    <select
                                      value={category.name}
                                      disabled={importing}
                                      onChange={event => updateCategory(row, categoryIndex, event.target.value)}
                                      className={`w-40 rounded border bg-gray-800 p-1.5 text-sm text-white ${category.name ? 'border-gray-600' : 'border-red-500'}`}
                                    >
                                      <option value="">{category.sourceName && category.sourceName !== 'manual' ? `"${category.sourceName}" não existe` : '— escolher —'}</option>
                                      {groupedCategories.map(group => (
                                        <optgroup key={group.id} label={group.label}>
                                          {group.names.map(name => <option key={name} value={name}>{name}</option>)}
                                        </optgroup>
                                      ))}
                                    </select>
                                    <button type="button" disabled={importing} onClick={() => removeCategory(row, categoryIndex)} className="px-1 text-gray-400 hover:text-red-300" aria-label="Remover categoria" title="Remover categoria">✕</button>
                                  </span>
                                ))}
                                {row.categories.length < MAX_CATEGORIES && (
                                  <button type="button" disabled={importing} onClick={() => addCategory(row)} className="rounded border border-dashed border-gray-600 px-2 py-1 text-gray-300 hover:text-white">+ categoria</button>
                                )}
                              </>
                            ) : (
                              <span className="text-red-300">Formato de categorias inválido.</span>
                            )}
                          </div>

                          {(row.errors.length > 0 || row.warnings.length > 0) && (
                            <ul className="space-y-0.5 text-xs">
                              {row.errors.map(error => <li key={error} className="text-red-300">✕ {error}</li>)}
                              {row.warnings.map(warning => <li key={warning} className="text-yellow-200">⚠ {warning}</li>)}
                            </ul>
                          )}
                        </div>
                      </div>
                    </article>
                  )
                })}
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
      {diffRow && <DiffModal row={diffRow} onClose={() => setDiffRowId(null)} />}
    </div>
  )
}
