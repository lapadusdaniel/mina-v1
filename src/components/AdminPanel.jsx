import { useState, useEffect } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, Images, CreditCard, MessageSquare,
  Settings, LogOut, X, Search, TrendingUp,
  CheckCircle, Ban, Trash2, Edit3, Eye
} from 'lucide-react'
import { getAppServices } from '../core/bootstrap/appBootstrap'
import { getGalleryPublicPath } from '../utils/publicLinks'
import './AdminPanel.css'

const appServices = getAppServices()
const adminService = appServices.admin
const authService = appServices.auth

// ── Constante ─────────────────────────────────
function hasAdminAccess(user) {
  if (!user) return false
  return user.role === 'admin' || user.isAdmin === true
}

const PLAN_PRICES = {
  [import.meta.env.VITE_STRIPE_PRICE_STARTER || 'price_1T6a3S1ax2jGrLZHmevohZWA']: 'Starter',
  [import.meta.env.VITE_STRIPE_PRICE_PRO || 'price_1T6a4F1ax2jGrLZH92vUsGzE']: 'Pro',
  [import.meta.env.VITE_STRIPE_PRICE_STUDIO || 'price_1T6a501ax2jGrLZHgLBbkzT4']: 'Studio',
}

const STRIPE_PRICE_STARTER = import.meta.env.VITE_STRIPE_PRICE_STARTER || 'price_1T6a3S1ax2jGrLZHmevohZWA'
const STRIPE_PRICE_PRO = import.meta.env.VITE_STRIPE_PRICE_PRO || 'price_1T6a4F1ax2jGrLZH92vUsGzE'
const STRIPE_PRICE_STUDIO = import.meta.env.VITE_STRIPE_PRICE_STUDIO || 'price_1T6a501ax2jGrLZHgLBbkzT4'

// ── Helpers ───────────────────────────────────
const formatDate = (val) => {
  if (!val) return '—'
  const d = val?.toDate?.() || (typeof val === 'string' ? new Date(val) : val)
  if (!(d instanceof Date) || isNaN(d)) return '—'
  return d.toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' })
}

function PlanBadge({ plan }) {
  const normalizedPlan = plan === 'Unlimited' ? 'Studio' : plan
  const cls = normalizedPlan === 'Pro'
    ? 'ap-badge-plan--pro'
    : normalizedPlan === 'Studio'
      ? 'ap-badge-plan--studio'
      : normalizedPlan === 'Starter'
        ? 'ap-badge-plan--starter'
        : 'ap-badge-plan--free'
  return <span className={`ap-badge-plan ${cls}`}>{normalizedPlan || 'Free'}</span>
}

function StatusBadge({ status }) {
  const map = { active: 'ap-badge-status--active', inactive: 'ap-badge-status--inactive', suspended: 'ap-badge-status--suspended' }
  const label = { active: 'Activ', inactive: 'Inactiv', suspended: 'Suspendat' }
  return <span className={`ap-badge-status ${map[status] || 'ap-badge-status--inactive'}`}>{label[status] || 'Inactiv'}</span>
}

