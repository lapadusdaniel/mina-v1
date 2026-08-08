import { useEffect, useMemo, useRef, useState } from 'react'
import { HelpCircle, Send, Sparkles, X } from 'lucide-react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'
import './MinaHelpAssistant.css'

const askMinaAssistant = httpsCallable(functions, 'askMinaAssistant')

const QUICK_QUESTIONS = [
  'Cum trimit o galerie clientului?',
  'Cum văd selecția clientului?',
  'Cum protejez galeria cu parolă?',
]

function cleanCallableError(error) {
  const message = String(error?.message || '')
    .replace(/^Firebase:\s*/i, '')
    .replace(/^functions\/[a-z-]+:\s*/i, '')
    .trim()
  return message || 'Nu am putut răspunde acum. Încearcă din nou.'
}

export default function MinaHelpAssistant({ enabled = true, page = 'dashboard', plan = 'Free' }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [question, setQuestion] = useState('')
  const [sending, setSending] = useState(false)
  const inputRef = useRef(null)
  const messagesEndRef = useRef(null)

  const conversationHistory = useMemo(
    () => messages
      .filter((message) => !message.error)
      .slice(-6)
      .map(({ role, content }) => ({ role, content })),
    [messages]
  )

  useEffect(() => {
    if (!open) return
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, open, sending])

  if (!enabled) return null

  const openAssistant = () => {
    setOpen(true)
    window.setTimeout(() => inputRef.current?.focus(), 80)
  }

  const submitQuestion = async (rawQuestion) => {
    const text = String(rawQuestion || '').trim().slice(0, 500)
    if (!text || sending) return

    const history = conversationHistory
    setMessages((current) => [...current, { role: 'user', content: text }])
    setQuestion('')
    setSending(true)

    try {
      const response = await askMinaAssistant({ question: text, history, page, plan })
      const answer = String(response?.data?.answer || '').trim()
      if (!answer) throw new Error('Răspuns gol')
      setMessages((current) => [...current, { role: 'assistant', content: answer }])
    } catch (error) {
      setMessages((current) => [...current, {
        role: 'assistant',
        content: cleanCallableError(error),
        error: true,
      }])
    } finally {
      setSending(false)
      window.setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  return (
    <div className={`mina-help ${open ? 'is-open' : ''}`}>
      {!open && (
        <button type="button" className="mina-help-trigger" onClick={openAssistant} aria-label="Deschide Ajutor Mina">
          <HelpCircle size={18} />
          <span>Ajutor</span>
        </button>
      )}

      {open && (
        <section className="mina-help-panel" aria-label="Ajutor Mina">
          <header className="mina-help-header">
            <div className="mina-help-heading">
              <span className="mina-help-mark"><Sparkles size={15} /></span>
              <div>
                <strong>Ajutor Mina</strong>
                <span>Întreabă despre platformă</span>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Închide Ajutor Mina">
              <X size={17} />
            </button>
          </header>

          <div className="mina-help-conversation" aria-live="polite">
            {messages.length === 0 ? (
              <div className="mina-help-welcome">
                <h3>Cu ce te pot ajuta?</h3>
                <p>Îți explic rapid cum folosești galeriile, selecțiile, site-ul și planul Mina.</p>
                <div className="mina-help-suggestions">
                  {QUICK_QUESTIONS.map((item) => (
                    <button type="button" key={item} onClick={() => submitQuestion(item)}>
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mina-help-messages">
                {messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`mina-help-message is-${message.role}${message.error ? ' is-error' : ''}`}
                  >
                    {message.content}
                  </div>
                ))}
                {sending && <div className="mina-help-message is-assistant is-loading">Mina pregătește răspunsul…</div>}
                <span ref={messagesEndRef} aria-hidden="true" />
              </div>
            )}
          </div>

          <form
            className="mina-help-form"
            onSubmit={(event) => {
              event.preventDefault()
              submitQuestion(question)
            }}
          >
            <div className="mina-help-input-row">
              <input
                ref={inputRef}
                type="text"
                value={question}
                maxLength={500}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Scrie întrebarea…"
                disabled={sending}
                aria-label="Întrebare pentru Ajutor Mina"
              />
              <button type="submit" disabled={sending || !question.trim()} aria-label="Trimite întrebarea">
                <Send size={16} />
              </button>
            </div>
            <p>Nu include parole sau date de card. Răspunsurile pot conține erori.</p>
          </form>
        </section>
      )}
    </div>
  )
}
