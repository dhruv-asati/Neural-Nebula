import { useMemo, useState } from 'react'
import type { GalaxyCameraSnapshot, GraphNote, GraphRelationship } from '../types'
import type { Point3 } from '../galaxy/layout'

const typeLabels: Record<string, string> = { CONCEPT: 'Concept', RESOURCE: 'Resource', QUESTION: 'Question', SUMMARY: 'Summary' }

function projectedFrustumFootprint(camera: GalaxyCameraSnapshot, positions: Map<string, Point3>): Array<[number, number]> {
  const [cx, cy, cz] = camera.position
  const [fx, fy, fz] = camera.forward
  const [rx, , rz] = camera.right
  const [ux, , uz] = camera.up
  const tanY = Math.tan(camera.fov * Math.PI / 360)
  const tanX = tanY * camera.aspect
  let nearDepth = Infinity
  let farDepth = 0

  // Bound the frustum against the full graph depth range, not just nodes that
  // happen to be on screen. Otherwise, when zoomed out, the map footprint is
  // clipped to the visible nodes and falsely suggests only a small area is in
  // view. Camera-space depth also keeps the footprint responsive to pan/orbit.
  positions.forEach(([x, y, z]) => {
    const dx = x - cx, dy = y - cy, dz = z - cz
    const depth = dx * fx + dy * fy + dz * fz
    if (depth <= camera.near) return
    nearDepth = Math.min(nearDepth, depth)
    farDepth = Math.max(farDepth, depth)
  })

  if (!Number.isFinite(nearDepth)) {
    const [tx, ty, tz] = camera.target
    const targetDepth = Math.max(camera.near * 2, (tx - cx) * fx + (ty - cy) * fy + (tz - cz) * fz)
    nearDepth = Math.max(camera.near, targetDepth * 0.78)
    farDepth = targetDepth * 1.22
  } else {
    nearDepth = Math.max(camera.near, nearDepth * 0.9)
    farDepth = Math.max(nearDepth + 0.1, farDepth * 1.1)
  }

  const corners: Array<[number, number]> = []
  for (const depth of [nearDepth, farDepth]) {
    for (const screenY of [-1, 1]) {
      for (const screenX of [-1, 1]) {
        const halfWidth = depth * tanX * screenX
        const halfHeight = depth * tanY * screenY
        corners.push([
          cx + fx * depth + rx * halfWidth + ux * halfHeight,
          cz + fz * depth + rz * halfWidth + uz * halfHeight,
        ])
      }
    }
  }

  const sorted = corners.sort((left, right) => left[0] - right[0] || left[1] - right[1])
  const cross = (origin: [number, number], left: [number, number], right: [number, number]) =>
    (left[0] - origin[0]) * (right[1] - origin[1]) - (left[1] - origin[1]) * (right[0] - origin[0])
  const lower: Array<[number, number]> = []
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop()
    lower.push(point)
  }
  const upper: Array<[number, number]> = []
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop()
    upper.push(point)
  }
  return lower.length > 1 && upper.length > 1 ? [...lower.slice(0, -1), ...upper.slice(0, -1)] : sorted
}