// ── Modal schimbare plan ──────────────────────
function ChangePlanModal({ user, onClose, onSave }) {
  const [plan, setPlan] = useState(user.plan || 'Free')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(user.uid, plan)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="ap-modal-overlay" onClick={onClose}>
      <div className="ap-modal" onClick={e => e.stopPropagation()}>
        <div className="ap-modal-header">
          <h3 className="ap-modal-title">Schimbă planul</h3>
          <button className="ap-modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="ap-modal-body">
          <div style={{ fontSize: '13.5px', color: '#86868b', fontWeight: 300 }}>
            Utilizator: <strong style={{ color: '#1d1d1f', fontWeight: 500 }}>{user.email}</strong>
          </div>
          <div className="ap-modal-field">
            <label>Plan nou</label>
            <select className="ap-modal-select" value={plan} onChange={e => setPlan(e.target.value)}>
              <option value="Free">Free (30 GB)</option>
              <option value="Starter">Starter (150 GB)</option>
              <option value="Pro">Pro (600 GB)</option>
              <option value="Studio">Studio (2 TB)</option>
            </select>
          </div>
          <div style={{ padding: '12px 14px', background: '#f5f5f7', borderRadius: '10px', fontSize: '12.5px', fontWeight: 300, color: '#6e6e73' }}>
            ⚠️ Această schimbare e manuală și nu modifică abonamentul Stripe al utilizatorului.
          </div>
        </div>
        <div className="ap-modal-footer">
          <button className="ap-btn ap-btn--ghost" onClick={onClose}>Anulează</button>
          <button className="ap-btn ap-btn--primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Se salvează...' : 'Salvează'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal detalii utilizator ──────────────────
function UserDetailModal({ user, onClose }) {
  return (
    <div className="ap-modal-overlay" onClick={onClose}>
      <div className="ap-modal" style={{ maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
        <div className="ap-modal-header">
          <h3 className="ap-modal-title">Detalii utilizator</h3>
          <button className="ap-modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="ap-modal-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingBottom: 16, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
            <div className="ap-user-avatar" style={{ width: 48, height: 48, fontSize: 18 }}>
              {(user.email || 'U').charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 500, fontSize: '15px', color: '#1d1d1f', marginBottom: 3 }}>{user.brandName || user.name || '—'}</div>
              <div style={{ fontSize: '13px', fontWeight: 300, color: '#86868b' }}>{user.email}</div>
            </div>
            <div style={{ marginLeft: 'auto' }}><PlanBadge plan={user.plan} /></div>
          </div>

          {[
            ['UID', user.uid],
            ['Nume', user.name || '—'],
            ['Brand', user.brandName || '—'],
            ['Rol', user.isAdmin ? 'admin' : (user.role || 'user')],
            ['Înregistrat', formatDate(user.createdAt)],
            ['Galerii', user.galeriiCount ?? '—'],
            ['Status', user.status || 'active'],
            ['Plan manual', user.planOverride || 'Nu'],
          ].map(([label, val]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', paddingBottom: 10, borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
              <span style={{ fontWeight: 300, color: '#86868b' }}>{label}</span>
              <span style={{ fontWeight: 400, color: '#1d1d1f' }}>{String(val)}</span>
            </div>
          ))}
        </div>
        <div className="ap-modal-footer">
          <button className="ap-btn ap-btn--ghost" onClick={onClose}>Închide</button>
        </div>
      </div>
    </div>
  )
}

// ── Secțiunea Overview ────────────────────────
function OverviewSection({ stats }) {
  return (
    <div>
      <div className="ap-page-header">
        <h1 className="ap-page-title">Overview</h1>
        <p className="ap-page-sub">Situația platformei în timp real</p>
      </div>

      <div className="ap-stats-grid">
        <div className="ap-stat-card">
          <div className="ap-stat-label"><Users size={13} /> Utilizatori totali</div>
          <div className={`ap-stat-value ${stats.loading ? '' : 'ap-stat-value--gold'}`}>
            {stats.loading ? '...' : stats.totalUsers}
          </div>
          <div className="ap-stat-trend">înregistrați pe platformă</div>
        </div>

        <div className="ap-stat-card">
          <div className="ap-stat-label"><Images size={13} /> Galerii active</div>
          <div className="ap-stat-value">{stats.loading ? '...' : stats.totalGalerii}</div>
          <div className="ap-stat-trend">din {stats.totalGaleriiAll} totale</div>
        </div>

        <div className="ap-stat-card">
          <div className="ap-stat-label"><CreditCard size={13} /> Abonamente plătite</div>
          <div className={`ap-stat-value ${stats.loading ? '' : 'ap-stat-value--green'}`}>
            {stats.loading ? '...' : stats.paidUsers}
          </div>
          <div className="ap-stat-trend">
            <div className="ap-plan-pills">
              <span className="ap-plan-pill ap-plan-pill--starter">Starter: {stats.starterUsers}</span>
              <span className="ap-plan-pill ap-plan-pill--pro">Pro: {stats.proUsers}</span>
              <span className="ap-plan-pill ap-plan-pill--studio">Studio: {stats.studioUsers}</span>
            </div>
          </div>
        </div>

        <div className="ap-stat-card">
          <div className="ap-stat-label"><MessageSquare size={13} /> Mesaje noi</div>
          <div className={`ap-stat-value ${stats.newMessages > 0 ? 'ap-stat-value--red' : ''}`}>
            {stats.loading ? '...' : stats.newMessages}
          </div>
          <div className="ap-stat-trend">necitite de la clienți</div>
        </div>
      </div>

      <div className="ap-card">
        <div className="ap-card-header">
          <span className="ap-card-title">Distribuție planuri</span>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {[
            { label: 'Free', count: stats.freeUsers, color: '#e5e5e7', pct: stats.totalUsers ? Math.round((stats.freeUsers / stats.totalUsers) * 100) : 0 },
            { label: 'Starter', count: stats.starterUsers, color: '#6e6e73', pct: stats.totalUsers ? Math.round((stats.starterUsers / stats.totalUsers) * 100) : 0 },
            { label: 'Pro', count: stats.proUsers, color: '#b8965a', pct: stats.totalUsers ? Math.round((stats.proUsers / stats.totalUsers) * 100) : 0 },
            { label: 'Studio', count: stats.studioUsers, color: '#2e7d32', pct: stats.totalUsers ? Math.round((stats.studioUsers / stats.totalUsers) * 100) : 0 },
          ].map(({ label, count, color, pct }) => (
            <div key={label} style={{ flex: 1, minWidth: 140 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: '13px', fontWeight: 400, color: '#1d1d1f' }}>{label}</span>
                <span style={{ fontSize: '13px', fontWeight: 500, color: '#1d1d1f' }}>{count} <span style={{ color: '#a1a1a6', fontWeight: 300 }}>({pct}%)</span></span>
              </div>
              <div style={{ height: 4, background: '#f0f0f5', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.6s' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Secțiunea Utilizatori ─────────────────────
function UsersSection({ users, loading, onChangePlan, onToggleSuspend, onToggleAdmin, onDelete, currentAdminUid }) {
  const [search, setSearch] = useState('')
  const [filterPlan, setFilterPlan] = useState('all')
  const [selectedUser, setSelectedUser] = useState(null)
  const [changePlanUser, setChangePlanUser] = useState(null)

  const filtered = users.filter(u => {
    const matchSearch = !search ||
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.brandName?.toLowerCase().includes(search.toLowerCase()) ||
      u.name?.toLowerCase().includes(search.toLowerCase())
    const matchPlan = filterPlan === 'all' || u.plan === filterPlan
    return matchSearch && matchPlan
  })

  return (
    <div>
      <div className="ap-page-header">
        <h1 className="ap-page-title">Utilizatori</h1>
        <p className="ap-page-sub">{users.length} fotografi înregistrați</p>
      </div>

      <div className="ap-card">
        <div className="ap-card-header">
          <span className="ap-card-title">Toți fotografii</span>
          <div className="ap-card-actions">
            <div className="ap-search">
              <Search size={13} color="#a1a1a6" />
              <input placeholder="Caută email, brand sau nume..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="ap-filter-select" value={filterPlan} onChange={e => setFilterPlan(e.target.value)}>
              <option value="all">Toate planurile</option>
              <option value="Free">Free</option>
              <option value="Starter">Starter</option>
              <option value="Pro">Pro</option>
              <option value="Studio">Studio</option>
            </select>
          </div>
        </div>

        <div className="ap-table-wrap">
          {loading ? (
            <div className="ap-table-loading">Se încarcă...</div>
          ) : filtered.length === 0 ? (
            <div className="ap-table-empty">Niciun utilizator găsit.</div>
          ) : (
            <table className="ap-table">
              <thead>
                <tr>
                  <th>Utilizator</th>
                  <th>Rol</th>
                  <th>Plan</th>
                  <th>Galerii</th>
                  <th>Status</th>
                  <th>Înregistrat</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.uid}>
                    <td>
                      <div className="ap-user-info">
                        <div className="ap-user-avatar">{(u.email || 'U').charAt(0).toUpperCase()}</div>
                        <div>
                          <div className="ap-user-name">{u.brandName || u.name || '—'}</div>
                          <div className="ap-user-email">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`ap-badge-status ${u.isAdmin ? 'ap-badge-status--active' : 'ap-badge-status--inactive'}`}>
                        {u.isAdmin ? 'Admin' : 'User'}
                      </span>
                    </td>
                    <td><PlanBadge plan={u.plan} /></td>
                    <td style={{ fontSize: '13.5px', color: '#3a3a3c' }}>{u.galeriiCount ?? '—'}</td>
                    <td><StatusBadge status={u.status || 'active'} /></td>
                    <td style={{ fontSize: '12.5px', color: '#86868b', fontWeight: 300 }}>{formatDate(u.createdAt)}</td>
                    <td>
                      <div className="ap-row-actions">
                        <button className="ap-row-btn" title="Detalii" onClick={() => setSelectedUser(u)}>
                          <Eye size={14} />
                        </button>
                        <button className="ap-row-btn ap-row-btn--gold" title="Schimbă planul" onClick={() => setChangePlanUser(u)}>
                          <Edit3 size={14} />
                        </button>
                        <button
                          className="ap-row-btn ap-row-btn--danger"
                          title={u.status === 'suspended' ? 'Reactivează' : 'Suspendă'}
                          onClick={() => onToggleSuspend(u)}
                        >
                          {u.status === 'suspended' ? <CheckCircle size={14} /> : <Ban size={14} />}
                        </button>
                        <button
                          className="ap-row-btn ap-row-btn--gold"
                          title={u.isAdmin ? 'Revocă drepturi admin' : 'Promovează admin'}
                          onClick={() => onToggleAdmin(u)}
                          disabled={u.uid === currentAdminUid && u.isAdmin}
                        >
                          <Settings size={14} />
                        </button>
                        <button className="ap-row-btn ap-row-btn--danger" title="Șterge cont" onClick={() => onDelete(u)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selectedUser && <UserDetailModal user={selectedUser} onClose={() => setSelectedUser(null)} />}
      {changePlanUser && (
        <ChangePlanModal
          user={changePlanUser}
          onClose={() => setChangePlanUser(null)}
          onSave={onChangePlan}
        />
      )}
    </div>
  )
}

// ── Secțiunea Galerii ─────────────────────────
function GaleriiSection({ galerii, loading }) {
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('active')

  const filtered = galerii.filter(g => {
    const matchSearch = !search || g.nume?.toLowerCase().includes(search.toLowerCase()) || g.slug?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus === 'all' || g.status === filterStatus || (!g.status && filterStatus === 'active')
    return matchSearch && matchStatus
  })

  return (
    <div>
      <div className="ap-page-header">
        <h1 className="ap-page-title">Galerii</h1>
        <p className="ap-page-sub">{galerii.length} galerii pe platformă</p>
      </div>

      <div className="ap-card">
        <div className="ap-card-header">
          <span className="ap-card-title">Toate galeriile</span>
          <div className="ap-card-actions">
            <div className="ap-search">
              <Search size={13} color="#a1a1a6" />
              <input placeholder="Caută galerie..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="ap-filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="all">Toate</option>
              <option value="active">Active</option>
              <option value="trash">Coș de gunoi</option>
            </select>
          </div>
        </div>

        <div className="ap-table-wrap">
          {loading ? (
            <div className="ap-table-loading">Se încarcă...</div>
          ) : filtered.length === 0 ? (
            <div className="ap-table-empty">Nicio galerie găsită.</div>
          ) : (
            <table className="ap-table">
              <thead>
                <tr>
                  <th>Galerie</th>
                  <th>Fotograf</th>
                  <th>Poze</th>
                  <th>Status</th>
                  <th>Creată</th>
                  <th>Expiră</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(g => (
                  <tr key={g.id}>
                    <td>
                      <div style={{ fontWeight: 500, fontSize: '13.5px', color: '#1d1d1f', marginBottom: 2 }}>{g.nume || '—'}</div>
                      {g.slug && <div style={{ fontSize: '11.5px', fontWeight: 300, color: '#a1a1a6' }}>{g.slug}</div>}
                    </td>
                    <td style={{ fontSize: '12.5px', color: '#86868b', fontWeight: 300 }}>{g.userId?.slice(0, 8)}...</td>
                    <td style={{ fontSize: '13.5px', color: '#3a3a3c' }}>{g.poze ?? '—'}</td>
                    <td>
                      <span className={`ap-badge-status ${g.status === 'trash' ? 'ap-badge-status--suspended' : 'ap-badge-status--active'}`}>
                        {g.status === 'trash' ? 'Coș' : 'Activă'}
                      </span>
                    </td>
                    <td style={{ fontSize: '12.5px', color: '#86868b', fontWeight: 300 }}>{formatDate(g.createdAt)}</td>
                    <td style={{ fontSize: '12.5px', color: g.dataExpirare ? '#c0392b' : '#86868b', fontWeight: 300 }}>{g.dataExpirare || '—'}</td>
                    <td>
                      <div className="ap-row-actions">
                        {g.id && (
                          <a href={getGalleryPublicPath(g)} target="_blank" rel="noreferrer" className="ap-row-btn" title="Deschide">
                            <Eye size={14} />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Secțiunea Abonamente ──────────────────────
function AbonamenteSection({ subscriptions, loading }) {
  const [filterStatus, setFilterStatus] = useState('all')

  const filtered = subscriptions.filter(s =>
    filterStatus === 'all' || s.status === filterStatus
  )

  return (
    <div>
      <div className="ap-page-header">
        <h1 className="ap-page-title">Abonamente</h1>
        <p className="ap-page-sub">Date live din Stripe via Firestore</p>
      </div>

      <div className="ap-stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {[
          { label: 'Active', value: subscriptions.filter(s => s.status === 'active').length, cls: 'ap-stat-value--green' },
          { label: 'Trialing', value: subscriptions.filter(s => s.status === 'trialing').length, cls: 'ap-stat-value--gold' },
          { label: 'Canceled', value: subscriptions.filter(s => s.status === 'canceled').length, cls: 'ap-stat-value--red' },
        ].map(({ label, value, cls }) => (
          <div key={label} className="ap-stat-card">
            <div className="ap-stat-label">{label}</div>
            <div className={`ap-stat-value ${cls}`}>{loading ? '...' : value}</div>
          </div>
        ))}
      </div>

      <div className="ap-card">
        <div className="ap-card-header">
          <span className="ap-card-title">Toate abonamentele</span>
          <div className="ap-card-actions">
            <select className="ap-filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="all">Toate</option>
              <option value="active">Active</option>
              <option value="trialing">Trialing</option>
              <option value="canceled">Canceled</option>
              <option value="past_due">Past due</option>
            </select>
          </div>
        </div>

        <div className="ap-table-wrap">
          {loading ? (
            <div className="ap-table-loading">Se încarcă...</div>
          ) : filtered.length === 0 ? (
            <div className="ap-table-empty">Niciun abonament găsit.</div>
          ) : (
            <table className="ap-table">
              <thead>
                <tr>
                  <th>Utilizator</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Creat</th>
                  <th>Expiră</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => (
                  <tr key={i}>
                    <td style={{ fontSize: '12.5px', fontWeight: 300, color: '#86868b' }}>{s.uid?.slice(0, 12)}...</td>
                    <td><PlanBadge plan={s.plan} /></td>
                    <td>
                      <span className={`ap-badge-status ${s.status === 'active' || s.status === 'trialing' ? 'ap-badge-status--active' : s.status === 'canceled' ? 'ap-badge-status--suspended' : 'ap-badge-status--inactive'}`}>
                        {s.status}
                      </span>
                    </td>
                    <td style={{ fontSize: '12.5px', color: '#86868b', fontWeight: 300 }}>{formatDate(s.created)}</td>
                    <td style={{ fontSize: '12.5px', color: '#86868b', fontWeight: 300 }}>{formatDate(s.current_period_end)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Secțiunea Financiar ──────────────────────
function FinanciarSection({ users, subscriptions, loadingUsers, loadingSubscriptions }) {
  const activeStatuses = new Set(['active', 'trialing'])
  const activeSubscriptions = subscriptions.filter((sub) => activeStatuses.has(String(sub.status || '').toLowerCase()))

  const starterActive = activeSubscriptions.filter((sub) => sub.plan === 'Starter').length
  const proActive = activeSubscriptions.filter((sub) => sub.plan === 'Pro').length
  const studioActive = activeSubscriptions.filter((sub) => sub.plan === 'Studio').length

  const starterMRR = starterActive * 39
  const proMRR = proActive * 79
  const studioMRR = studioActive * 129
  const totalMRR = starterMRR + proMRR + studioMRR

  const bytesInGb = 1024 ** 3

  const readUserStorageBytes = (userRecord = {}) => {
    const hasOwn = Object.prototype.hasOwnProperty
    const candidates = ['storageUsedBytes', 'storageBytes', 'storageUsed']

    for (const key of candidates) {
      if (!hasOwn.call(userRecord, key)) continue
      const value = Number(userRecord[key])
      if (Number.isFinite(value) && value >= 0) return value
    }

    return 0
  }

  const totalStorageBytes = users.reduce((acc, item) => acc + readUserStorageBytes(item), 0)
  const totalStorageGb = totalStorageBytes / bytesInGb

  const freeTierGb = 10
  const freeTierUsedGb = Math.min(totalStorageGb, freeTierGb)
  const billableGb = Math.max(0, totalStorageGb - freeTierGb)

  const usdToLei = 4.7
  const r2CostUsd = billableGb * 0.015
  const r2CostLei = r2CostUsd * usdToLei
  const b2CostUsd = totalStorageGb * 0.006
  const b2CostLei = b2CostUsd * usdToLei
  const savingsUsd = r2CostUsd - b2CostUsd
  const savingsLei = r2CostLei - b2CostLei
  const estimatedProfitLei = totalMRR - r2CostLei

  const fmtInt = (value) =>
    new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 }).format(value)

  const fmtDecimal = (value, digits = 2) =>
    new Intl.NumberFormat('ro-RO', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)

  const isLoading = loadingUsers || loadingSubscriptions

  return (
    <div>
      <div className="ap-page-header">
        <h1 className="ap-page-title">Financiar</h1>
        <p className="ap-page-sub">MRR, costuri infrastructură și profit estimat</p>
      </div>

      <div className="ap-stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="ap-stat-card">
          <div className="ap-stat-label">MRR Starter</div>
          <div className="ap-stat-value">{isLoading ? '...' : `${fmtInt(starterMRR)} lei`}</div>
          <div className="ap-stat-trend">{starterActive} abonamente active × 39 lei</div>
        </div>
        <div className="ap-stat-card">
          <div className="ap-stat-label">MRR Pro</div>
          <div className="ap-stat-value">{isLoading ? '...' : `${fmtInt(proMRR)} lei`}</div>
          <div className="ap-stat-trend">{proActive} abonamente active × 79 lei</div>
        </div>
        <div className="ap-stat-card">
          <div className="ap-stat-label">MRR Studio</div>
          <div className="ap-stat-value">{isLoading ? '...' : `${fmtInt(studioMRR)} lei`}</div>
          <div className="ap-stat-trend">{studioActive} abonamente active × 129 lei</div>
        </div>
        <div className="ap-stat-card">
          <div className="ap-stat-label">Total MRR</div>
          <div className="ap-stat-value ap-stat-value--green">{isLoading ? '...' : `${fmtInt(totalMRR)} lei`}</div>
          <div className="ap-stat-trend">Venit recurent lunar estimat</div>
        </div>
      </div>

      <div className="ap-card">
        <div className="ap-card-header">
          <span className="ap-card-title">Costuri infrastructură</span>
        </div>
        <div style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))', gap: 14 }}>
          <div style={{ padding: 14, borderRadius: 12, border: '1px solid rgba(0,0,0,0.06)', background: '#fff' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#a1a1a6', marginBottom: 7 }}>Storage total ocupat</div>
            <div style={{ fontSize: '1.45rem', color: '#1d1d1f', fontFamily: 'DM Serif Display, Georgia, serif' }}>
              {isLoading ? '...' : `${fmtDecimal(totalStorageGb, 1)} GB`}
            </div>
            <div style={{ fontSize: '12px', color: '#86868b', marginTop: 6 }}>{isLoading ? '' : `${fmtInt(totalStorageBytes)} bytes`}</div>
            <div style={{ fontSize: '11.5px', color: '#86868b', marginTop: 4 }}>{isLoading ? '' : `Free tier R2: ${fmtDecimal(freeTierUsedGb, 2)} GB`}</div>
            <div style={{ fontSize: '11.5px', color: '#86868b', marginTop: 2 }}>{isLoading ? '' : `Billable R2: ${fmtDecimal(billableGb, 2)} GB`}</div>
          </div>

          <div style={{ padding: 14, borderRadius: 12, border: '1px solid rgba(0,0,0,0.06)', background: '#fff' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#a1a1a6', marginBottom: 7 }}>Cost R2 (0.015 USD/GB, după 10 GB gratis)</div>
            <div style={{ fontSize: '1.45rem', color: '#1d1d1f', fontFamily: 'DM Serif Display, Georgia, serif' }}>
              {isLoading ? '...' : `${fmtDecimal(r2CostUsd)} USD`}
            </div>
            <div style={{ fontSize: '12px', color: '#86868b', marginTop: 6 }}>{isLoading ? '' : `${fmtDecimal(r2CostLei)} lei (curs 4.7)`}</div>
          </div>

          <div style={{ padding: 14, borderRadius: 12, border: '1px solid rgba(0,0,0,0.06)', background: '#fff' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#a1a1a6', marginBottom: 7 }}>Cost B2 (0.006 USD/GB)</div>
            <div style={{ fontSize: '1.45rem', color: '#1d1d1f', fontFamily: 'DM Serif Display, Georgia, serif' }}>
              {isLoading ? '...' : `${fmtDecimal(b2CostUsd)} USD`}
            </div>
            <div style={{ fontSize: '12px', color: '#86868b', marginTop: 6 }}>{isLoading ? '' : `${fmtDecimal(b2CostLei)} lei`}</div>
          </div>

          <div style={{ padding: 14, borderRadius: 12, border: '1px solid rgba(46,125,50,0.24)', background: 'rgba(46,125,50,0.04)' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#2e7d32', marginBottom: 7 }}>Economie la migrare B2</div>
            <div style={{ fontSize: '1.45rem', color: '#2e7d32', fontFamily: 'DM Serif Display, Georgia, serif' }}>
              {isLoading ? '...' : `${fmtDecimal(savingsUsd)} USD`}
            </div>
            <div style={{ fontSize: '12px', color: '#2e7d32', marginTop: 6 }}>{isLoading ? '' : `${fmtDecimal(savingsLei)} lei`}</div>
          </div>
        </div>
      </div>

      <div className="ap-card">
        <div className="ap-card-header">
          <span className="ap-card-title">Profit estimat</span>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: '12.5px', color: '#86868b' }}>Formula: MRR total - cost R2 (lei)</div>
            <div style={{ fontSize: '11.5px', color: '#a1a1a6', marginTop: 6 }}>
              {isLoading ? '' : `${fmtInt(totalMRR)} lei - ${fmtDecimal(r2CostLei)} lei`}
            </div>
          </div>
          <div className={`ap-stat-value ${estimatedProfitLei >= 0 ? 'ap-stat-value--green' : 'ap-stat-value--red'}`} style={{ marginBottom: 0 }}>
            {isLoading ? '...' : `${fmtDecimal(estimatedProfitLei)} lei`}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Secțiunea Mesaje ──────────────────────────
function MesajeSection({ messages, loading, onMarkRead }) {
  const [selected, setSelected] = useState(null)

  return (
    <div>
      <div className="ap-page-header">
        <h1 className="ap-page-title">Mesaje</h1>
        <p className="ap-page-sub">Trimise prin formularele de pe site-urile fotografilor</p>
      </div>

      <div className="ap-card">
        <div className="ap-card-header">
          <span className="ap-card-title">Inbox ({messages.filter(m => !m.read).length} necitite)</span>
        </div>

        {loading ? (
          <div className="ap-table-loading">Se încarcă...</div>
        ) : messages.length === 0 ? (
          <div className="ap-table-empty">Niciun mesaj încă.</div>
        ) : (
          <div>
            {messages.map(m => (
              <div
                key={m.id}
                className={`ap-message-row ${!m.read ? 'ap-message-row--unread' : ''}`}
                onClick={() => { setSelected(m); if (!m.read) onMarkRead(m.id) }}
              >
                <div>
                  <div className="ap-message-name">{m.name || 'Anonim'}</div>
                  <div className="ap-message-preview">{m.message || m.email}</div>
                </div>
                <div style={{ fontSize: '12px', color: '#a1a1a6', fontWeight: 300 }}>{m.email}</div>
                <div style={{ fontSize: '12px', color: '#a1a1a6', fontWeight: 300 }}>{formatDate(m.createdAt)}</div>
                <div>
                  {!m.read && <span className="ap-badge-status ap-badge-status--active">Nou</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="ap-modal-overlay" onClick={() => setSelected(null)}>
          <div className="ap-modal" onClick={e => e.stopPropagation()}>
            <div className="ap-modal-header">
              <h3 className="ap-modal-title">Mesaj de la {selected.name || 'Anonim'}</h3>
              <button className="ap-modal-close" onClick={() => setSelected(null)}><X size={18} /></button>
            </div>
            <div className="ap-modal-body">
              {[['Email', selected.email], ['Telefon', selected.phone], ['Data', formatDate(selected.createdAt)]].map(([l, v]) =>
                v ? <div key={l} style={{ fontSize: '13px', fontWeight: 300, color: '#86868b' }}><strong style={{ color: '#1d1d1f', fontWeight: 500 }}>{l}:</strong> {v}</div> : null
              )}
              <div style={{ padding: '14px 16px', background: '#f5f5f7', borderRadius: '12px', fontSize: '14px', fontWeight: 300, color: '#1d1d1f', lineHeight: 1.65, marginTop: 4 }}>
                {selected.message || '—'}
              </div>
            </div>
            <div className="ap-modal-footer">
              <a href={`mailto:${selected.email}`} className="ap-btn ap-btn--primary">Răspunde pe email</a>
              <button className="ap-btn ap-btn--ghost" onClick={() => setSelected(null)}>Închide</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Secțiunea Setări platformă ────────────────
function SetariSection() {
  const [settings, setSettings] = useState({ maintenanceMode: false, globalMessage: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    adminService.getPlatformSettings()
      .then((data) => {
        if (data) setSettings(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await adminService.savePlatformSettings(settings)
      alert('Setările au fost salvate.')
    } catch (err) {
      console.error(err)
      alert('Eroare la salvare.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="ap-spinner">Se încarcă...</div>

  return (
    <div>
      <div className="ap-page-header">
        <h1 className="ap-page-title">Setări platformă</h1>
        <p className="ap-page-sub">Configurări globale Mina</p>
      </div>

      <div className="ap-card" style={{ maxWidth: 560 }}>
        <div className="ap-card-header">
          <span className="ap-card-title">Configurare globală</span>
        </div>
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 18px', background: settings.maintenanceMode ? 'rgba(192,57,43,0.05)' : '#f9f9fb', borderRadius: '12px', border: `1px solid ${settings.maintenanceMode ? 'rgba(192,57,43,0.2)' : 'rgba(0,0,0,0.06)'}` }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: '14px', color: '#1d1d1f' }}>Maintenance mode</div>
              <div style={{ fontSize: '12.5px', fontWeight: 300, color: '#86868b', marginTop: 2 }}>Afișează un banner de mentenanță tuturor utilizatorilor</div>
            </div>
            <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, flexShrink: 0 }}>
              <input type="checkbox" checked={settings.maintenanceMode} onChange={e => setSettings(p => ({ ...p, maintenanceMode: e.target.checked }))} style={{ opacity: 0, width: 0, height: 0 }} />
              <span style={{ position: 'absolute', cursor: 'pointer', inset: 0, background: settings.maintenanceMode ? '#c0392b' : '#e5e5e7', borderRadius: 12, transition: '0.2s' }}>
                <span style={{ position: 'absolute', left: settings.maintenanceMode ? 22 : 2, top: 2, width: 20, height: 20, background: '#fff', borderRadius: '50%', transition: '0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
              </span>
            </label>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: 'rgba(0,0,0,0.45)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 7 }}>
              Mesaj global (apare în dashboard pentru toți utilizatorii)
            </label>
            <textarea
              value={settings.globalMessage || ''}
              onChange={e => setSettings(p => ({ ...p, globalMessage: e.target.value }))}
              placeholder="Ex: Am lansat o funcție nouă! Încearcă-o în tab-ul Site-ul meu."
              rows={3}
              className="ap-modal-input"
              style={{ resize: 'vertical' }}
            />
            <div style={{ fontSize: '11.5px', fontWeight: 300, color: '#a1a1a6', marginTop: 6 }}>Lasă gol pentru a nu afișa niciun mesaj.</div>
          </div>

          <button className="ap-btn ap-btn--primary" onClick={handleSave} disabled={saving} style={{ alignSelf: 'flex-start' }}>
            {saving ? 'Se salvează...' : 'Salvează setările'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main AdminPanel ───────────────────────────
export default function AdminPanel({ user }) {
  const navigate = useNavigate()
  const [activeSection, setActiveSection] = useState('overview')

  const [users, setUsers] = useState([])
  const [galerii, setGalerii] = useState([])
  const [subscriptions, setSubscriptions] = useState([])
  const [messages, setMessages] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadingGalerii, setLoadingGalerii] = useState(true)
  const [loadingSubscriptions, setLoadingSubscriptions] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(true)
  const [usersLoadError, setUsersLoadError] = useState('')

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!hasAdminAccess(user)) {
    return (
      <div className="ap-denied">
        <p style={{ fontSize: '2rem' }}>🔒</p>
        <p className="ap-denied-title">Acces restricționat</p>
        <p className="ap-denied-sub">Această pagină este accesibilă doar administratorilor.</p>
        <p className="ap-denied-sub" style={{ marginTop: 6 }}>
          Cont curent: <strong>{user.email || 'fără email'}</strong>
        </p>
        <button className="ap-btn ap-btn--primary" style={{ marginTop: 16 }} onClick={() => navigate('/dashboard')}>
          Înapoi la dashboard
        </button>
      </div>
    )
  }

  // ── Load utilizatori din colecția 'users' (creată la Register) ──
  useEffect(() => {
    const load = async () => {
      let snapshot = null
      try {
        // Ensure current user profile doc exists before admin queries.
        await authService.getCurrentUser().catch(() => null)

        snapshot = await adminService.getAdminSnapshot({
          stripePriceStarter: STRIPE_PRICE_STARTER,
          stripePricePro: STRIPE_PRICE_PRO,
          stripePriceStudio: STRIPE_PRICE_STUDIO,
        })
      } catch (listErr) {
        setUsersLoadError('Nu pot citi lista completă de utilizatori (permisiuni Firestore).')
      }

      try {
        let usersBase = Array.isArray(snapshot?.users) ? snapshot.users : []
        if (!Array.isArray(usersBase) || usersBase.length === 0) {
          usersBase = [{
            uid: user.uid,
            email: user.email || user.uid,
            name: user.name || '',
            brandName: user.brandName || '',
            createdAt: new Date().toISOString(),
            status: 'active',
            role: user.role || 'user',
            isAdmin: user.isAdmin === true || user.role === 'admin',
          }]
        }

        const usersData = usersBase.map((userData) => {
          const uid = userData.uid
          const planOverride = snapshot?.planOverrideByUid?.[uid] || null
          const inferredPlanRaw = snapshot?.activePlanByUid?.[uid] || 'Free'
          const inferredPlan = inferredPlanRaw === 'Unlimited' ? 'Studio' : inferredPlanRaw
          const plan = planOverride || inferredPlan || 'Free'
          return {
            uid,
            email: userData.email || uid,
            name: userData.name || '',
            brandName: userData.brandName || '',
            createdAt: userData.createdAt || null,
            status: userData.status || 'active',
            storageUsedBytes: Number(userData.storageUsedBytes ?? userData.storageBytes ?? userData.storageUsed ?? 0),
            role: userData.role || 'user',
            isAdmin: userData.isAdmin === true
              || userData.role === 'admin',
            plan,
            planOverride,
            galeriiCount: Number(snapshot?.galleryCountByUid?.[uid] || 0),
          }
        })

        const subscriptionsRaw = Array.isArray(snapshot?.subscriptions) ? snapshot.subscriptions : []
        const allSubs = subscriptionsRaw.map((d) => {
          const priceId = d.items?.data?.[0]?.price?.id || d.price?.id
          return {
            uid: d.uid,
            status: d.status,
            plan: d.plan === 'Unlimited' ? 'Studio' : (PLAN_PRICES[priceId] || d.plan || 'Free'),
            created: d.created,
            current_period_end: d.current_period_end,
          }
        })

        setUsers(usersData)
        setSubscriptions(allSubs)
      } catch (err) {
        console.error('Error loading users:', err)
        setUsersLoadError('Eroare la încărcarea utilizatorilor.')
      } finally {
        setLoadingUsers(false)
        setLoadingSubscriptions(false)
      }
    }
    load()
  }, [user?.uid])

  // ── Load galerii ──
  useEffect(() => {
    const unsubscribe = adminService.watchGalleries(
      (data) => {
        setGalerii(data)
        setLoadingGalerii(false)
      },
      () => setLoadingGalerii(false)
    )
    return () => unsubscribe()
  }, [])

  // ── Load mesaje ──
  useEffect(() => {
    const unsubscribe = adminService.watchContactMessages(
      (data) => {
        setMessages(data)
        setLoadingMessages(false)
      },
      () => setLoadingMessages(false)
    )
    return () => unsubscribe()
  }, [])

  // ── Statistici ──
  const starterUsers = subscriptions.filter(s => s.plan === 'Starter' && ['active', 'trialing'].includes(s.status)).length
  const proUsers = subscriptions.filter(s => s.plan === 'Pro' && ['active', 'trialing'].includes(s.status)).length
  const studioUsers = subscriptions.filter(s => s.plan === 'Studio' && ['active', 'trialing'].includes(s.status)).length
  const paidUsers = starterUsers + proUsers + studioUsers
  const freeUsers = Math.max(0, users.length - paidUsers)
  const newMessages = messages.filter(m => !m.read).length

  const stats = {
    loading: loadingUsers || loadingGalerii,
    totalUsers: users.length,
    totalGalerii: galerii.filter(g => !g.status || g.status === 'active').length,
    totalGaleriiAll: galerii.length,
    paidUsers, starterUsers, proUsers, studioUsers, freeUsers,
    newMessages,
  }

  // ── Acțiuni ──
  const handleChangePlan = async (uid, newPlan) => {
    try {
      await adminService.setPlanOverride(uid, newPlan)
      setUsers(prev => prev.map(u => u.uid === uid ? { ...u, plan: newPlan, planOverride: newPlan } : u))
    } catch (err) {
      console.error(err)
      alert('Eroare la schimbarea planului.')
    }
  }

  const handleToggleSuspend = async (targetUser) => {
    const newStatus = targetUser.status === 'suspended' ? 'active' : 'suspended'
    const msg = newStatus === 'suspended' ? `Suspendă contul ${targetUser.email}?` : `Reactivează contul ${targetUser.email}?`
    if (!window.confirm(msg)) return
    try {
      await adminService.setUserStatus(targetUser.uid, newStatus)
      setUsers(prev => prev.map(u => u.uid === targetUser.uid ? { ...u, status: newStatus } : u))
    } catch (err) {
      console.error(err)
      alert('Eroare.')
    }
  }

  const handleToggleAdmin = async (targetUser) => {
    const willBeAdmin = !targetUser.isAdmin
    if (targetUser.uid === user.uid && !willBeAdmin) {
      alert('Nu poți revoca propriul rol admin din acest panel.')
      return
    }

    const prompt = willBeAdmin
      ? `Promovezi ${targetUser.email} la admin?`
      : `Revoci rolul admin pentru ${targetUser.email}?`

    if (!window.confirm(prompt)) return

    try {
      await adminService.setUserAdmin(targetUser.uid, willBeAdmin)
      setUsers((prev) =>
        prev.map((u) =>
          u.uid === targetUser.uid
            ? {
                ...u,
                isAdmin: willBeAdmin,
                role: willBeAdmin ? 'admin' : 'user',
              }
            : u
        )
      )
    } catch (err) {
      console.error(err)
      alert('Eroare la schimbarea rolului admin.')
    }
  }

  const handleDeleteUser = async (targetUser) => {
    if (!window.confirm(`Ești sigur că vrei să ștergi contul ${targetUser.email}? Această acțiune este ireversibilă.`)) return
    if (!window.confirm('Confirmă din nou: se șterg datele din Firestore (galeriile rămân în R2).')) return
    try {
      await adminService.deleteUser(targetUser.uid)
      setUsers(prev => prev.filter(u => u.uid !== targetUser.uid))
    } catch (err) {
      console.error(err)
      alert('Eroare la ștergere.')
    }
  }

  const handleMarkRead = async (id) => {
    try {
      await adminService.markContactMessageRead(id)
      setMessages(prev => prev.map(m => m.id === id ? { ...m, read: true } : m))
    } catch (err) {
      console.error(err)
    }
  }

  const navItems = [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard },
    { key: 'users', label: 'Utilizatori', icon: Users, badge: users.length },
    { key: 'galerii', label: 'Galerii', icon: Images, badge: galerii.length },
    { key: 'abonamente', label: 'Abonamente', icon: CreditCard },
    { key: 'financiar', label: 'Financiar', icon: TrendingUp },
    { key: 'mesaje', label: 'Mesaje', icon: MessageSquare, badge: newMessages || null },
    { key: 'setari', label: 'Setări', icon: Settings },
  ]

  return (
    <div className="ap-root">
      <header className="ap-topbar">
        <div className="ap-topbar-left">
          <a href="/dashboard" className="ap-logo"><span style={{
  fontFamily: "'Cormorant Garamond', Georgia, serif",
  fontWeight: 300,
  fontSize: '2.2rem',
  letterSpacing: '0.15em',
  color: '#1d1d1f',
  fontStyle: 'normal',
  textDecoration: 'none'
}}>MINA</span></a>
          <span className="ap-badge">Admin</span>
        </div>
        <div className="ap-topbar-right">
          <span className="ap-topbar-user">{user.email}</span>
          <a href="/dashboard" className="ap-topbar-exit">
            <LogOut size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />
            Dashboard
          </a>
        </div>
      </header>

      <div className="ap-layout">
        <nav className="ap-sidebar">
          <span className="ap-sidebar-label">Navigare</span>
          <div className="ap-sidebar-section">
            {navItems.map(({ key, label, icon: Icon, badge }) => (
              <button
                key={key}
                className={`ap-nav-btn ${activeSection === key ? 'active' : ''}`}
                onClick={() => setActiveSection(key)}
              >
                <Icon size={15} />
                {label}
                {badge ? <span className="ap-nav-indicator">{badge}</span> : null}
              </button>
            ))}
          </div>
        </nav>

        <main className="ap-main">
          {activeSection === 'overview' && <OverviewSection stats={stats} />}
          {activeSection === 'users' && (
            <>
              {usersLoadError && (
                <div className="ap-card" style={{ marginBottom: 16, borderColor: 'rgba(192,57,43,0.25)' }}>
                  <div style={{ padding: 14, color: '#c0392b', fontSize: '13px' }}>{usersLoadError}</div>
                </div>
              )}
              <UsersSection
                users={users}
                loading={loadingUsers}
                onChangePlan={handleChangePlan}
                onToggleSuspend={handleToggleSuspend}
                onToggleAdmin={handleToggleAdmin}
                onDelete={handleDeleteUser}
                currentAdminUid={user?.uid}
              />
            </>
          )}
          {activeSection === 'galerii' && <GaleriiSection galerii={galerii} loading={loadingGalerii} />}
          {activeSection === 'abonamente' && <AbonamenteSection subscriptions={subscriptions} loading={loadingSubscriptions} />}
          {activeSection === 'financiar' && (
            <FinanciarSection
              users={users}
              subscriptions={subscriptions}
              loadingUsers={loadingUsers}
              loadingSubscriptions={loadingSubscriptions}
            />
          )}
          {activeSection === 'mesaje' && <MesajeSection messages={messages} loading={loadingMessages} onMarkRead={handleMarkRead} />}
          {activeSection === 'setari' && <SetariSection />}
        </main>
      </div>
    </div>
  )
}
