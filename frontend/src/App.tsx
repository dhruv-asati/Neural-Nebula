import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  applyHistory, createRelationship, deleteNote as deleteNoteRequest, deleteRelationship as deleteRelationshipRequest,
  fetchCommunities, fetchComponents, fetchDepthFirst, fetchGraph, fetchHistory, fetchLearningOrder, fetchPath, fetchPrerequisites,
  fetchRelationshipSuggestions,
  fetchSearchSuggestions, fetchTopK, saveNote, searchNotes,
} from './api/graph'
import { Hud } from './components/Hud'
import { CommandPalette, type PaletteAction } from './components/CommandPalette'
import { createGalaxyLayout } from './galaxy/layout'
import type {
  CommunitiesResult, ComponentsResult, GraphNote, GraphPath, HistoryStatus, KnowledgeGraph, LearningOrder,
  Prerequisite, SearchSuggestions, SimilaritySuggestion, TraversalResult,
} from './types'
import './App.css'
import './ArtDirection.css'

type LoadStatus = 'loading' | 'ready' | 'error'
const GalaxyCanvas = lazy(() => import('./components/GalaxyCanvas').then((module) => ({ default: module.GalaxyCanvas })))
const LandingPage = lazy(() => import('./components/LandingPage').then((module) => ({ default: module.LandingPage })))

type VisualEvent = { key: number; kind: 'create' | 'delete' | 'relationship'; noteId?: string; sourceId?: string; targetId?: string; position?: [number, number, number] }
type MutationExpectation = Omit<VisualEvent, 'key'>

