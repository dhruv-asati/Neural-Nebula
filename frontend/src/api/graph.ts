import type {
  CommunitiesResult, ComponentsResult, GraphNote, GraphPath, GraphRelationship, HistoryOperation,
  HistoryStatus, KnowledgeGraph, LearningOrder, Prerequisite, SearchSuggestions, SimilaritySuggestion, TraversalResult,
} from '../types'

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`The backend returned an invalid ${label}.`)
  }
  return value
}

function parseNote(value: unknown, index: number): GraphNote {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.title !== 'string') {
    throw new Error(`Graph response contains an invalid note at index ${index}.`)
  }
  if (typeof value.content !== 'string' || !Array.isArray(value.tags) ||
      !value.tags.every((tag) => typeof tag === 'string') || typeof value.type !== 'string' ||
      typeof value.importance !== 'number' || !Number.isFinite(value.importance)) {
    throw new Error(`Graph response contains incomplete metadata for note “${value.title}”.`)
  }
  return {
    id: value.id, title: value.title, content: value.content, tags: value.tags, type: value.type,
    importance: Math.max(0, Math.min(100, value.importance)),
    ...(typeof value.createdAt === 'string' ? { createdAt: value.createdAt } : {}),
    ...(typeof value.updatedAt === 'string' ? { updatedAt: value.updatedAt } : {}),
  }
}

function parseEdge(value: unknown, index: number): GraphRelationship {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.sourceNoteId !== 'string' ||
      typeof value.targetNoteId !== 'string' || typeof value.type !== 'string') {
    throw new Error(`Graph response contains an invalid relationship at index ${index}.`)
  }
  return {
    id: value.id, sourceNoteId: value.sourceNoteId, targetNoteId: value.targetNoteId, type: value.type,
    ...(typeof value.origin === 'string' ? { origin: value.origin } : {}),
    ...(typeof value.similarityScore === 'number' ? { similarityScore: value.similarityScore } : {}),
  }
}

export function parseGraph(value: unknown): KnowledgeGraph {
  if (!isRecord(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    throw new Error('The backend returned an unexpected graph format. Expected nodes and edges.')
  }
  return { nodes: value.nodes.map(parseNote), edges: value.edges.map(parseEdge) }
}

async function requestJson(path: string, init: RequestInit = {}): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new Error('Could not reach the Neural Nebula backend. Check the connection and try again.')
  }
  if (!response.ok) {
    let detail = `Request failed (${response.status} ${response.statusText}).`
    try {
      const body: unknown = await response.json()
      if (isRecord(body) && typeof body.message === 'string') detail = body.message
    } catch { /* Keep the HTTP status when the error body is not JSON. */ }
    throw new Error(detail)
  }
  if (response.status === 204) return undefined
  try { return await response.json() } catch (error) {
    if (error instanceof SyntaxError) throw new Error('The backend returned invalid JSON.')
    throw error
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`The backend returned an invalid ${label}.`)
  return value
}

function parseHistory(value: unknown): HistoryStatus {
  const data = requireRecord(value, 'history status')
  if (typeof data.canUndo !== 'boolean' || typeof data.canRedo !== 'boolean' ||
      typeof data.undoCount !== 'number' || typeof data.redoCount !== 'number') throw new Error('The backend returned an invalid history status.')
  return {
    canUndo: data.canUndo, canRedo: data.canRedo, undoCount: data.undoCount, redoCount: data.redoCount,
    nextUndoAction: typeof data.nextUndoAction === 'string' ? data.nextUndoAction : null,
    nextRedoAction: typeof data.nextRedoAction === 'string' ? data.nextRedoAction : null,
  }
}

export async function fetchGraph(signal?: AbortSignal): Promise<KnowledgeGraph> {
  return parseGraph(await requestJson('/api/graph', { signal }))
}

