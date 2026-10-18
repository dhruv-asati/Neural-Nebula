import type { GraphNote } from '../types'

export type Point3 = [number, number, number]

function hash(value: string): number {
  let result = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    result ^= value.charCodeAt(i)
    result = Math.imul(result, 16777619)
  }
  return result >>> 0
}

/** Stable golden-angle spiral layout for presentation only; graph data remains backend-owned. */
export function createGalaxyLayout(notes: GraphNote[]): Map<string, Point3> {
  const ordered = [...notes].sort((a, b) => a.id.localeCompare(b.id))
  const result = new Map<string, Point3>()
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  ordered.forEach((note, index) => {
    const seed = hash(note.id)
    const angle = index * goldenAngle + (seed % 1000) / 1000 * 0.18
    const radius = 2.3 + Math.sqrt(index) * 1.12
    const y = (((seed >>> 10) % 1000) / 1000 - 0.5) * Math.min(5.6, 1.5 + Math.sqrt(index) * 0.34)
    result.set(note.id, [Math.cos(angle) * radius, y, Math.sin(angle) * radius])
  })
  return result
}

export function createNeighborMap(notes: GraphNote[], edges: { sourceNoteId: string; targetNoteId: string }[]) {
  const ids = new Set(notes.map((note) => note.id))
  const neighbors = new Map<string, Set<string>>(notes.map((note) => [note.id, new Set()]))
  for (const edge of edges) {
    if (!ids.has(edge.sourceNoteId) || !ids.has(edge.targetNoteId)) continue
    neighbors.get(edge.sourceNoteId)?.add(edge.targetNoteId)
    neighbors.get(edge.targetNoteId)?.add(edge.sourceNoteId)
  }
  return neighbors
}

export function nodeRadius(importance: number): number {
  return 0.085 + Math.sqrt(Math.max(0, Math.min(100, importance)) / 100) * 0.18
}

export function nodeColor(type: string): string {
  const colors: Record<string, string> = {
    CONCEPT: '#b5c2ca', RESOURCE: '#d3b77e', QUESTION: '#bb8276', SUMMARY: '#d2d0c4',
  }
  return colors[type.toUpperCase()] ?? '#a8b0b5'
}