function GalaxyExplorerApp({ onHome, entering }: { onHome: () => void; entering: boolean }) {
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null)
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [graphRevision, setGraphRevision] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [visualEvent, setVisualEvent] = useState<VisualEvent | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const shortcutLabel = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K'
  const paletteOpener = useRef<HTMLElement | null>(null)
  const shortestPathRef = useRef<HTMLDetailsElement>(null)
  const groupsRef = useRef<HTMLDetailsElement>(null)
  const topKRef = useRef<HTMLDetailsElement>(null)
  const learningTrailRef = useRef<HTMLDetailsElement>(null)
  const manageRef = useRef<HTMLDetailsElement>(null)
  const inspectorRef = useRef<HTMLDetailsElement>(null)
  const discoveryRef = useRef<HTMLDetailsElement>(null)
  const dfsRef = useRef<HTMLDetailsElement>(null)

  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<GraphNote[]>([])
  const [suggestions, setSuggestions] = useState<SearchSuggestions | null>(null)
  const [searchBusy, setSearchBusy] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [searchSubmitted, setSearchSubmitted] = useState(false)

  const [components, setComponents] = useState<ComponentsResult | null>(null)
  const [communities, setCommunities] = useState<CommunitiesResult | null>(null)
  const [topK, setTopK] = useState<GraphNote[]>([])
  const [prerequisites, setPrerequisites] = useState<Prerequisite[]>([])
  const [learningOrder, setLearningOrder] = useState<LearningOrder | null>(null)
  const [history, setHistory] = useState<HistoryStatus | null>(null)
  const [intelligenceErrors, setIntelligenceErrors] = useState<Record<string, string>>({})
  const [intelligenceBusy, setIntelligenceBusy] = useState(true)
  const [related, setRelated] = useState<SimilaritySuggestion[]>([])
  const [relatedNoteId, setRelatedNoteId] = useState<string | null>(null)
  const [relatedRevision, setRelatedRevision] = useState(-1)
  const [relatedError, setRelatedError] = useState('')
  const [relatedErrorNoteId, setRelatedErrorNoteId] = useState<string | null>(null)
  const [relatedErrorRevision, setRelatedErrorRevision] = useState(-1)
  const [dfsResult, setDfsResult] = useState<TraversalResult | null>(null)
  const [dfsStartId, setDfsStartId] = useState<string | null>(null)
  const [dfsRequest, setDfsRequest] = useState<{ selectedId: string | null; graphRevision: number } | null>(null)
  const [dfsError, setDfsError] = useState('')

  const [pathFrom, setPathFrom] = useState('')
  const [pathTo, setPathTo] = useState('')
  const [pathResult, setPathResult] = useState<GraphPath | null>(null)
  const [pathBusy, setPathBusy] = useState(false)
  const [pathError, setPathError] = useState('')
  const [highlightIds, setHighlightIds] = useState<string[] | null>(null)
  const [pathPulseKey, setPathPulseKey] = useState(0)
  const pathRequestRef = useRef(0)

  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newType, setNewType] = useState('CONCEPT')
  const [newImportance, setNewImportance] = useState(50)
  const [newTags, setNewTags] = useState('')
  const [editDraft, setEditDraft] = useState<{ id: string; title: string; content: string; type: string; importance: number; tags: string } | null>(null)
  const [relationshipTarget, setRelationshipTarget] = useState('')

  const selected = useMemo(() => graph?.nodes.find((note) => note.id === selectedId) ?? null, [graph, selectedId])
  const selectedIdRef = useRef(selectedId)
  const graphRevisionRef = useRef(graphRevision)
  useEffect(() => {
    selectedIdRef.current = selectedId
    graphRevisionRef.current = graphRevision
  }, [graphRevision, selectedId])
  const selectedPosition = useMemo(() => selectedId && graph ? createGalaxyLayout(graph.nodes).get(selectedId) : undefined, [graph, selectedId])
  const selectedDraft = useMemo(() => selected ? (editDraft?.id === selected.id ? editDraft : {
    id: selected.id, title: selected.title, content: selected.content, type: selected.type,
    importance: selected.importance, tags: selected.tags.join(', '),
  }) : null, [editDraft, selected])
  const pathIds = pathResult?.pathExists ? pathResult.path : null
  const clearPathVisualization = useCallback(() => {
    pathRequestRef.current += 1
    setPathBusy(false)
    setPathResult(null)
    setHighlightIds(null)
    setPathError('')
  }, [])

  const openPalette = useCallback(() => {
    if (paletteOpen) return
    paletteOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setPaletteOpen(true)
  }, [paletteOpen])
  const closePalette = useCallback((restoreFocus: boolean) => {
    setPaletteOpen(false)
    if (restoreFocus) requestAnimationFrame(() => {
      const opener = paletteOpener.current
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    })
  }, [])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !event.repeat && !event.isComposing) {
        event.preventDefault()
        if (paletteOpen) closePalette(true)
        else openPalette()
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [closePalette, openPalette, paletteOpen])

  useEffect(() => {
    const controller = new AbortController()
    fetchGraph(controller.signal).then((data) => {
      setGraph(data)
      setSelectedId((current) => current && data.nodes.some((note) => note.id === current) ? current : null)
      setPathFrom((current) => current || data.nodes[0]?.id || '')
      setPathTo((current) => current || data.nodes[1]?.id || data.nodes[0]?.id || '')
      setStatus('ready')
      setError('')
    }).catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setError(reason instanceof Error ? reason.message : 'An unexpected error interrupted the graph request.')
      setStatus('error')
    }).finally(() => { if (!controller.signal.aborted) setRefreshing(false) })
    return () => controller.abort()
  }, [graphRevision])

  useEffect(() => {
    if (!graph || status !== 'ready') return
    const controller = new AbortController()
    const load = async <T,>(key: string, request: Promise<T>, publish: (value: T) => void) => {
      try { publish(await request); setIntelligenceErrors((current) => ({ ...current, [key]: '' })) }
      catch (reason) {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) {
          setIntelligenceErrors((current) => ({ ...current, [key]: reason instanceof Error ? reason.message : 'Request failed.' }))
        }
      }
    }
    void Promise.all([
      load('components', fetchComponents(controller.signal), setComponents),
      load('communities', fetchCommunities(controller.signal), setCommunities),
      load('topK', fetchTopK(10, controller.signal), setTopK),
      load('prerequisites', fetchPrerequisites(controller.signal), setPrerequisites),
      load('learningOrder', fetchLearningOrder(controller.signal), setLearningOrder),
      load('history', fetchHistory(controller.signal), setHistory),
    ]).finally(() => { if (!controller.signal.aborted) setIntelligenceBusy(false) })
    return () => controller.abort()
  }, [graph, status])

  useEffect(() => {
    if (!selectedId || status !== 'ready') return
    const controller = new AbortController()
    void fetchRelationshipSuggestions(selectedId, controller.signal).then((results) => {
      setRelated(results.filter((entry) => entry.noteId !== selectedId && graph?.nodes.some((note) => note.id === entry.noteId)))
      setRelatedNoteId(selectedId)
      setRelatedRevision(graphRevision)
    }).catch((reason: unknown) => {
      if (!(reason instanceof DOMException && reason.name === 'AbortError')) {
        setRelatedError(reason instanceof Error ? reason.message : 'Related-note lookup failed.')
        setRelatedErrorNoteId(selectedId)
        setRelatedErrorRevision(graphRevision)
      }
    })
    return () => controller.abort()
  }, [graph, graphRevision, selectedId, status])

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void Promise.allSettled([searchNotes(trimmed, controller.signal), fetchSearchSuggestions(trimmed, controller.signal)])
        .then(([searchResponse, suggestionResponse]) => {
          if (controller.signal.aborted) return
          if (searchResponse.status === 'fulfilled') setSearchResults(searchResponse.value)
          else { setSearchResults([]); setSearchError(searchResponse.reason instanceof Error ? searchResponse.reason.message : 'Search failed.') }
          if (suggestionResponse.status === 'fulfilled') setSuggestions(suggestionResponse.value)
          else setSuggestions(null)
        }).finally(() => { if (!controller.signal.aborted) setSearchBusy(false) })
    }, 260)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [query, graphRevision])

  const retry = useCallback(() => {
    clearPathVisualization()
    setStatus('loading'); setError(''); setIntelligenceBusy(true); setSearchBusy(Boolean(query.trim())); setGraphRevision((value) => value + 1)
  }, [clearPathVisualization, query])
  const refreshGraph = useCallback(async () => {
    clearPathVisualization()
    setRefreshing(true); setIntelligenceBusy(true); setSearchBusy(Boolean(query.trim()))
    setGraphRevision((value) => value + 1)
  }, [clearPathVisualization, query])
  const selectNode = useCallback((note: GraphNote) => {
    if (note.id !== selectedId) clearPathVisualization()
    setSelectedId(note.id); setHoveredId(null)
  }, [clearPathVisualization, selectedId])
  const selectSearchResult = useCallback((note: GraphNote) => {
    clearPathVisualization(); setSelectedId(note.id); setHoveredId(null)
  }, [clearPathVisualization])
  const focusStandaloneNote = useCallback((note: GraphNote) => {
    clearPathVisualization(); setSelectedId(note.id); setHoveredId(null)
  }, [clearPathVisualization])
  const selectPaletteNote = useCallback((note: GraphNote) => {
    const current = graph?.nodes.find((item) => item.id === note.id)
    if (!current) {
      setFeedback('That note is no longer in the current graph. Refresh and search again.')
      void refreshGraph()
      return
    }
    selectSearchResult(current)
  }, [graph, refreshGraph, selectSearchResult])
  const runPath = useCallback(async () => {
    const requestId = ++pathRequestRef.current
    setPathBusy(true); setPathError(''); setPathResult(null); setHighlightIds(null)
    try {
      const result = await fetchPath(pathFrom, pathTo)
      if (pathRequestRef.current !== requestId) return
      setPathResult(result); setPathPulseKey((value) => value + 1)
      if (result.pathExists) { setHighlightIds(result.path); setSelectedId(result.path[0] ?? null) }
      else setPathError('No connected path exists between those notes.')
    } catch (reason) {
      if (pathRequestRef.current === requestId) setPathError(reason instanceof Error ? reason.message : 'Path request failed.')
    } finally {
      if (pathRequestRef.current === requestId) setPathBusy(false)
    }
  }, [pathFrom, pathTo])
  const clearExploration = clearPathVisualization
  const runDfs = useCallback(async () => {
    const start = selectedId ?? graph?.nodes[0]?.id
    if (!start) return
    clearPathVisualization()
    if (dfsRef.current) dfsRef.current.open = true
    const selectionAtRequest = selectedId
    const revisionAtRequest = graphRevision
    setDfsRequest({ selectedId: selectionAtRequest, graphRevision: revisionAtRequest }); setDfsError(''); setDfsResult(null)
    try {
      const result = await fetchDepthFirst(start)
      if (selectedIdRef.current !== selectionAtRequest || graphRevisionRef.current !== revisionAtRequest) return
      setDfsStartId(start)
      setDfsResult(result); setPathResult(null); setHighlightIds(result.visitedNoteIds)
    } catch (reason) {
      if (selectedIdRef.current === selectionAtRequest && graphRevisionRef.current === revisionAtRequest) setDfsError(reason instanceof Error ? reason.message : 'DFS request failed.')
    } finally {
      if (selectedIdRef.current === selectionAtRequest && graphRevisionRef.current === revisionAtRequest) setDfsRequest(null)
    }
  }, [clearPathVisualization, graph, graphRevision, selectedId])

  const mutate = useCallback(async (operation: () => Promise<unknown>, success: string, clearSelection = false, expectation?: MutationExpectation) => {
    setBusy(true); setFeedback(''); setVisualEvent(null)
    try {
      const operationResult = await operation()
      try {
        const refreshed = await fetchGraph()
        clearPathVisualization()
        setGraph(refreshed)
        if (clearSelection) setSelectedId(null)
        setGraphRevision((value) => value + 1)
        setRefreshing(false); setIntelligenceBusy(true); setSearchBusy(Boolean(query.trim()))
        const resolvedExpectation = expectation?.kind === 'create' && !expectation.noteId && typeof operationResult === 'object' && operationResult !== null && 'id' in operationResult && typeof operationResult.id === 'string'
          ? { ...expectation, noteId: operationResult.id } : expectation
        const confirmed = resolvedExpectation && (resolvedExpectation.kind === 'create'
          ? refreshed.nodes.some((note) => note.id === resolvedExpectation.noteId)
          : resolvedExpectation.kind === 'delete'
            ? !refreshed.nodes.some((note) => note.id === resolvedExpectation.noteId)
            : refreshed.edges.some((edge) => (edge.sourceNoteId === resolvedExpectation.sourceId && edge.targetNoteId === resolvedExpectation.targetId) || (edge.sourceNoteId === resolvedExpectation.targetId && edge.targetNoteId === resolvedExpectation.sourceId)))
        if (confirmed && resolvedExpectation) setVisualEvent({ ...resolvedExpectation, key: Date.now() })
        if (resolvedExpectation?.kind === 'create' && confirmed) setSelectedId(resolvedExpectation.noteId ?? null)
        setFeedback(confirmed || !expectation ? success : `${success} Graph refresh completed; the expected change was not present in the returned graph.`)
      } catch (reason) {
        setFeedback(`The change was saved, but the graph could not be refreshed: ${reason instanceof Error ? reason.message : 'request failed.'}`)
      }
    } catch (reason) { setFeedback(reason instanceof Error ? reason.message : 'The change could not be saved.') }
    finally { setBusy(false) }
  }, [clearPathVisualization, query])

  const submitNote = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const note = { title: newTitle.trim(), content: newContent, tags: newTags.split(',').map((tag) => tag.trim()).filter(Boolean), type: newType, importance: newImportance }
    void mutate(() => saveNote(note), 'Note created.', false, { kind: 'create', noteId: '' })
    setNewTitle(''); setNewContent(''); setNewTags('')
  }, [mutate, newContent, newImportance, newTags, newTitle, newType])

  const updateSelected = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected || !selectedDraft) return
    const note = { ...selected, title: selectedDraft.title.trim(), content: selectedDraft.content,
      tags: selectedDraft.tags.split(',').map((tag) => tag.trim()).filter(Boolean), type: selectedDraft.type, importance: selectedDraft.importance }
    void mutate(async () => { await saveNote(note); setEditDraft(null) }, 'Note updated.')
  }, [mutate, selected, selectedDraft])

  const runHistory = useCallback(async (action: 'undo' | 'redo') => {
    setBusy(true); setFeedback('')
    try {
      const result = await applyHistory(action)
      setHistory(result.history); setFeedback(result.message)
      if (result.applied) await refreshGraph()
    } catch (reason) { setFeedback(reason instanceof Error ? reason.message : `Could not ${action}.`) }
    finally { setBusy(false) }
  }, [refreshGraph])

  const focusSection = useCallback((section: HTMLDetailsElement | null, focusId?: string) => {
    if (!section) return
    section.open = true
    window.setTimeout(() => {
      section.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })
      const target = focusId ? document.getElementById(focusId) : section.querySelector<HTMLElement>('summary')
      target?.focus({ preventScroll: true })
    }, 80)
  }, [])

  const paletteActions = useMemo<PaletteAction[]>(() => [
    { id: 'return-galaxy', group: 'Navigation', title: 'Return to galaxy', detail: 'Clear selection and restore the overview', keywords: 'home overview deselect galaxy', run: () => { setSelectedId(null); setHoveredId(null); clearExploration() } },
    { id: 'focus-selected', group: 'Navigation', title: 'Focus selected note', detail: selected ? `Select ${selected.title} in the graph` : 'Select a note first', keywords: 'focus node current selection', disabled: !selected, run: () => { if (selected) focusStandaloneNote(selected) } },
    { id: 'shortest-path', group: 'Algorithms', title: 'Explore shortest path', detail: 'Open the existing BFS path controls', keywords: 'bfs path shortest route', run: () => focusSection(shortestPathRef.current, 'path-from') },
    { id: 'connected-components', group: 'Algorithms', title: 'Show connected components', detail: 'Open graph groups and component results', keywords: 'components connected union find groups', run: () => focusSection(groupsRef.current) },
    { id: 'topic-communities', group: 'Algorithms', title: 'Show topic communities', detail: 'Open graph groups and community results', keywords: 'communities topics groups label propagation', run: () => focusSection(groupsRef.current) },
    { id: 'top-ideas', group: 'Algorithms', title: 'Show top ideas', detail: 'Open the Top-K importance ranking', keywords: 'top core ideas top-k important leaderboard', run: () => focusSection(topKRef.current) },
    { id: 'learning-order', group: 'Algorithms', title: 'Start learning journey', detail: 'Open the backend prerequisite order', keywords: 'learning order prerequisites dependencies journey trail', run: () => focusSection(learningTrailRef.current) },
    { id: 'discover-related', group: 'Navigation', title: 'Discover related concepts', detail: selected ? 'Open suggestions for ' + selected.title : 'Select a note to discover related concepts', keywords: 'discover related similar suggestions jaccard', disabled: !selected, run: () => focusSection(discoveryRef.current) },
    { id: 'dfs-traversal', group: 'Algorithms', title: 'Show DFS traversal', detail: 'Run depth-first traversal from the selected note', keywords: 'dfs depth first traversal explore', disabled: !selected && !graph?.nodes.length, run: () => { focusSection(inspectorRef.current); void runDfs() } },
    { id: 'inspect-algorithms', group: 'Algorithms', title: 'Inspect graph algorithms', detail: 'Open graph statistics and algorithm details', keywords: 'dsa inspector complexity algorithms graph stats', run: () => focusSection(inspectorRef.current) },
    { id: 'create-note', group: 'Actions', title: 'Create note', detail: 'Open the existing note creation form', keywords: 'new add concept note', run: () => focusSection(manageRef.current, 'new-note-title') },
    { id: 'manage-relationships', group: 'Actions', title: 'Manage relationships', detail: selected ? `Open links for ${selected.title}` : 'Select a note before managing its links', keywords: 'manage relationships links connect remove', disabled: !selected, run: () => focusSection(manageRef.current, 'relationship-target') },
    { id: 'undo', group: 'Actions', title: 'Undo', detail: history?.nextUndoAction ?? 'Nothing to undo', keywords: 'undo history revert', disabled: busy || !history?.canUndo, run: () => { void runHistory('undo') } },
    { id: 'redo', group: 'Actions', title: 'Redo', detail: history?.nextRedoAction ?? 'Nothing to redo', keywords: 'redo history repeat', disabled: busy || !history?.canRedo, run: () => { void runHistory('redo') } },
  ], [busy, clearExploration, focusSection, focusStandaloneNote, graph?.nodes.length, history?.canRedo, history?.canUndo, history?.nextRedoAction, history?.nextUndoAction, runDfs, runHistory, selected])

  const onChooseGroup = (ids: string[]) => { clearPathVisualization(); setHighlightIds(ids); setSelectedId(null) }
  const noteName = (id: string) => graph?.nodes.find((note) => note.id === id)?.title ?? id
  const visibleRelationship = useMemo(() => graph?.edges.filter((edge) => edge.sourceNoteId === selectedId || edge.targetNoteId === selectedId) ?? [], [graph, selectedId])
  const directNeighborIds = useMemo(() => new Set(visibleRelationship.map((edge) => edge.sourceNoteId === selectedId ? edge.targetNoteId : edge.sourceNoteId)), [selectedId, visibleRelationship])
  const relatedHasCurrentResult = relatedNoteId === selectedId && relatedRevision === graphRevision
  const relatedHasCurrentError = relatedErrorNoteId === selectedId && relatedErrorRevision === graphRevision
  const relatedForSelection = relatedHasCurrentResult ? related : []
  const relatedErrorForSelection = relatedHasCurrentError ? relatedError : ''
  const relatedLoadingForSelection = Boolean(selected && status === 'ready' && !relatedHasCurrentResult && !relatedHasCurrentError)
  const dfsBusy = dfsRequest?.selectedId === selectedId && dfsRequest.graphRevision === graphRevision
  const learningPosition = learningOrder?.possible ? learningOrder.learningOrder.indexOf(selectedId ?? '') : -1
  const connectSuggestion = useCallback((targetId: string) => {
    if (!selectedId || directNeighborIds.has(targetId)) return
    void mutate(() => createRelationship(selectedId, targetId), 'Suggested relationship created.', false, { kind: 'relationship', sourceId: selectedId, targetId })
  }, [directNeighborIds, mutate, selectedId])

  return <main className={`app-shell${entering ? ' app-shell--route-enter' : ''}`}>
    <div className="scene-wash" aria-hidden="true" />
    {graph && graph.nodes.length > 0 && <div className="canvas-wrap" aria-label="Interactive 3D knowledge galaxy">
      <Suspense fallback={<div className="canvas-loading" role="status">Initializing the 3D galaxy…</div>}>
        <GalaxyCanvas notes={graph.nodes} edges={graph.edges} selectedId={selectedId} hoveredId={hoveredId} visualEvent={visualEvent}
          onVisualEventComplete={(key) => setVisualEvent((current) => current?.key === key ? null : current)}
          highlightIds={highlightIds} pathIds={pathIds} pathPulseKey={pathPulseKey}
          onSelect={selectNode} onHover={setHoveredId} />
      </Suspense>
    </div>}
    <Hud count={graph?.nodes.length ?? 0} status={status} selected={selected} onDeselect={() => setSelectedId(null)} onHome={onHome} />
    {paletteOpen && <CommandPalette actions={paletteActions} selected={selected} onSelectNote={selectPaletteNote} onClose={closePalette} />}

    <aside className="explorer-panel" aria-label="Knowledge exploration controls">
      <div className="explorer-heading"><div><span className="panel-kicker">INTELLIGENCE CONSOLE</span><h2>Explore the graph</h2></div>
        <div className="header-actions"><button className="palette-trigger" onClick={openPalette} aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K">⌕ Search <kbd>{shortcutLabel}</kbd></button>
          <div className="history-controls" aria-label="Undo and redo"><button disabled={busy || !history?.canUndo} title={history?.nextUndoAction ?? 'Nothing to undo'} onClick={() => void runHistory('undo')}>↶ Undo</button><button disabled={busy || !history?.canRedo} title={history?.nextRedoAction ?? 'Nothing to redo'} onClick={() => void runHistory('redo')}>Redo ↷</button></div></div>
      </div>
      {refreshing && <div className="console-message" role="status">Refreshing persisted graph…</div>}
      {feedback && <div className="console-message" role="status">{feedback}</div>}
      {Object.values(intelligenceErrors).some(Boolean) && <button className="console-retry" onClick={() => void refreshGraph()}>Retry intelligence requests</button>}
      <div className="explorer-scroll">
        <section className="console-section search-section" aria-labelledby="search-title">
          <h3 id="search-title">Search knowledge</h3>
          <label className="visually-hidden" htmlFor="knowledge-search">Search notes</label>
          <input id="knowledge-search" type="search" value={query} placeholder="Search notes and ideas…" onChange={(event) => {
            const value = event.target.value
            setQuery(value); setSearchError(''); setSearchSubmitted(Boolean(value.trim())); setSearchBusy(Boolean(value.trim()))
            if (!value.trim()) { setSearchResults([]); setSuggestions(null); setSearchBusy(false) }
          }} />
          {searchBusy && <small className="muted" role="status">Searching the backend…</small>}
          {searchError && <p className="console-error" role="alert">{searchError}</p>}
          {!searchBusy && searchSubmitted && !searchError && searchResults.length === 0 && <small className="muted">No notes match every search term.</small>}
          {searchResults.length > 0 && <div className="console-list">{searchResults.map((note) => <button className="console-row" key={note.id} onClick={() => selectSearchResult(note)}>{note.title}<small>{note.type} · {note.importance}</small></button>)}</div>}
          {suggestions && (suggestions.autocomplete.length > 0 || suggestions.corrections.length > 0) && <div className="suggestions"><small>BACKEND SUGGESTIONS</small>
            {suggestions.autocomplete.map((value) => <button key={`a-${value}`} onClick={() => setQuery(value)}>{value}</button>)}
            {suggestions.corrections.map(({ term, distance }) => <button key={`c-${term}`} onClick={() => setQuery(term)}>{term}<small> edit distance {distance}</small></button>)}
          </div>}
        </section>

        <details className="console-section discovery-section" ref={discoveryRef} open={Boolean(selected)}>
          <summary>Discover related concepts</summary>
          {!selected && <small className="muted">Select a real note in the galaxy to explore its similarity-ranked neighbors.</small>}
          {selected && <>
            <p className="concept-note">Ranked by the backend’s keyword Jaccard suggestions. Similarity does not create a link.</p>
            {relatedLoadingForSelection && <small className="muted" role="status">Finding related concepts…</small>}
            {relatedErrorForSelection && <p className="console-error" role="alert">{relatedErrorForSelection}</p>}
            {!relatedLoadingForSelection && !relatedErrorForSelection && relatedForSelection.length === 0 && <small className="muted">No related concepts meet the backend suggestion threshold.</small>}
            {relatedForSelection.length > 0 && <div className="console-list">{relatedForSelection.map(({ noteId, similarity }) => {
              const note = graph?.nodes.find((item) => item.id === noteId)
              if (!note) return null
              const connected = directNeighborIds.has(noteId)
              const relationship = connected ? graph?.edges.find((edge) =>
                (edge.sourceNoteId === selected.id && edge.targetNoteId === noteId) ||
                (edge.sourceNoteId === noteId && edge.targetNoteId === selected.id)) : undefined
              return <div className="discovery-row" key={noteId}>
                <button className="console-row discovery-note" onClick={() => focusStandaloneNote(note)}><span>{note.title}<small>{note.type}{note.tags.length ? ' · ' + note.tags.join(', ') : ''}</small></span><small>{(similarity * 100).toFixed(0)}% · {connected ? 'Connected' : 'Suggested'}</small></button>
                {connected ? <div className="relationship-actions"><small className="relationship-status">Existing relationship</small>{relationship && <button className="relationship-remove" disabled={busy} aria-label={`Remove relationship between ${selected.title} and ${note.title}`} onClick={() => void mutate(() => deleteRelationshipRequest(relationship.id), 'Relationship removed.')}>Remove link</button>}</div> : <button className="connect-suggestion" disabled={busy} onClick={() => connectSuggestion(noteId)}>Connect</button>}
              </div>
            })}</div>}
          </>}
        </details>

        <details className="console-section" open ref={shortestPathRef}><summary>Shortest path</summary>
          <div className="control-stack"><label>From<select id="path-from" value={pathFrom} onChange={(event) => setPathFrom(event.target.value)}>{graph?.nodes.map((note) => <option key={note.id} value={note.id}>{note.title}</option>)}</select></label>
            <label>To<select value={pathTo} onChange={(event) => setPathTo(event.target.value)}>{graph?.nodes.map((note) => <option key={note.id} value={note.id}>{note.title}</option>)}</select></label>
            <div className="button-row"><button disabled={!pathFrom || !pathTo || pathBusy} onClick={() => void runPath()}>{pathBusy ? 'Tracing…' : 'Explore path'}</button>{pathResult && <button className="quiet-button" onClick={clearExploration}>Clear</button>}</div>
            {pathError && <p className="console-error" role="alert">{pathError}</p>}
            {pathResult?.pathExists && <><p className="result-caption">{pathResult.path.length - 1} hops · {pathResult.algorithm}</p><div className="console-list">{pathResult.path.map((id, index) => <button key={`${id}-${index}`} className="console-row" onClick={() => { const note = graph?.nodes.find((item) => item.id === id); if (note) selectNode(note) }}>{String(index + 1).padStart(2, '0')} · {noteName(id)}</button>)}</div></>}
          </div>
        </details>

        <details className="console-section" ref={groupsRef}><summary>Graph groups</summary>
          <p className="concept-note"><b>Components</b> follow ordinary graph connectivity. <b>Communities</b> are weighted topic groups and can split a connected component.</p>
          {intelligenceErrors.components && <p className="console-error">Components: {intelligenceErrors.components}</p>}
          {components && <GroupList title={`Connected components · ${components.componentCount}`} groups={components.components} noteName={noteName} onChoose={onChooseGroup} onSelectNote={(id) => { const note = graph?.nodes.find((item) => item.id === id); if (note) selectNode(note) }} />}
          {intelligenceErrors.communities && <p className="console-error">Communities: {intelligenceErrors.communities}</p>}
          {communities && <GroupList title={`Topic communities · ${communities.communities.length}`} groups={communities.communities} noteName={noteName} onChoose={onChooseGroup} onSelectNote={(id) => { const note = graph?.nodes.find((item) => item.id === id); if (note) selectNode(note) }} />}
          {highlightIds && !pathResult && <button className="quiet-button" onClick={() => setHighlightIds(null)}>Clear group highlight</button>}
        </details>

        <details className="console-section" ref={topKRef}><summary>Core ideas · Top 10</summary>
          {intelligenceErrors.topK ? <p className="console-error">{intelligenceErrors.topK}</p> : topK.length === 0 ? <small className="muted">{intelligenceBusy ? 'Loading leaderboard…' : 'No notes to rank.'}</small> :
            <ol className="leaderboard">{topK.map((note, index) => <li key={note.id}><button className="console-row" onClick={() => focusStandaloneNote(note)}><span>{index + 1}. {note.title}</span><small>Importance {note.importance}</small></button></li>)}</ol>}
        </details>

        <details className="console-section" ref={learningTrailRef}><summary>Learning trail</summary>
          <p className="concept-note">“Related knowledge” links are undirected; “must learn before” dependencies are directed.</p>
          {intelligenceErrors.learningOrder && <p className="console-error">{intelligenceErrors.learningOrder}</p>}
          {learningOrder && !learningOrder.possible && <p className="console-error" role="alert">A prerequisite cycle blocks a complete trail. Review: {learningOrder.blockedNoteIds.map(noteName).join(', ')}.</p>}
          {learningOrder?.possible && (learningOrder.learningOrder.length === 0 ? <small className="muted">No notes are available.</small> : <><p className="result-caption">Global valid order · current position {learningPosition >= 0 ? (learningPosition + 1) + ' of ' + learningOrder.learningOrder.length : 'none selected'}</p><ol className="learning-list">{learningOrder.learningOrder.map((id) => <li className={id === selectedId ? 'learning-current' : ''} key={id}><button aria-current={id === selectedId ? 'step' : undefined} onClick={() => { const note = graph?.nodes.find((item) => item.id === id); if (note) focusStandaloneNote(note) }}>{noteName(id)}</button></li>)}</ol></>)}
          {prerequisites.length > 0 ? <div className="prerequisite-list"><small>{prerequisites.length} directed prerequisite dependencies · prerequisite → dependent</small>{prerequisites.map((item) => <button key={item.prerequisiteNoteId + '-' + item.dependentNoteId} onClick={() => { const note = graph?.nodes.find((entry) => entry.id === item.prerequisiteNoteId); if (note) focusStandaloneNote(note) }}>{noteName(item.prerequisiteNoteId)} → {noteName(item.dependentNoteId)}</button>)}</div> : learningOrder?.possible && learningOrder.learningOrder.length > 0 && <small className="muted">No prerequisites are configured. This is the backend’s deterministic global order, not a dependency-based course.</small>}
        </details>

        <details className="console-section" ref={manageRef}><summary>Manage notes and links</summary>
          <form className="manage-form" onSubmit={submitNote}><h4>Create note</h4><label>Title<input id="new-note-title" required maxLength={200} value={newTitle} onChange={(event) => setNewTitle(event.target.value)} /></label><label>Content<textarea maxLength={100000} value={newContent} onChange={(event) => setNewContent(event.target.value)} /></label><label>Tags, comma separated<input value={newTags} onChange={(event) => setNewTags(event.target.value)} /></label><div className="form-row"><label>Type<select value={newType} onChange={(event) => setNewType(event.target.value)}><NoteTypes /></select></label><label>Importance<input type="number" min={0} max={100} value={newImportance} onChange={(event) => setNewImportance(Number(event.target.value))} /></label></div><button disabled={busy}>Create note</button></form>
          {selected && selectedDraft && <><form className="manage-form" onSubmit={updateSelected}><h4>Edit selected note</h4><label>Title<input required maxLength={200} value={selectedDraft.title} onChange={(event) => setEditDraft({ ...selectedDraft, title: event.target.value })} /></label><label>Content<textarea maxLength={100000} value={selectedDraft.content} onChange={(event) => setEditDraft({ ...selectedDraft, content: event.target.value })} /></label><label>Tags, comma separated<input value={selectedDraft.tags} onChange={(event) => setEditDraft({ ...selectedDraft, tags: event.target.value })} /></label><div className="form-row"><label>Type<select value={selectedDraft.type} onChange={(event) => setEditDraft({ ...selectedDraft, type: event.target.value })}><NoteTypes /></select></label><label>Importance<input type="number" min={0} max={100} value={selectedDraft.importance} onChange={(event) => setEditDraft({ ...selectedDraft, importance: Number(event.target.value) })} /></label></div><button disabled={busy}>Save note</button></form>
            <div className="manage-form"><button className="danger-button" disabled={busy} onClick={() => {
              if (window.confirm(`Delete “${selected.title}” and its relationships?`)) {
                void mutate(() => deleteNoteRequest(selected.id), 'Note deleted.', true, { kind: 'delete', noteId: selected.id, position: selectedPosition })
              }
            }}>Delete selected note</button>
              <h4>Ordinary relationships</h4><label>Connect to<select id="relationship-target" value={relationshipTarget} onChange={(event) => setRelationshipTarget(event.target.value)}><option value="">Choose a note</option>{graph?.nodes.filter((note) => note.id !== selected.id && !visibleRelationship.some((edge) => edge.sourceNoteId === note.id || edge.targetNoteId === note.id)).map((note) => <option key={note.id} value={note.id}>{note.title}</option>)}</select></label><button disabled={busy || !relationshipTarget} onClick={() => void mutate(() => createRelationship(selected.id, relationshipTarget), 'Relationship created.', false, { kind: 'relationship', sourceId: selected.id, targetId: relationshipTarget })}>Add related link</button>
              {visibleRelationship.length > 0 && <div className="console-list">{visibleRelationship.map((edge) => <div className="relationship-row" key={edge.id}><span>{noteName(edge.sourceNoteId === selected.id ? edge.targetNoteId : edge.sourceNoteId)}</span><button aria-label={`Remove relationship to ${noteName(edge.sourceNoteId === selected.id ? edge.targetNoteId : edge.sourceNoteId)}`} disabled={busy} onClick={() => void mutate(() => deleteRelationshipRequest(edge.id), 'Relationship removed.')}>×</button></div>)}</div>}
            </div></>}
        </details>

        <details className="console-section" ref={inspectorRef}><summary>DSA inspector</summary>
          <dl className="metrics"><Metric label="Graph nodes / edges" value={`${graph?.nodes.length ?? 0} / ${graph?.edges.length ?? 0}`} /><Metric label="Search results" value={query.trim() ? String(searchResults.length) : '—'} /><Metric label="Connected components" value={components ? String(components.componentCount) : '—'} /><Metric label="Topic communities" value={communities ? String(communities.communities.length) : '—'} /><Metric label="Path hops" value={pathResult?.pathExists ? String(pathResult.path.length - 1) : pathResult ? 'No path' : '—'} /><Metric label="BFS visited / edge checks" value={pathResult ? `${pathResult.visitedNodeCount} / ${pathResult.edgeChecks}` : '—'} /><Metric label="Top-K results / limit" value={`${topK.length} / 10`} /><Metric label="Learning trail" value={learningOrder ? learningOrder.possible ? `${learningOrder.learningOrder.length} notes` : 'Cycle detected' : '—'} /><Metric label="Undo / redo" value={`${history?.undoCount ?? 0} / ${history?.redoCount ?? 0}`} /></dl>
          <dl className="metrics">
            <Metric label="Selected node degree" value={selected ? String(directNeighborIds.size) : '—'} />
            <Metric label="Union operations" value={components ? String(components.unionOperations) : '—'} />
            <Metric label="Find operations" value={components ? String(components.findOperations) : '—'} />
            <Metric label="Community sweeps" value={communities ? String(communities.sweeps) : '—'} />
            <Metric label="Community edges / threshold" value={communities ? communities.consideredEdges + ' / ' + communities.minimumEdgeWeight : '—'} />
          </dl>
          <details className="inspector-detail" ref={dfsRef}><summary>DFS · adjacency-list traversal</summary>
            <p className="concept-note">Depth-first traversal visits the selected node’s connected region. Sorting each visited adjacency list for deterministic order gives O(V + E log(Δ + 1)) worst-case, where Δ is maximum degree.</p>
            <button className="quiet-button" disabled={!graph?.nodes.length || dfsBusy} onClick={() => void runDfs()}>{dfsBusy ? 'Traversing…' : 'Run DFS from ' + (selected?.title ?? 'first note')}</button>
            {dfsError && <p className="console-error" role="alert">{dfsError}</p>}
            {dfsResult && (selectedId === null ? dfsStartId === graph?.nodes[0]?.id : dfsStartId === selectedId) && <><p className="result-caption">{dfsResult.algorithm} · {dfsResult.visitedNodeCount} visited · {dfsResult.edgeChecks} edge checks</p><div className="console-list">{dfsResult.visitedNoteIds.map((id, index) => <button className="console-row" key={id + '-' + index} onClick={() => { const note = graph?.nodes.find((item) => item.id === id); if (note) selectNode(note) }}>{index + 1}. {noteName(id)}</button>)}</div><button className="quiet-button" onClick={() => { setDfsResult(null); setHighlightIds(null) }}>Return to galaxy overview</button></>}
          </details>
          <details className="inspector-detail"><summary>Algorithm notes · analytical bounds</summary>
            <p className="concept-note"><b>BFS shortest path:</b> scans adjacency lists and sorts each visited node’s neighbors for deterministic tie-breaking; O(V + E log(Δ + 1)) worst-case with maximum degree Δ. Finds an unweighted shortest path.</p>
            <p className="concept-note"><b>DFS:</b> O(V + E log(Δ + 1)) worst-case here because each visited adjacency list is sorted for deterministic order; Δ is maximum degree.</p>
            <p className="concept-note"><b>Components:</b> Union-Find with path compression and union by rank gives near-linear amortized operations; each query rebuilds it to honor deletions, and the graph snapshot/group output is also sorted.</p>
            <p className="concept-note"><b>Topic communities:</b> weighted label propagation, Jaccard edge weights, 0.10 minimum weight, at most 20 sweeps. Each sweep revisits retained weighted neighbors; this deterministic heuristic is not a globally optimal partition.</p>
            <p className="concept-note"><b>Top-K:</b> this endpoint builds a full max heap in O(V), then removes up to k notes in O(k log V); it does not use a bounded k heap.</p>
            <p className="concept-note"><b>Learning order:</b> deterministic Kahn sort with the smallest ready ID found by scanning remaining notes: O(V² + E), as implemented.</p>
            <p className="concept-note"><b>Similarity:</b> backend Jaccard over indexed keyword sets; candidate generation uses shared-term postings, then scores candidates and sorts by score.</p>
            <p className="concept-note"><b>Keyword search:</b> inverted HashMap index; expected hash lookup plus posting-set work. Trie prefix lookup depends on prefix length and emitted results. Edit distance uses rolling rows, O(mn) time/O(min(m,n)) space per compared term (banded cutoff in suggestion queries).</p>
            <small className="muted">Complexities are analytical bounds from the Java implementations and adjacency-list representation; no execution timings are reported.</small>
          </details>
        </details>
      </div>
    </aside>

    {status === 'loading' && <section className="state-card loading-card" role="status"><span className="loader-orbit"><i /></span><p>Mapping the constellation</p><small>Receiving knowledge signal…</small></section>}
    {status === 'error' && <section className="state-card error-card" role="alert"><span className="state-symbol">⌁</span><p>We lost the signal</p><small>{error}</small><button onClick={retry}>Reconnect to the galaxy</button></section>}
    {status === 'ready' && graph?.nodes.length === 0 && <section className="state-card empty-card" role="status"><span className="state-symbol">✳</span><p>A quiet corner of the universe</p><small>No notes have entered this galaxy yet. Create one in Manage notes.</small></section>}
    <div className="edge-fade" aria-hidden="true" />
  </main>
}

