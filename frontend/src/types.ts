export type NoteType = 'CONCEPT' | 'RESOURCE' | 'QUESTION' | 'SUMMARY' | string

export interface GraphNote {
  id: string
  title: string
  content: string
  tags: string[]
  type: NoteType
  importance: number
  createdAt?: string
  updatedAt?: string
}

export interface GraphRelationship {
  id: string
  sourceNoteId: string
  targetNoteId: string
  type: string
  origin?: string
  similarityScore?: number
}

export interface KnowledgeGraph {
  nodes: GraphNote[]
  edges: GraphRelationship[]
}

export interface SearchSuggestions {
  autocomplete: string[]
  corrections: Array<{ term: string; distance: number }>
}

export interface GraphPath {
  algorithm: string
  path: string[]
  pathExists: boolean
  visitedNodeCount: number
  edgeChecks: number
}

export interface SimilaritySuggestion {
  noteId: string
  similarity: number
}

export interface TraversalResult {
  algorithm: string
  visitedNoteIds: string[]
  visitedNodeCount: number
  edgeChecks: number
}

export interface ComponentsResult {
  algorithm: string
  components: string[][]
  componentCount: number
  unionOperations: number
  findOperations: number
}

export interface CommunitiesResult {
  algorithm: string
  communities: string[][]
  communityByNoteId: Record<string, string>
  sweeps: number
  consideredEdges: number
  minimumEdgeWeight: number
}

export interface Prerequisite {
  prerequisiteNoteId: string
  dependentNoteId: string
}

export interface LearningOrder {
  algorithm: string
  possible: boolean
  learningOrder: string[]
  blockedNoteIds: string[]
  prerequisiteCount: number
}

export interface HistoryStatus {
  canUndo: boolean
  canRedo: boolean
  undoCount: number
  redoCount: number
  nextUndoAction: string | null
  nextRedoAction: string | null
}

export interface HistoryOperation {
  applied: boolean
  action: string | null
  message: string
  history: HistoryStatus
}
