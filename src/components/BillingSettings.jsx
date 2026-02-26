import React, { useEffect, useState } from 'react'
import { Building2, ShieldCheck, UserRound } from 'lucide-react'
import { getAppServices } from '../core/bootstrap/appBootstrap'
import { BILLING_TYPES, DEFAULT_BILLING_DETAILS } from '../modules/billing/billing.service'
import './BillingSettings.css'

const { billing: billingService } = getAppServices()

function BillingSettings({ user }) {
  const [form, setForm] = useState({ ...DEFAULT_BILLING_DETAILS })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (!user?.uid) return
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const details = await billingService.getBillingDetails(user.uid)
        if (cancelled) return
        setForm({ ...DEFAULT_BILLING_DETAILS, ...details })
      } catch (err) {
        if (cancelled) return
        console.error('Eroare încărcare billingDetails:', err)
        setError('Nu pot încărca datele de facturare acum.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [user?.uid])

  const setField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (error) setError('')
    if (success) setSuccess('')
  }

  const handleTypeChange = (type) => {
    if (type === BILLING_TYPES.BUSINESS) {
      setForm((prev) => ({ ...prev, type }))
    } else {
      setForm((prev) => ({ ...prev, type, cui: '', regCom: '' }))
    }
    if (error) setError('')
    if (success) setSuccess('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!user?.uid || saving) return

    setSaving(true)
    setError('')
    setSuccess('')

    try {
      await billingService.saveBillingDetails(user.uid, form)
      setSuccess('Datele de facturare au fost salvate.')
    } catch (err) {
      console.error('Eroare salvare billingDetails:', err)
      setError(String(err?.message || 'Nu am putut salva datele de facturare.'))
    } finally {
      setSaving(false)
    }
  }

  const isBusiness = form.type === BILLING_TYPES.BUSINESS

  return (
    <section className="bill-settings-card">
      <div className="bill-settings-head">
        <div>
          <h3>Date de facturare</h3>
          <p>Setează profilul pentru facturi Stripe/SmartBill (B2C sau B2B).</p>
        </div>
      </div>

      {loading ? (
        <p className="bill-settings-muted">Se încarcă datele de facturare...</p>
      ) : (
        <form onSubmit={handleSubmit} className="bill-settings-form">
          <div className="bill-settings-type-switch" role="radiogroup" aria-label="Tip client facturare">
            <button
              type="button"
              role="radio"
              aria-checked={form.type === BILLING_TYPES.INDIVIDUAL}
              className={`bill-type-btn ${form.type === BILLING_TYPES.INDIVIDUAL ? 'is-active' : ''}`}
              onClick={() => handleTypeChange(BILLING_TYPES.INDIVIDUAL)}
            >
              <UserRound size={15} />
              Persoană Fizică
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={form.type === BILLING_TYPES.BUSINESS}
              className={`bill-type-btn ${form.type === BILLING_TYPES.BUSINESS ? 'is-active' : ''}`}
              onClick={() => handleTypeChange(BILLING_TYPES.BUSINESS)}
            >
              <Building2 size={15} />
              Persoană Juridică
            </button>
          </div>

          <div className="bill-settings-grid">
            <label className="bill-field bill-field-full">
              <span>Nume {isBusiness ? 'companie' : 'persoană'}</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                placeholder={isBusiness ? 'Ex: Mina Studio SRL' : 'Ex: Ion Popescu'}
                required
              />
            </label>

            <label className="bill-field bill-field-full">
              <span>Adresă</span>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setField('address', e.target.value)}
                placeholder="Stradă, număr, bloc, apartament"
                required
              />
            </label>

            <label className="bill-field">
              <span>Oraș</span>
              <input
                type="text"
                value={form.city}
                onChange={(e) => setField('city', e.target.value)}
                placeholder="Ex: București"
                required
              />
            </label>

            <label className="bill-field">
              <span>Județ</span>
              <input
                type="text"
                value={form.county}
                onChange={(e) => setField('county', e.target.value)}
                placeholder="Ex: Ilfov"
                required
              />
            </label>

            <label className="bill-field bill-field-full">
              <span>Țară</span>
              <input
                type="text"
                value={form.country}
                onChange={(e) => setField('country', e.target.value)}
                placeholder="România"
                required
              />
            </label>

            {isBusiness && (
              <>
                <label className="bill-field">
                  <span>CUI</span>
                  <input
                    type="text"
                    value={form.cui}
                    onChange={(e) => setField('cui', e.target.value.toUpperCase())}
                    placeholder="Ex: RO12345678"
                    required
                  />
                </label>

                <label className="bill-field">
                  <span>Reg. Com.</span>
                  <input
                    type="text"
                    value={form.regCom}
                    onChange={(e) => setField('regCom', e.target.value.toUpperCase())}
                    placeholder="Ex: J40/1234/2026"
                    required
                  />
                </label>
              </>
            )}
          </div>

          {error && <p className="bill-settings-error">{error}</p>}
          {success && <p className="bill-settings-success">{success}</p>}

          <div className="bill-settings-actions">
            <button type="submit" className="bill-save-btn" disabled={saving}>
              {saving ? 'Se salvează...' : 'Salvează datele'}
            </button>
          </div>

          <div className="bill-settings-gdpr">
            <ShieldCheck size={15} />
            <p>
              Datele de facturare sunt colectate strict pentru emiterea documentelor fiscale obligatorii
              (conform legislației contabile/fiscale) și sunt folosite exclusiv în scop de facturare.
            </p>
          </div>
        </form>
      )}
    </section>
  )
}

export default BillingSettings
