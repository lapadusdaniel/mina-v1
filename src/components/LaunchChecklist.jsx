import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Circle, Copy } from 'lucide-react'

const MANUAL_TASKS = [
  { id: 'checkout-pro', label: 'Am testat checkout Pro cap-coada' },
  { id: 'checkout-studio', label: 'Am testat checkout Studio cap-coada' },
  { id: 'worker-delete', label: 'Am verificat ca delete galerie sterge fisierele din R2' },
  { id: 'qa-public', label: 'Am rulat QA public pe URL-ul live' },
]

const STORAGE_KEY = 'mina-launch-checklist-v1'

function readManualState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (_) {
    return {}
  }
}

function checkStatusBadge(ok) {
  return ok ? (
    <span className="launch-check-status launch-check-status--ok">
      <CheckCircle2 size={14} />
      OK
    </span>
  ) : (
    <span className="launch-check-status launch-check-status--warn">
      <AlertTriangle size={14} />
      Atenție
    </span>
  )
}

function QuickCommand({ command }) {
  const [copied, setCopied] = useState(false)

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch (_) {
    }
  }

  return (
    <div className="launch-cmd-row">
      <code>{command}</code>
      <button type="button" onClick={onCopy} className="launch-cmd-copy">
        <Copy size={14} />
        {copied ? 'Copiat' : 'Copiază'}
      </button>
    </div>
  )
}

export default function LaunchChecklist() {
  const [manualState, setManualState] = useState(() => readManualState())

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(manualState))
  }, [manualState])

  const checks = useMemo(() => {
    const firebaseProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || ''
    const firebaseAuthDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || ''
    const workerUrl = import.meta.env.VITE_R2_WORKER_URL || ''
    const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || ''
    const stripeStarter = import.meta.env.VITE_STRIPE_PRICE_STARTER || ''
    const stripePro = import.meta.env.VITE_STRIPE_PRICE_PRO || ''
    const stripeStudio = import.meta.env.VITE_STRIPE_PRICE_STUDIO || import.meta.env.VITE_STRIPE_PRICE_UNLIMITED || ''

    const firebaseOk = Boolean(firebaseProjectId && firebaseAuthDomain)
    const workerOk = /^https:\/\//i.test(workerUrl)
    const stripeConfigured = Boolean(stripeKey && stripeStarter && stripePro && stripeStudio)
    const stripeLive =
      stripeConfigured &&
      stripeKey.startsWith('pk_live_') &&
      stripeStarter.startsWith('price_') &&
      stripePro.startsWith('price_') &&
      stripeStudio.startsWith('price_')

    return [
      {
        id: 'firebase',
        label: 'Config Firebase',
        details: firebaseOk
          ? `Project: ${firebaseProjectId}`
          : 'Lipsește config Firebase în .env',
        ok: firebaseOk,
      },
      {
        id: 'worker',
        label: 'Config R2 Worker',
        details: workerOk ? workerUrl : 'Lipsește sau nu e URL HTTPS valid',
        ok: workerOk,
      },
      {
        id: 'stripe',
        label: 'Stripe live config',
        details: stripeLive
          ? 'Publishable key + price IDs sunt setate pentru live'
          : stripeConfigured
            ? 'Stripe este configurat, dar nu pare în live mode'
            : 'Lipsesc variabile Stripe în .env',
        ok: stripeLive,
      },
    ]
  }, [])

  const autoPassed = checks.filter((c) => c.ok).length
  const manualPassed = MANUAL_TASKS.filter((t) => manualState[t.id] === true).length
  const total = checks.length + MANUAL_TASKS.length
  const completed = autoPassed + manualPassed
  const percent = Math.round((completed / total) * 100)

  return (
    <div className="dashboard-content">
      <section className="launch-check-wrap">
        <header className="launch-check-header">
          <div>
            <h2 className="dashboard-section-title">Checklist lansare</h2>
            <p className="launch-check-sub">
              Un singur loc unde vezi clar dacă Mina e gata de live.
            </p>
          </div>
          <div className="launch-check-progress">
            <span>{completed}/{total}</span>
            <strong>{percent}%</strong>
          </div>
        </header>

        <div className="launch-check-grid">
          <article className="launch-check-card">
            <h3>Verificări automate</h3>
            <div className="launch-check-list">
              {checks.map((check) => (
                <div key={check.id} className="launch-check-item">
                  <div>
                    <p className="launch-check-item-title">{check.label}</p>
                    <p className="launch-check-item-details">{check.details}</p>
                  </div>
                  {checkStatusBadge(check.ok)}
                </div>
              ))}
            </div>
          </article>

          <article className="launch-check-card">
            <h3>Confirmări manuale</h3>
            <div className="launch-manual-list">
              {MANUAL_TASKS.map((task) => {
                const checked = manualState[task.id] === true
                return (
                  <button
                    key={task.id}
                    type="button"
                    className={`launch-manual-item ${checked ? 'is-checked' : ''}`}
                    onClick={() =>
                      setManualState((prev) => ({ ...prev, [task.id]: !checked }))
                    }
                  >
                    {checked ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                    <span>{task.label}</span>
                  </button>
                )
              })}
            </div>
          </article>
        </div>

        <article className="launch-check-card launch-check-card--commands">
          <h3>Comenzi rapide lansare</h3>
          <QuickCommand command="npm run preflight:live" />
          <QuickCommand command={'FIREBASE_PROJECT_ID="mina-v1-aea51" npm run deploy:rules'} />
          <QuickCommand command={'FIREBASE_PROJECT_ID="mina-v1-aea51" npm run deploy:hosting'} />
          <QuickCommand command="npm run deploy:worker && npm run qa:worker" />
          <QuickCommand command="npm run qa:public -- https://mina-v1-aea51.web.app" />
        </article>
      </section>
    </div>
  )
}
