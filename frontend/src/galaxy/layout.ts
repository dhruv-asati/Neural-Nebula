import type { GraphNote, GraphRelationship } from '../types'

export type Point3 = [number, number, number]

function hash(value: string): number {
  let result = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    result ^= value.charCodeAt(i)
    result = Math.imul(result, 16777619)
  }
  return result >>> 0
}

/** Deterministic graph clusters for presentation only; graph data remains backend-owned. */
export function createGalaxyLayout(notes: GraphNote[], edges: GraphRelationship[] = []): Map<string, Point3> {
  const ordered = [...notes].sort((a, b) => a.id.localeCompare(b.id))
  const result = new Map<string, Point3>()
  if (!ordered.length) return result
  const ids = new Set(ordered.map((note) => note.id))
  const neighbors = new Map(ordered.map((note) => [note.id, new Set<string>()]))
  for (const edge of edges) {
    if (!ids.has(edge.sourceNoteId) || !ids.has(edge.targetNoteId)) continue
    neighbors.get(edge.sourceNoteId)?.add(edge.targetNoteId)
    neighbors.get(edge.targetNoteId)?.add(edge.sourceNoteId)
  }

  const distancesFrom = (start: string) => {
    const distances = new Map([[start, 0]])
    const queue = [start]
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index]
      for (const neighbor of neighbors.get(current) ?? []) {
        if (distances.has(neighbor)) continue
        distances.set(neighbor, (distances.get(current) ?? 0) + 1)
        queue.push(neighbor)
      }
    }
    return distances
  }

  const components: GraphNote[][] = []
  const componentById = new Map<string, number>()
  for (const note of ordered) {
    if (componentById.has(note.id)) continue
    const componentIndex = components.length
    const queue = [note.id]
    componentById.set(note.id, componentIndex)
    const members: GraphNote[] = []
    for (let index = 0; index < queue.length; index += 1) {
      const currentId = queue[index]
      const current = ordered.find((candidate) => candidate.id === currentId)
      if (current) members.push(current)
      for (const neighbor of neighbors.get(currentId) ?? []) {
        if (componentById.has(neighbor)) continue
        componentById.set(neighbor, componentIndex)
        queue.push(neighbor)
      }
    }
    components.push(members)
  }

  const clusterCount = Math.min(ordered.length, Math.max(1, Math.ceil(Math.sqrt(ordered.length / 0.7))))
  const anchors: string[] = []
  const anchorDistances: Map<string, number>[] = []
  const anchorComponent: number[] = []
  const componentOrder = components
    .map((members, index) => ({ index, members }))
    .sort((a, b) => b.members.length - a.members.length || a.members[0].id.localeCompare(b.members[0].id))

  // Give each reachable component a home first. Remaining cluster centers are
  // chosen farthest-first within already represented components.
  for (const { index: componentIndex, members } of componentOrder.slice(0, clusterCount)) {
    const anchor = [...members].sort((a, b) =>
      (neighbors.get(b.id)?.size ?? 0) - (neighbors.get(a.id)?.size ?? 0) || a.id.localeCompare(b.id),
    )[0]
    anchors.push(anchor.id)
    anchorDistances.push(distancesFrom(anchor.id))
    anchorComponent.push(componentIndex)
  }
  while (anchors.length < clusterCount) {
    let bestId = ''
    let bestScore = -Infinity
    for (const note of ordered) {
      if (anchors.includes(note.id)) continue
      const componentIndex = componentById.get(note.id) ?? -1
      const componentAnchors = anchorDistances
        .map((distance, index) => ({ distance: distance.get(note.id), index }))
        .filter((entry) => entry.distance !== undefined && anchorComponent[entry.index] === componentIndex)
      const nearestDistance = componentAnchors.length
        ? Math.min(...componentAnchors.map((entry) => entry.distance!))
        : ordered.length + 1
      const score = nearestDistance * 10 + (neighbors.get(note.id)?.size ?? 0) * 0.08 + (hash(note.id) % 1000) / 100000
      if (score > bestScore) { bestScore = score; bestId = note.id }
    }
    if (!bestId) break
    anchors.push(bestId)
    anchorDistances.push(distancesFrom(bestId))
    anchorComponent.push(componentById.get(bestId) ?? -1)
  }

  const clusters = anchors.map(() => [] as GraphNote[])
  const anchorNotes = anchors.map((id) => ordered.find((note) => note.id === id)!)
  const tagSimilarity = (left: GraphNote, right: GraphNote) => {
    const leftTags = new Set(left.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))
    const rightTags = new Set(right.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))
    if (!leftTags.size && !rightTags.size) return left.type === right.type ? 1 : 0
    let intersection = 0
    leftTags.forEach((tag) => { if (rightTags.has(tag)) intersection += 1 })
    return intersection / Math.max(1, leftTags.size + rightTags.size - intersection)
  }
  const notesByComponent = components.map((members) => members)
  notesByComponent.forEach((members, componentIndex) => {
    const clusterIndices = anchors.flatMap((_, index) => anchorComponent[index] === componentIndex ? [index] : [])
    if (!clusterIndices.length) {
      const target = anchorNotes
        .map((anchor, index) => ({ index, similarity: tagSimilarity(members[0], anchor) }))
        .sort((a, b) => b.similarity - a.similarity || a.index - b.index)[0]?.index ?? 0
      clusters[target].push(...members)
      return
    }

    const capacities = new Map<number, number>()
    const baseCapacity = Math.floor(members.length / clusterIndices.length)
    let remainder = members.length % clusterIndices.length
    clusterIndices.forEach((clusterIndex) => {
      capacities.set(clusterIndex, baseCapacity + (remainder-- > 0 ? 1 : 0))
      clusters[clusterIndex].push(anchorNotes[clusterIndex])
    })

    const remaining = members.filter((note) => !anchors.includes(note.id)).sort((a, b) => {
      const nearestA = Math.min(...clusterIndices.map((index) => anchorDistances[index].get(a.id) ?? Infinity))
      const nearestB = Math.min(...clusterIndices.map((index) => anchorDistances[index].get(b.id) ?? Infinity))
      return nearestA - nearestB || a.id.localeCompare(b.id)
    })
    remaining.forEach((note) => {
      const target = clusterIndices
        .filter((index) => clusters[index].length < (capacities.get(index) ?? 0))
        .map((index) => ({
          index,
          distance: anchorDistances[index].get(note.id) ?? Infinity,
          similarity: tagSimilarity(note, anchorNotes[index]),
          fill: clusters[index].length / Math.max(1, capacities.get(index) ?? 1),
        }))
        .sort((a, b) => a.distance - b.distance || b.similarity - a.similarity || a.fill - b.fill || a.index - b.index)[0]
      if (target) clusters[target.index].push(note)
    })
  })

  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  clusters.forEach((members, clusterIndex) => {
    const anchor = anchors[clusterIndex]
    if (!anchor || !members.length) return
    const sphereY = 1 - 2 * (clusterIndex + 0.5) / clusters.length
    const planarRadius = Math.sqrt(Math.max(0, 1 - sphereY * sphereY))
    const angle = clusterIndex * goldenAngle + ((hash(anchor) % 1000) / 1000 - 0.5) * 0.28
    const centerRadius = 8.7 + ((hash(`${anchor}:radius`) >>> 8) % 1000) / 1000 * 1.25
    const centerYJitter = (((hash(`${anchor}:vertical`) >>> 8) % 1000) / 1000 - 0.5) * 1.8
    const center: Point3 = [
      Math.cos(angle) * planarRadius * centerRadius,
      sphereY * centerRadius * 0.62 + centerYJitter,
      Math.sin(angle) * planarRadius * centerRadius,
    ]
    const distances = anchorDistances[clusterIndex]
    members.sort((a, b) => (distances.get(a.id) ?? 99) - (distances.get(b.id) ?? 99) || a.id.localeCompare(b.id))
    members.forEach((note, memberIndex) => {
      const seed = hash(note.id)
      const localAngle = memberIndex * goldenAngle + (seed % 1000) / 1000 * 0.32
      const localRadius = memberIndex === 0 ? 0 : 2.5 + Math.sqrt(memberIndex) * 1.2
      const vertical = (((seed >>> 10) % 1000) / 1000 - 0.5) * 5.2
      const depth = (((seed >>> 16) % 1000) / 1000 - 0.5) * 4.8
      result.set(note.id, [
        center[0] + Math.cos(localAngle) * localRadius,
        center[1] + vertical,
        center[2] + Math.sin(localAngle) * localRadius + depth,
      ])
    })
  })

  // A small deterministic 3D relaxation pass removes near-overlaps while
  // preserving each graph neighborhood's general location.
  const spacing = 1.8
  const idsInOrder = ordered.map((note) => note.id)
  for (let iteration = 0; iteration < 34; iteration += 1) {
    const adjustments = new Map(idsInOrder.map((id) => [id, [0, 0, 0] as Point3]))
    for (let leftIndex = 0; leftIndex < idsInOrder.length; leftIndex += 1) {
      const leftId = idsInOrder[leftIndex]
      const left = result.get(leftId)
      if (!left) continue
      for (let rightIndex = leftIndex + 1; rightIndex < idsInOrder.length; rightIndex += 1) {
        const rightId = idsInOrder[rightIndex]
        const right = result.get(rightId)
        if (!right) continue
        let dx = right[0] - left[0]
        let dy = right[1] - left[1]
        let dz = right[2] - left[2]
        let distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (distance >= spacing) continue
        if (distance < 0.0001) {
          const seed = hash(`${leftId}:${rightId}`)
          const angle = (seed % 1000) / 1000 * Math.PI * 2
          dx = Math.cos(angle)
          dy = (((seed >>> 10) % 1000) / 1000 - 0.5) * 0.7
          dz = Math.sin(angle)
          distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
        }
        const push = (spacing - distance) * 0.32 / distance
        const leftAdjustment = adjustments.get(leftId)!
        const rightAdjustment = adjustments.get(rightId)!
        leftAdjustment[0] -= dx * push
        leftAdjustment[1] -= dy * push
        leftAdjustment[2] -= dz * push
        rightAdjustment[0] += dx * push
        rightAdjustment[1] += dy * push
        rightAdjustment[2] += dz * push
      }
    }
    idsInOrder.forEach((id) => {
      const position = result.get(id)
      const adjustment = adjustments.get(id)
      if (!position || !adjustment) return
      const length = Math.hypot(...adjustment)
      const scale = length > 0.26 ? 0.26 / length : 1
      result.set(id, [
        position[0] + adjustment[0] * scale,
        position[1] + adjustment[1] * scale,
        position[2] + adjustment[2] * scale,
      ])
    })
  }

  // The 3D relaxation above can still leave nodes crowded in a top-down view
  // when they differ mostly by height. Add a second, deterministic XZ-only
  // spacing pass so the projected galaxy also has room between its nodes.
  const projectedSpacing = 4.4
  for (let iteration = 0; iteration < 30; iteration += 1) {
    const adjustments = new Map(idsInOrder.map((id) => [id, [0, 0] as [number, number]]))
    for (let leftIndex = 0; leftIndex < idsInOrder.length; leftIndex += 1) {
      const leftId = idsInOrder[leftIndex]
      const left = result.get(leftId)
      if (!left) continue
      for (let rightIndex = leftIndex + 1; rightIndex < idsInOrder.length; rightIndex += 1) {
        const rightId = idsInOrder[rightIndex]
        const right = result.get(rightId)
        if (!right) continue
        let dx = right[0] - left[0]
        let dz = right[2] - left[2]
        let distance = Math.hypot(dx, dz)
        if (distance >= projectedSpacing) continue
        if (distance < 0.0001) {
          const angle = (hash(`${leftId}:${rightId}:xz`) % 1000) / 1000 * Math.PI * 2
          dx = Math.cos(angle)
          dz = Math.sin(angle)
          distance = 1
        }
        const push = (projectedSpacing - distance) * 0.3 / distance
        const leftAdjustment = adjustments.get(leftId)!
        const rightAdjustment = adjustments.get(rightId)!
        leftAdjustment[0] -= dx * push
        leftAdjustment[1] -= dz * push
        rightAdjustment[0] += dx * push
        rightAdjustment[1] += dz * push
      }
    }
    idsInOrder.forEach((id) => {
      const position = result.get(id)
      const adjustment = adjustments.get(id)
      if (!position || !adjustment) return
      const length = Math.hypot(...adjustment)
      const scale = length > 0.24 ? 0.24 / length : 1
      result.set(id, [position[0] + adjustment[0] * scale, position[1], position[2] + adjustment[1] * scale])
    })
  }
  // Preserve the established cluster shapes while expanding the whole layout
  // in the horizontal plane. This is what remains visible from an overhead
  // camera, where height differences alone cannot separate nodes.
  const center = idsInOrder.reduce((sum, id) => {
    const point = result.get(id)
    return point ? [sum[0] + point[0], sum[1] + point[1], sum[2] + point[2]] as Point3 : sum
  }, [0, 0, 0] as Point3).map((value) => value / idsInOrder.length) as Point3
  idsInOrder.forEach((id) => {
    const point = result.get(id)
    if (!point) return
    result.set(id, [
      center[0] + (point[0] - center[0]) * 1.85,
      center[1] + (point[1] - center[1]) * 1.3,
      center[2] + (point[2] - center[2]) * 1.85,
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
    CONCEPT: '#9ecdf3', RESOURCE: '#e4c27f', QUESTION: '#d58ab7', SUMMARY: '#e1e8ec',
  }
  return colors[type.toUpperCase()] ?? '#ccd6da'
}
