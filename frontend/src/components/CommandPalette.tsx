import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { fetchSearchSuggestions, searchNotes } from '../api/graph'
import type { GraphNote, SearchSuggestions } from '../types'
import './CommandPalette.css'

export type PaletteGroup = 'Notes' | 'Navigation' | 'Algorithms' | 'Actions' | 'Suggestions'

export interface PaletteAction {
  id: string
  group: Exclude<PaletteGroup, 'Notes' | 'Suggestions'>
  title: string
  detail: string
  keywords: string
  disabled?: boolean
  shortcut?: string
  run: () => void
}

type PaletteEntry = {
  id: string
  group: PaletteGroup
  title: string
  detail: string
  note?: GraphNote
  action?: PaletteAction
  suggestion?: string
}

interface CommandPaletteProps {
  actions: PaletteAction[]
  selected: GraphNote | null
  onSelectNote: (note: GraphNote) => void
  onClose: (restoreFocus: boolean) => void
}

const groupOrder: PaletteGroup[] = ['Notes', 'Navigation', 'Algorithms', 'Actions', 'Suggestions']

export function CommandPalette({ actions, selected, onSelectNote, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [notes, setNotes] = useState<GraphNote[]>([])
  const [suggestions, setSuggestions] = useState<SearchSuggestions | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [retryKey, setRetryKey] = useState(0)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const requestId = useRef(0)
  const changeQuery = (value: string) => {
    const term = value.trim().replace(/^>/, '').trim()
    requestId.current += 1
    setQuery(value); setActiveIndex(0); setNotes([]); setSuggestions(null); setError(''); setLoading(Boolean(term))
  }

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const raw = query.trim()
    const term = raw.startsWith('>') ? raw.slice(1).trim() : raw
    if (!term) {
      requestId.current += 1
      return
    }
    const controller = new AbortController()
    const currentRequest = ++requestId.current
    const timer = window.setTimeout(() => {
      void Promise.allSettled([
        searchNotes(term, controller.signal),
        fetchSearchSuggestions(term, controller.signal),
      ]).then(([noteResult, suggestionResult]) => {
        if (controller.signal.aborted || currentRequest !== requestId.current) return
        if (noteResult.status === 'fulfilled') { setNotes(noteResult.value); setError('') }
        else { setNotes([]); setError(noteResult.reason instanceof Error ? noteResult.reason.message : 'Search could not reach the knowledge service.') }
        setSuggestions(suggestionResult.status === 'fulfilled' ? suggestionResult.value : null)
      }).finally(() => {
        if (!controller.signal.aborted && currentRequest === requestId.current) setLoading(false)
      })
    }, 200)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [query, retryKey])

  const entries = useMemo(() => {
    const raw = query.trim()
    const term = (raw.startsWith('>') ? raw.slice(1) : raw).trim().toLocaleLowerCase()
    const noteEntries: PaletteEntry[] = raw
      ? notes.slice(0, 12).map((note) => ({ id: `note:${note.id}`, group: 'Notes', title: note.title,
        detail: [note.type, note.tags.slice(0, 3).join(', '), note.content.slice(0, 150)].filter(Boolean).join(' · '), note }))
      : selected ? [{ id: `note:${selected.id}`, group: 'Notes', title: `Continue exploring · ${selected.title}`,
        detail: [selected.type, selected.tags.slice(0, 3).join(', ')].filter(Boolean).join(' · '), note: selected }] : []
    const actionEntries: PaletteEntry[] = actions
      .filter((action) => !term || `${action.title} ${action.detail} ${action.keywords}`.toLocaleLowerCase().includes(term))
      .map((action) => ({ id: `action:${action.id}`, group: action.group, title: action.title, detail: action.detail, action }))
    const suggestionTerms = [...(suggestions?.autocomplete ?? []), ...(suggestions?.corrections.map((item) => item.term) ?? [])]
    const seen = new Set<string>()
    const suggestionEntries: PaletteEntry[] = suggestionTerms.filter((value) => {
      const normalized = value.toLocaleLowerCase()
      if (!value || seen.has(normalized) || normalized === term) return false
      seen.add(normalized); return true
    }).slice(0, 5).map((value) => ({ id: `suggestion:${value}`, group: 'Suggestions', title: value,
      detail: suggestions?.corrections.some((item) => item.term === value) ? 'Suggested spelling' : 'Search suggestion', suggestion: value }))
    const combined = [...noteEntries, ...actionEntries, ...suggestionEntries]
    if (raw.startsWith('>')) {
      const priority: Record<PaletteGroup, number> = { Actions: 0, Algorithms: 1, Navigation: 2, Notes: 3, Suggestions: 4 }
      combined.sort((a, b) => priority[a.group] - priority[b.group] || a.title.localeCompare(b.title))
    }
    return combined
  }, [actions, notes, query, selected, suggestions])

  const highlightedIndex = Math.min(activeIndex, Math.max(0, entries.length - 1))

  const activate = (entry: PaletteEntry | undefined) => {
    if (!entry) return
    if (entry.suggestion) { changeQuery(entry.suggestion); inputRef.current?.focus(); return }
    if (entry.note) onSelectNote(entry.note)
    else if (entry.action && !entry.action.disabled) entry.action.run()
    else return
    onClose(false)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(true); return }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!entries.length) return
      event.preventDefault()
      setActiveIndex((index) => (index + (event.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length)
      inputRef.current?.focus()
      return
    }
    if (event.key === 'Enter') {
    const entry = entries[highlightedIndex]
      if (entry) { event.preventDefault(); activate(entry) }
      return
    }
    if (event.key === 'Tab' && dialogRef.current) {
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled)')]
      const first = focusable[0]; const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
  }

  const orderedGroups = query.trim().startsWith('>') ? ['Actions', 'Algorithms', 'Navigation', 'Notes', 'Suggestions'] as PaletteGroup[] : groupOrder
  const groupedEntries = orderedGroups.map((group) => ({ group, items: entries.filter((entry) => entry.group === group) })).filter(({ items }) => items.length)
  const activeId = entries[highlightedIndex] ? `palette-option-${highlightedIndex}` : undefined

  return <div className="palette-backdrop" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose(true)
  }}>
    <div ref={dialogRef} className="command-palette" role="dialog" aria-modal="true" aria-labelledby="palette-title" onKeyDown={onKeyDown}>
      <div className="palette-topline"><span id="palette-title">Navigate the knowledge universe</span><button className="palette-close" aria-label="Close command palette" onClick={() => onClose(true)}>Esc</button></div>
      <label className="visually-hidden" htmlFor="command-palette-search">Search notes or commands</label>
      <div className="palette-search-wrap"><span aria-hidden="true">⌕</span><input ref={inputRef} id="command-palette-search" type="search" value={query}
        onChange={(event) => changeQuery(event.target.value)} placeholder="Search concepts or type a command…"
        aria-controls="command-palette-results" aria-activedescendant={activeId} autoComplete="off" /></div>
      <div className="palette-results" id="command-palette-results" role="listbox" aria-label="Search results and commands" aria-busy={loading}>
        {loading && <div className="palette-status" role="status">Searching the knowledge graph…</div>}
        {error && <div className="palette-error" role="alert"><span>{error}</span><button onClick={() => { requestId.current += 1; setLoading(true); setError(''); setNotes([]); setSuggestions(null); setRetryKey((value) => value + 1) }}>Retry</button></div>}
        {groupedEntries.map(({ group, items }) => <section className="palette-group" key={group} role="group" aria-label={group}>
          <h3>{group}</h3>
          {items.map((entry) => {
            const index = entries.indexOf(entry)
            const disabled = Boolean(entry.action?.disabled)
            return <button key={entry.id} id={`palette-option-${index}`} role="option" aria-selected={index === highlightedIndex}
              className={`palette-result${index === highlightedIndex ? ' is-active' : ''}`} disabled={disabled}
              onMouseEnter={() => setActiveIndex(index)} onClick={() => activate(entry)}>
              <span className="palette-result-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></span>
              {entry.action?.shortcut && <kbd>{entry.action.shortcut}</kbd>}
              {disabled && <small className="palette-disabled">Unavailable</small>}
            </button>
          })}
        </section>)}
        {!loading && !error && query.trim() && notes.length === 0 && !groupedEntries.some(({ group }) => group === 'Notes') &&
          entries.some((entry) => entry.action || entry.suggestion) &&
          <div className="palette-status">No notes match this search. Matching commands or suggestions remain available below.</div>}
        {!loading && !error && query.trim() && !entries.length && <div className="palette-status">No notes or commands match “{query.trim()}”.</div>}
        {!loading && !error && !query.trim() && !entries.length && <div className="palette-status">No selected note. Search for a concept or choose a command.</div>}
      </div>
      <footer className="palette-footer"><span><kbd>↑</kbd><kbd>↓</kbd> Navigate <kbd>↵</kbd> Open</span><span><kbd>Esc</kbd> Close</span></footer>
    </div>
  </div>
}
