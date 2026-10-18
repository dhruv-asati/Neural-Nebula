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

/** Stable, gently warped 3D spiral for presentation only; graph data remains backend-owned. */
export function createGalaxyLayout(notes: GraphNote[]): Map<string, Point3> {
  const ordered = [...notes].sort((a, b) => a.id.localeCompare(b.id))
  const result = new Map<string, Point3>()
  const spacingScale = 1.15
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  ordered.forEach((note, index) => {
    const seed = hash(note.id)
    const angle = index * goldenAngle + (seed % 1000) / 1000 * 0.18
    const radiusVariation = 0.9 + ((seed >>> 20) % 1000) / 5000
    const radius = (2.3 + Math.sqrt(index) * 1.08) * radiusVariation
    const verticalExtent = Math.min(8.4, 4.6 + Math.sqrt(index) * 0.82)
    const y = (((seed >>> 10) % 1000) / 1000 - 0.5) * verticalExtent
    const lateralDrift = ((((seed >>> 5) % 1000) / 1000) - 0.5) * 0.72
    // Give depth its own seeded coordinate instead of deriving it only from the
    // spiral angle. This keeps the front view legible while side views reveal a
    // bounded, irregular cloud rather than a thin spiral sheet.
    const depthDrift = (((seed >>> 16) % 1000) / 1000 - 0.5) * 6.4
    result.set(note.id, [
      (Math.cos(angle) * radius + Math.cos(angle + Math.PI / 2) * lateralDrift) * spacingScale,
      y * spacingScale,
      (Math.sin(angle) * radius + Math.sin(angle + Math.PI / 2) * lateralDrift + depthDrift) * spacingScale,
    ])
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
    CONCEPT: '#a9c2d0', RESOURCE: '#d9ae62', QUESTION: '#cf8170', SUMMARY: '#d9d8cc',
  }
  return colors[type.toUpperCase()] ?? '#a8b0b5'
}