export function Hud({ count, status, selected, connectionExplorationFocus, notes, edges, positions, related, camera, panelOpen, focusMode, fullscreen,
  onDeselect, onHome, onResetCamera, onSearch, onTogglePanel, onZoom, onCenterGraph, onFocusMode, onFullscreen,
  onSelectNote, onExploreConnections, onExitConnectionExploration, onNavigate,
}: {
  count: number; status: 'loading' | 'ready' | 'error'; selected: GraphNote | null; connectionExplorationFocus: GraphNote | null; notes: GraphNote[]; edges: GraphRelationship[]
  positions: Map<string, Point3>; related: Array<{ noteId: string; similarity: number }>; camera: GalaxyCameraSnapshot
  panelOpen: boolean; focusMode: boolean; fullscreen: boolean
  onDeselect: () => void; onHome: () => void; onResetCamera: () => void; onSearch: () => void
  onTogglePanel: () => void; onZoom: (direction: -1 | 1) => void; onCenterGraph: () => void
  onFocusMode: () => void; onFullscreen: () => void; onSelectNote: (note: GraphNote) => void
  onExploreConnections: () => void; onExitConnectionExploration: () => void; onNavigate: (section: 'explore' | 'organize' | 'learn' | 'analyze') => void
}) {
  const [detailTab, setDetailTab] = useState<'overview' | 'related' | 'resources' | 'notes'>('overview')
  const [activeSection, setActiveSection] = useState<'explore' | 'organize' | 'learn' | 'analyze'>('explore')
  const statusText = { loading: 'Galaxy Online', ready: 'Galaxy Online', error: 'Signal unavailable' }[status]
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { CONCEPT: 0, RESOURCE: 0, QUESTION: 0, SUMMARY: 0 }
    notes.forEach((note) => {
      const type = note.type.trim().toUpperCase()
      if (Object.hasOwn(counts, type)) counts[type] += 1
    })
    return counts
  }, [notes])
  const resources = useMemo(() => {
    if (!selected) return []
    const linked = new Set(edges.filter((edge) => edge.sourceNoteId === selected.id || edge.targetNoteId === selected.id)
      .map((edge) => edge.sourceNoteId === selected.id ? edge.targetNoteId : edge.sourceNoteId))
    return notes.filter((note) => linked.has(note.id) && note.type.toUpperCase() === 'RESOURCE')
  }, [edges, notes, selected])
  const bounds = useMemo(() => {
    const points = [...positions.values()]
    if (!points.length) return { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }
    return points.reduce((box, point) => ({ minX: Math.min(box.minX, point[0]), maxX: Math.max(box.maxX, point[0]), minZ: Math.min(box.minZ, point[2]), maxZ: Math.max(box.maxZ, point[2]) }),
      { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity })
  }, [positions])
  const spanX = Math.max(1, bounds.maxX - bounds.minX)
  const spanZ = Math.max(1, bounds.maxZ - bounds.minZ)
  const mapBounds = { left: 10, right: 170, top: 8, bottom: 90 }
  const mapCenter = { x: (mapBounds.left + mapBounds.right) / 2, y: (mapBounds.top + mapBounds.bottom) / 2 }
  const graphCenter = { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 }
  // A uniform world-to-map scale keeps the X/Z relationship honest while
  // centering the complete graph inside the mini-map's padded drawing area.
  const mapScale = Math.min((mapBounds.right - mapBounds.left) / spanX, (mapBounds.bottom - mapBounds.top) / spanZ)
  const mapPoint = (point: Point3) => ({ x: mapCenter.x + (point[0] - graphCenter.x) * mapScale, y: mapCenter.y + (point[2] - graphCenter.z) * mapScale })
  const viewportPoints = projectedFrustumFootprint(camera, positions).map(([x, z]) => ({
    x: mapCenter.x + (x - graphCenter.x) * mapScale,
    y: mapCenter.y + (z - graphCenter.z) * mapScale,
  }))
  const noteMap = new Map(notes.map((note) => [note.id, note]))

  return <>
    <header className="masthead">
      <a className="brand" href="/" aria-label="Neural Nebula home" onClick={(event) => { event.preventDefault(); onHome() }}>
        <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
        <span><strong>NEURAL NEBULA</strong><small>KNOWLEDGE ORBITAL</small></span>
      </a>
      <button className="top-search" type="button" onClick={onSearch} aria-label="Search concepts, Ctrl K">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.1"/><path d="m15.4 15.4 4.3 4.3"/></svg><span>Search concepts…</span><kbd>Ctrl + K</kbd>
      </button>
      <div className={`signal signal--${status}`}><span className="signal-dot" />{statusText}</div>
      <div className="node-count"><span>{String(count).padStart(2, '0')}</span><small>NOTES IN ORBIT</small></div>
    </header>

    <div className="legend" aria-label="Note type colors">
      <span><i className="legend-dot concept" />Concept ({categoryCounts.CONCEPT})</span><span><i className="legend-dot resource" />Resource ({categoryCounts.RESOURCE})</span>
      <span><i className="legend-dot question" />Question ({categoryCounts.QUESTION})</span><span><i className="legend-dot summary" />Summary ({categoryCounts.SUMMARY})</span>
    </div>
    {connectionExplorationFocus && <div className="connection-exploration-banner" role="status" aria-live="polite">
      <span>Exploring direct connections from <strong>{connectionExplorationFocus.title}</strong></span>
      <button type="button" onClick={onExitConnectionExploration}>Exit exploration</button>
    </div>}

    <div className="scene-toolbar" aria-label="Galaxy camera controls">
      <button type="button" aria-label={panelOpen ? 'Close control panel' : 'Open control panel'} title={panelOpen ? 'Close control panel' : 'Open control panel'} aria-controls="knowledge-explorer-panel" aria-expanded={panelOpen} onClick={onTogglePanel}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M8 4v16M11 8h6M11 12h6M11 16h4"/></svg>
      </button>
      <button type="button" aria-label="Center the galaxy" title="Center the galaxy" onClick={onCenterGraph}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2"/><path d="M12 1.8v3M12 19.2v3M1.8 12h3M19.2 12h3"/></svg></button>
      <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => onZoom(1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>
      <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => onZoom(-1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg></button>
      <button type="button" aria-label="Reset galaxy view" title="Reset galaxy view" onClick={onResetCamera}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 8.5A8 8 0 1 1 4 14"/><path d="M4.5 4.5v4h4"/></svg></button>
    </div>

    <section className="galaxy-minimap" aria-label="Galaxy overview map">
      <svg viewBox="0 0 180 100" role="img" aria-label={`Map of ${count} notes and ${edges.length} connections`}>
        <defs><clipPath id="minimap-viewport-clip"><rect x={mapBounds.left} y={mapBounds.top} width={mapBounds.right - mapBounds.left} height={mapBounds.bottom - mapBounds.top} /></clipPath></defs>
        {edges.map((edge) => {
          const from = positions.get(edge.sourceNoteId), to = positions.get(edge.targetNoteId)
          if (!from || !to) return null
          const a = mapPoint(from), b = mapPoint(to)
          return <line key={edge.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="minimap-edge" />
        })}
        {notes.map((note) => { const point = positions.get(note.id); if (!point) return null; const p = mapPoint(point); return <circle key={note.id} cx={p.x} cy={p.y} r={note.id === selected?.id ? 2 : 1.25} className={`minimap-node minimap-node--${note.type.toLowerCase()}`} /> })}
        {viewportPoints.length >= 3 && <polygon className="minimap-viewport" points={viewportPoints.map(({ x, y }) => `${x},${y}`).join(' ')} clipPath="url(#minimap-viewport-clip)" />}
      </svg>
      <span>{count} notes · {edges.length} links</span>
    </section>

    {selected && <aside className="note-panel" aria-live="polite" aria-label="Selected note details">
      <button className="note-close" type="button" aria-label="Close note details" onClick={onDeselect}>×</button>
      <div className="note-preview" aria-hidden="true"><div className="note-preview-galaxy"><i/><i/><i/></div></div>
      <h1>{selected.title}</h1>
      <div className={`panel-kicker category-label category-label--${selected.type.toLowerCase()}`}><span>{typeLabels[selected.type.toUpperCase()] ?? selected.type}</span><span>Importance: {selected.importance}/100</span></div>
      <nav className="detail-tabs" aria-label="Note detail sections">
        {(['overview', 'related', 'resources', 'notes'] as const).map((tab) => <button type="button" key={tab} className={detailTab === tab ? 'is-active' : ''} onClick={() => setDetailTab(tab)}>{tab[0].toUpperCase() + tab.slice(1)}</button>)}
      </nav>
      <div className="detail-content" key={detailTab}>
        {detailTab === 'overview' && <>
          <p className="note-content">{selected.content || 'No description has been added to this note yet.'}</p>
          {selected.tags.length > 0 && <section className="detail-subsection"><h2>Key concepts</h2><ul>{selected.tags.slice(0, 4).map((tag) => <li key={tag}>{tag}</li>)}</ul></section>}
          {related.length > 0 && <section className="detail-subsection"><h2>Related concepts</h2><div className="tag-list">{related.slice(0, 3).map(({ noteId }) => { const note = noteMap.get(noteId); return note ? <button key={noteId} onClick={() => onSelectNote(note)}>{note.title}</button> : null })}</div></section>}
        </>}
        {detailTab === 'related' && <div className="detail-note-list">{related.length ? related.slice(0, 8).map(({ noteId, similarity }) => { const note = noteMap.get(noteId); return note ? <button key={noteId} onClick={() => onSelectNote(note)}>{note.title}<small>{Math.round(similarity * 100)}% related</small></button> : null }) : <p className="note-content">No related concepts are available for this note.</p>}</div>}
        {detailTab === 'resources' && <div className="detail-note-list">{resources.length ? resources.map((note) => <button key={note.id} onClick={() => onSelectNote(note)}>{note.title}<small>Resource · connected note</small></button>) : <p className="note-content">No connected resources are available.</p>}</div>}
        {detailTab === 'notes' && <p className="note-content note-content--full">{selected.content || 'This note has no additional notes yet.'}</p>}
      </div>
      <button className="deselect-button explore-connections" onClick={onExploreConnections}><span aria-hidden="true">✧</span> Explore connections <span aria-hidden="true">→</span></button>
    </aside>}

    <footer className="interaction-hint"><span className="hint-cross">✣</span>Drag to orbit <i /> Scroll to zoom <i /> Select a node to inspect</footer>
    <nav className="bottom-dock" aria-label="Explorer sections">
      {(['explore', 'organize', 'learn', 'analyze'] as const).map((section) => <button key={section} type="button" className={section === activeSection ? 'is-active' : ''} onClick={() => { setActiveSection(section); onNavigate(section) }}>
        <svg viewBox="0 0 24 24" aria-hidden="true">{section === 'explore' ? <><path d="m12 2 1.8 7.3L21 12l-7.2 2.7L12 22l-1.8-7.3L3 12l7.2-2.7z"/><circle cx="12" cy="12" r="1.3"/></> : section === 'organize' ? <><path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/></> : section === 'learn' ? <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21z"/><path d="M4 5.5v13A2.5 2.5 0 0 1 6.5 16H20"/></> : <><path d="M4 19h3V9H4zM10.5 19h3V4h-3zM17 19h3v-7h-3z"/></>}</svg><span>{section[0].toUpperCase() + section.slice(1)}</span>
      </button>)}
    </nav>
    <div className="view-actions">
      <button type="button" className={`focus-mode-button${focusMode ? ' is-active' : ''}`} aria-pressed={focusMode} onClick={onFocusMode}><span>Focus Mode</span><i /></button>
      <button type="button" className="fullscreen-button" aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} title={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} onClick={onFullscreen}><svg viewBox="0 0 24 24" aria-hidden="true"><path d={fullscreen ? 'M8 3v5H3M16 3v5h5M8 21v-5H3M16 21v-5h5' : 'M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5'} /></svg></button>
    </div>
  </>
}