export async function searchNotes(query: string, signal?: AbortSignal): Promise<GraphNote[]> {
  const data = requireRecord(await requestJson(`/api/search?q=${encodeURIComponent(query)}`, { signal }), 'search response')
  if (data.matchMode !== 'AND' || !Array.isArray(data.results)) throw new Error('The backend returned an invalid search response.')
  return data.results.map(parseNote)
}

export async function fetchSearchSuggestions(query: string, signal?: AbortSignal): Promise<SearchSuggestions> {
  const data = requireRecord(await requestJson(`/api/search/suggestions?q=${encodeURIComponent(query)}&limit=8`, { signal }), 'suggestion response')
  if (!Array.isArray(data.autocomplete) || !data.autocomplete.every((item) => typeof item === 'string') || !Array.isArray(data.corrections)) {
    throw new Error('The backend returned invalid search suggestions.')
  }
  const corrections = data.corrections.map((entry) => {
    const item = requireRecord(entry, 'correction')
    if (typeof item.term !== 'string' || typeof item.distance !== 'number') throw new Error('The backend returned an invalid correction.')
    return { term: item.term, distance: item.distance }
  })
  return { autocomplete: data.autocomplete, corrections }
}

export async function fetchPath(from: string, to: string, signal?: AbortSignal): Promise<GraphPath> {
  const query = new URLSearchParams({ from, to })
  const data = requireRecord(await requestJson(`/api/algorithms/path?${query}`, { signal }), 'path response')
  if (typeof data.pathExists !== 'boolean' || !Array.isArray(data.path) || !data.path.every((id) => typeof id === 'string')) {
    throw new Error('The backend returned an invalid path response.')
  }
  return {
    algorithm: typeof data.algorithm === 'string' ? data.algorithm : 'BFS', path: data.path,
    pathExists: data.pathExists, visitedNodeCount: Number(data.visitedNodeCount ?? 0), edgeChecks: Number(data.edgeChecks ?? 0),
  }
}

export async function fetchRelationshipSuggestions(noteId: string, signal?: AbortSignal): Promise<SimilaritySuggestion[]> {
  const data = await requestJson(`/api/relationships/suggestions?${new URLSearchParams({ noteId })}`, { signal })
  if (!Array.isArray(data)) throw new Error('The backend returned invalid related-note suggestions.')
  return data.map((entry) => {
    const item = requireRecord(entry, 'related-note suggestion')
    if (typeof item.noteId !== 'string' || typeof item.similarity !== 'number' || !Number.isFinite(item.similarity) || item.similarity < 0 || item.similarity > 1) {
      throw new Error('The backend returned an invalid similarity score.')
    }
    return { noteId: item.noteId, similarity: item.similarity }
  })
}

export async function fetchDepthFirst(start: string, signal?: AbortSignal): Promise<TraversalResult> {
  const data = requireRecord(await requestJson(`/api/algorithms/dfs?${new URLSearchParams({ start })}`, { signal }), 'DFS response')
  if (typeof data.algorithm !== 'string' || typeof data.visitedNodeCount !== 'number' || typeof data.edgeChecks !== 'number') {
    throw new Error('The backend returned an invalid DFS response.')
  }
  return { algorithm: data.algorithm, visitedNoteIds: stringArray(data.visitedNoteIds, 'DFS traversal'), visitedNodeCount: data.visitedNodeCount, edgeChecks: data.edgeChecks }
}

export async function fetchComponents(signal?: AbortSignal): Promise<ComponentsResult> {
  const data = requireRecord(await requestJson('/api/algorithms/components', { signal }), 'components response')
  if (!Array.isArray(data.components)) throw new Error('The backend returned an invalid components response.')
  return { algorithm: String(data.algorithm ?? 'Union-Find'), components: data.components.map((group) => stringArray(group, 'component')),
    componentCount: Number(data.componentCount ?? data.components.length), unionOperations: Number(data.unionOperations ?? 0), findOperations: Number(data.findOperations ?? 0) }
}