function GroupList({ title, groups, noteName, onChoose, onSelectNote }: {
  title: string; groups: string[][]; noteName: (id: string) => string; onChoose: (ids: string[]) => void; onSelectNote: (id: string) => void
}) {
  return <div className="groups-list"><h4>{title}</h4>{groups.map((group, index) => <details key={`${title}-${group[0] ?? index}`} className="group-item"><summary>Group {index + 1} · {group.length}</summary><button className="group-highlight" onClick={() => onChoose(group)}>Highlight these notes</button>{group.map((id) => <button className="group-note" key={id} onClick={() => onSelectNote(id)}>{noteName(id)}</button>)}</details>)}</div>
}

function Metric({ label, value }: { label: string; value: string }) { return <><dt>{label}</dt><dd>{value}</dd></> }

function NoteTypes() { return <><option value="CONCEPT">Concept</option><option value="RESOURCE">Resource</option><option value="QUESTION">Question</option><option value="SUMMARY">Summary</option></> }

type AppPath = '/' | '/explore'

function resolvePath(pathname: string): AppPath {
  return pathname.replace(/\/+$/, '') === '/explore' ? '/explore' : '/'
}

export default function App() {
  const [path, setPath] = useState<AppPath>(() => resolvePath(window.location.pathname))
  const [explorerEntering, setExplorerEntering] = useState(false)

  useEffect(() => {
    const handlePopState = () => {
      setPath(resolvePath(window.location.pathname))
      setExplorerEntering(false)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const enterExplorer = useCallback(() => {
    if (resolvePath(window.location.pathname) === '/explore') {
      setExplorerEntering(true)
      setPath('/explore')
      return
    }
    window.history.pushState({}, '', '/explore')
    setExplorerEntering(true)
    setPath('/explore')
  }, [])

  const returnHome = useCallback(() => {
    if (resolvePath(window.location.pathname) !== '/') window.history.pushState({}, '', '/')
    setExplorerEntering(false)
    setPath('/')
  }, [])

  return path === '/explore' ? <GalaxyExplorerApp onHome={returnHome} entering={explorerEntering} /> : <Suspense fallback={<main className="landing-loading" role="status" aria-label="Preparing the cosmic scene" />}><LandingPage onEnter={enterExplorer} /></Suspense>
}
