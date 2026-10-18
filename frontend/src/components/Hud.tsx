import type { GraphNote } from '../types'

const typeLabels: Record<string, string> = { CONCEPT: 'Concept', RESOURCE: 'Resource', QUESTION: 'Question', SUMMARY: 'Summary' }

export function Hud({ count, status, selected, onDeselect }: {
  count: number; status: 'loading' | 'ready' | 'error'; selected: GraphNote | null; onDeselect: () => void
}) {
  const statusText = { loading: 'Establishing signal', ready: 'Galaxy online', error: 'Signal unavailable' }[status]
  return <>
    <header className="masthead">
      <a className="brand" href="#home" aria-label="Neural Nebula home" onClick={(event) => { event.preventDefault(); onDeselect() }}>
        <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
        <span><strong>NEURAL NEBULA</strong><small>KNOWLEDGE ORBITAL</small></span>
      </a>
      <div className={`signal signal--${status}`}><span className="signal-dot" />{statusText}</div>
      <div className="node-count"><span>{String(count).padStart(2, '0')}</span><small>NOTES IN ORBIT</small></div>
    </header>

    <div className="legend" aria-label="Note type colors">
      <span><i className="legend-dot concept" />Concept</span>
      <span><i className="legend-dot resource" />Resource</span>
      <span><i className="legend-dot question" />Question</span>
      <span><i className="legend-dot summary" />Summary</span>
    </div>

    {selected && <aside className="note-panel" aria-live="polite" aria-label="Selected note details">
      <div className="panel-kicker"><span>NODE IDENTIFIED</span><span className="panel-star">✳</span></div>
      <h1>{selected.title}</h1>
      <p className="note-type">{typeLabels[selected.type.toUpperCase()] ?? selected.type}</p>
      {selected.content && <p className="note-content">{selected.content}</p>}
      <div className="note-meta"><span>IMPORTANCE</span><strong>{selected.importance}<small> / 100</small></strong></div>
      {selected.tags.length > 0 && <div className="tag-list">{selected.tags.slice(0, 5).map((tag) => <span key={tag}>{tag}</span>)}</div>}
      <button className="deselect-button" onClick={onDeselect}>← &nbsp;Return to galaxy</button>
    </aside>}

    <footer className="interaction-hint"><span className="hint-cross">✣</span>Drag to orbit <i /> Scroll to zoom <i /> Select a node to inspect</footer>
  </>
}