export async function fetchCommunities(signal?: AbortSignal): Promise<CommunitiesResult> {
  const data = requireRecord(await requestJson('/api/algorithms/communities', { signal }), 'communities response')
  if (!Array.isArray(data.communities)) throw new Error('The backend returned an invalid communities response.')
  return { algorithm: String(data.algorithm ?? 'Weighted Label Propagation'),
    communities: data.communities.map((group) => stringArray(group, 'community')),
    communityByNoteId: isRecord(data.communityByNoteId) ? Object.fromEntries(Object.entries(data.communityByNoteId).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) : {},
    sweeps: Number(data.sweeps ?? 0), consideredEdges: Number(data.consideredEdges ?? 0), minimumEdgeWeight: Number(data.minimumEdgeWeight ?? 0) }
}

export async function fetchTopK(limit = 10, signal?: AbortSignal): Promise<GraphNote[]> {
  const data = await requestJson(`/api/algorithms/top-k?limit=${limit}`, { signal })
  if (!Array.isArray(data)) throw new Error('The backend returned an invalid Top-K response.')
  return data.map(parseNote)
}

export async function fetchPrerequisites(signal?: AbortSignal): Promise<Prerequisite[]> {
  const data = await requestJson('/api/prerequisites', { signal })
  if (!Array.isArray(data)) throw new Error('The backend returned an invalid prerequisite response.')
  return data.map((entry) => {
    const item = requireRecord(entry, 'prerequisite')
    if (typeof item.prerequisiteNoteId !== 'string' || typeof item.dependentNoteId !== 'string') throw new Error('The backend returned an invalid prerequisite.')
    return { prerequisiteNoteId: item.prerequisiteNoteId, dependentNoteId: item.dependentNoteId }
  })
}

export async function fetchLearningOrder(signal?: AbortSignal): Promise<LearningOrder> {
  const data = requireRecord(await requestJson('/api/algorithms/learning-order', { signal }), 'learning-order response')
  if (typeof data.possible !== 'boolean' || !Array.isArray(data.learningOrder)) throw new Error('The backend returned an invalid learning-order response.')
  return { algorithm: String(data.algorithm ?? 'Kahn Topological Sort'), possible: data.possible,
    learningOrder: stringArray(data.learningOrder, 'learning order'), blockedNoteIds: stringArray(data.blockedNoteIds, 'blocked notes'),
    prerequisiteCount: Number(data.prerequisiteCount ?? 0) }
}

export async function fetchHistory(signal?: AbortSignal): Promise<HistoryStatus> {
  return parseHistory(await requestJson('/api/history', { signal }))
}

export async function applyHistory(action: 'undo' | 'redo'): Promise<HistoryOperation> {
  const data = requireRecord(await requestJson(`/api/history/${action}`, { method: 'POST' }), 'history operation')
  if (typeof data.applied !== 'boolean' || typeof data.message !== 'string') throw new Error('The backend returned an invalid history operation.')
  return { applied: data.applied, action: typeof data.action === 'string' ? data.action : null,
    message: data.message, history: parseHistory(data.history) }
}

export async function saveNote(note: Partial<GraphNote> & Pick<GraphNote, 'title' | 'content' | 'tags' | 'type' | 'importance'>): Promise<GraphNote> {
  const id = note.id
  return parseNote(await requestJson(id ? `/api/notes/${encodeURIComponent(id)}` : '/api/notes', {
    method: id ? 'PUT' : 'POST', body: JSON.stringify({ title: note.title, content: note.content,
      tags: note.tags, type: note.type, importance: note.importance }),
  }), 0)
}

export async function deleteNote(id: string): Promise<void> {
  await requestJson(`/api/notes/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function createRelationship(sourceNoteId: string, targetNoteId: string): Promise<void> {
  await requestJson('/api/relationships', { method: 'POST', body: JSON.stringify({ sourceNoteId, targetNoteId, type: 'RELATED' }) })
}

export async function deleteRelationship(id: string): Promise<void> {
  await requestJson(`/api/relationships/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
