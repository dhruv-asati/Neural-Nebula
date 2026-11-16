import { useEffect, useRef, useState } from 'react'
import { sendAiTutorMessage } from '../api/graph'
import type { AiTutorMessage, GraphNote } from '../types'

const quickPrompts = [
  { label: 'Explain this concept', prompt: (title: string) => `Explain ${title} in simple language, using the note as your starting point.` },
  { label: 'Give me an example', prompt: (title: string) => `Give me a practical example of ${title}.` },
  { label: 'Related concepts', prompt: (title: string) => `How does ${title} connect to the directly related notes? Only use stored direct links when describing graph relationships.` },
  { label: 'Quiz me', prompt: (title: string) => `Quiz me on ${title} with one question at a time. Wait for my answer before revealing the solution.` },
  { label: 'Explain step by step', prompt: (title: string) => `Explain ${title} step by step, including a worked example if appropriate.` },
]

export function AiTutorChat({ note, messages, onMessagesChange }: {
  note: GraphNote; messages: AiTutorMessage[]; onMessagesChange: (messages: AiTutorMessage[]) => void
}) {
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const welcome = `Hi! I'm your AI study assistant. Ask me anything about ${note.title}.`
  const visibleMessages = messages.length ? messages : [{ role: 'ASSISTANT' as const, content: welcome }]

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, loading, error])

  const submit = async (text: string) => {
    const content = text.trim()
    if (!content || loading) return
    setDraft('')
    setError('')
    setLoading(true)
    const before = messages
    onMessagesChange([...before, { role: 'USER', content }])
    try {
      const answer = await sendAiTutorMessage(note.id, content, before)
      onMessagesChange([...before, { role: 'USER', content }, { role: 'ASSISTANT', content: answer }])
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The tutor could not respond. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return <section className="ai-tutor" aria-label={`AI assistance for ${note.title}`}>
    <div className="ai-tutor-toolbar"><span>AI ASSISTANCE · {note.title}</span><button type="button" disabled={loading} onClick={() => { onMessagesChange([]); setError(''); setDraft('') }}>New chat</button></div>
    <div className="ai-tutor-messages" ref={scrollRef} aria-live="polite">
      {visibleMessages.map((message, index) => <div className={`ai-tutor-message ai-tutor-message--${message.role.toLowerCase()}`} key={`${index}-${message.role}`}>
        <span className="ai-tutor-speaker">{message.role === 'USER' ? 'YOU' : 'NEBULA TUTOR'}</span><p>{message.content}</p>
      </div>)}
      {loading && <div className="ai-tutor-typing" role="status"><i/><i/><i/><span>Thinking through the topic…</span></div>}
      {error && <div className="ai-tutor-error" role="alert">{error}</div>}
    </div>
    {!messages.length && <div className="ai-tutor-prompts" aria-label="Suggested questions">
      {quickPrompts.map(({ label, prompt }) => <button key={label} type="button" disabled={loading} onClick={() => void submit(prompt(note.title))}>{label}</button>)}
    </div>}
    <form className="ai-tutor-composer" onSubmit={(event) => { event.preventDefault(); void submit(draft) }}>
      <textarea value={draft} maxLength={4000} aria-label="Ask the AI tutor" placeholder={`Ask about ${note.title}…`} rows={2}
        onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(draft) }
        }} />
      <button type="submit" disabled={loading || !draft.trim()} aria-label="Send message">{loading ? '…' : 'Send'}<span aria-hidden="true"> ↗</span></button>
    </form>
    <small className="ai-tutor-disclaimer">Answers use this note and its direct links. Review important details.</small>
  </section>
}
