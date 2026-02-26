import React, { useEffect, useState } from 'react';
import { getAppServices } from '../core/bootstrap/appBootstrap';
import BillingSettings from './BillingSettings';
import BillingHistory from './BillingHistory';
import './SubscriptionSection.css';

const {
  billing: billingService,
} = getAppServices()

function formatDate(value) {
  if (!(value instanceof Date)) return '—'
  return new Intl.DateTimeFormat('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)
}

function formatAmount(amountMinor, currency = 'ron') {
  if (amountMinor === null || amountMinor === undefined || Number.isNaN(Number(amountMinor))) return '—'
  const amount = Number(amountMinor) / 100
  return new Intl.NumberFormat('ro-RO', {
    style: 'currency',
    currency: String(currency || 'ron').toUpperCase(),
    maximumFractionDigits: 2,
  }).format(amount)
}

function mapStatusLabel(status) {
  const normalized = String(status || '').toLowerCase()
  if (['paid', 'complete', 'succeeded', 'active', 'trialing'].includes(normalized)) return 'Activ'
  if (normalized === 'no_payment_required') return 'Cupon 100% (0 lei)'
  if (['canceled', 'cancelled'].includes(normalized)) return 'Anulat'
  if (['failed', 'error'].includes(normalized)) return 'Eroare'
  if (['open', 'pending', 'unpaid'].includes(normalized)) return 'În așteptare'
  return normalized ? normalized : '—'
}

function statusClass(status) {
  const normalized = String(status || '').toLowerCase()
  if (['paid', 'complete', 'succeeded', 'active', 'trialing', 'no_payment_required'].includes(normalized)) return 'is-success'
  if (['failed', 'error', 'canceled', 'cancelled'].includes(normalized)) return 'is-danger'
  return 'is-muted'
}

const SubscriptionSection = ({ user, userPlan: userPlanProp, storageLimit }) => {
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [openingPortal, setOpeningPortal] = useState(false)
  const [billingData, setBillingData] = useState(null)
  const [billingLoading, setBillingLoading] = useState(false)
  const [billingError, setBillingError] = useState('')
  const userPlan = userPlanProp ?? user?.plan ?? 'Free';

  const loadBillingOverview = async () => {
    if (!user?.uid) return
    setBillingLoading(true)
    setBillingError('')
    try {
      const overview = await billingService.getBillingOverview(user.uid)
      setBillingData(overview)
    } catch (err) {
      console.error('Eroare billing overview:', err)
      setBillingError('Nu pot încărca istoricul de plăți acum.')
    } finally {
      setBillingLoading(false)
    }
  }

  useEffect(() => {
    loadBillingOverview()
  }, [user?.uid, userPlan])

  const handleCheckout = async (planId) => {
    if (planId === 'free') return;
    setLoadingPlan(planId);
    const uiFallbackTimeout = setTimeout(() => {
      setLoadingPlan(null)
      alert('Checkout durează prea mult. Verifică extensia Stripe în Firebase și încearcă din nou.')
    }, 22000)

    try {
      const url = await billingService.startCheckout({
        uid: user.uid,
        planId,
        successUrl: window.location.origin + '/dashboard?payment=success',
        cancelUrl: window.location.origin + '/dashboard?payment=cancel',
      });

      if (url) {
        window.location.assign(url);
      } else {
        setLoadingPlan(null);
      }
    } catch (err) {
      console.error("Eroare checkout:", err);
      setLoadingPlan(null);
      const raw = String(err?.message || '').trim()
      const details = raw ? `\nDetalii: ${raw}` : ''
      alert(`Nu s-a putut iniția sesiunea de plată.${details}`)
    } finally {
      clearTimeout(uiFallbackTimeout)
    }
  };

  const payments = billingData?.payments || []
  const activeSubscription = billingData?.activeSubscription || null
  const overridePlan = billingData?.overridePlan || null
  const hasManualOverride = Boolean(overridePlan)
  const canCancelAtPeriodEnd = Boolean(
    activeSubscription &&
      ['active', 'trialing'].includes(String(activeSubscription.status || '').toLowerCase()) &&
      !activeSubscription.cancelAtPeriodEnd
  )

  const handleCancelAtPeriodEnd = async () => {
    if (!activeSubscription) return
    if (activeSubscription.cancelAtPeriodEnd) {
      alert('Abonamentul este deja programat pentru anulare la finalul perioadei curente.')
      return
    }

    const returnUrl = `${window.location.origin}/dashboard?tab=abonament&billing=updated`
    const flowData = activeSubscription?.id
      ? {
          type: 'subscription_cancel',
          subscription_cancel: {
            subscription: activeSubscription.id,
          },
          after_completion: {
            type: 'redirect',
            redirect: {
              return_url: returnUrl,
            },
          },
        }
      : null

    setOpeningPortal(true)
    try {
      let portalUrl = ''
      try {
        portalUrl = await billingService.createPortalLink({
          returnUrl,
          flowData,
        })
      } catch {
        portalUrl = await billingService.createPortalLink({ returnUrl })
      }
      window.location.assign(portalUrl)
    } catch (err) {
      console.error('Eroare portal Stripe:', err)
      alert(`Nu pot deschide portalul Stripe.\nDetalii: ${String(err?.message || 'necunoscut')}`)
      setOpeningPortal(false)
    }
  }

  const plans = [
    {
      id: 'free',
      name: 'Free',
      price: '0 lei',
      features: ['15 GB Stocare Cloud', 'Galerii nelimitate', 'Branding de bază'],
      isCurrent: userPlan === 'Free',
      cta: 'Plan gratuit'
    },
    {
      id: 'pro',
      name: 'Pro',
      price: '100 lei',
      period: '/lună',
      features: ['500 GB Stocare Cloud', 'Branding Personalizat', 'URL-uri Custom (slugs)', 'Suport Prioritar'],
      isCurrent: userPlan === 'Pro',
      cta: 'Treci la Pro',
      highlight: true
    },
    {
      id: 'unlimited',
      name: 'Unlimited',
      price: '150 lei',
      period: '/lună',
      features: ['1 TB Stocare Cloud', 'Tot ce include Pro', 'Domeniu Personalizat', 'Suport WhatsApp'],
      isCurrent: userPlan === 'Unlimited',
      cta: 'Alege Unlimited',
      highlight: false
    }
  ];

  return (
    <div className="sub-wrapper">
      <div className="sub-header">
        <h2 className="sub-display-title">Alege planul potrivit <em>viziunii tale.</em></h2>
        <p className="sub-display-sub">Scalabilitate maximă pentru portofoliul tău profesional.</p>
      </div>

      <div className="sub-pricing-grid">
        {plans.map((plan) => (
          (() => {
            const isFreePlan = plan.id === 'free'
            const isDisabled = plan.isCurrent || Boolean(loadingPlan) || isFreePlan
            const label = loadingPlan === plan.id
              ? 'Se încarcă...'
              : plan.isCurrent
                ? 'Planul tău'
                : isFreePlan
                  ? 'Disponibil după anulare'
                  : plan.cta

            return (
          <div key={plan.id} className={`sub-plan-card ${plan.highlight ? 'pro-featured' : ''}`}>
            {plan.highlight && <div className="sub-plan-badge">Cel mai ales</div>}
            <h3 className="sub-plan-name">{plan.name}</h3>
            <div className="sub-plan-price">
              {plan.price}
              {plan.period && <span className="sub-period">{plan.period}</span>}
            </div>
            <ul className="sub-plan-features">
              {plan.features.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
            <button 
              className={`sub-plan-btn ${plan.highlight ? 'btn-gold-filled' : 'btn-outline'}`}
              onClick={() => handleCheckout(plan.id)}
              disabled={isDisabled}
            >
              {label}
            </button>
            {!plan.isCurrent && isFreePlan && (
              <p className="sub-muted" style={{ marginTop: 8 }}>
                Pentru plan Free, anulezi întâi abonamentul curent la final de perioadă.
              </p>
            )}
          </div>
            )
          })()
        ))}
      </div>

      <div className="sub-billing-grid">
        <div className="sub-billing-card">
          <div className="sub-billing-head">
            <h3>Detalii cont</h3>
            <button
              type="button"
              className="sub-refresh-btn"
              onClick={loadBillingOverview}
              disabled={billingLoading}
            >
              {billingLoading ? 'Se încarcă...' : 'Actualizează'}
            </button>
          </div>

          {billingError && <p className="sub-billing-error">{billingError}</p>}

          <div className="sub-kv">
            <div className="sub-kv-row">
              <span>Plan curent</span>
              <strong>{userPlan}</strong>
            </div>
            <div className="sub-kv-row">
              <span>Limită stocare</span>
              <strong>{Number(storageLimit || 0)} GB</strong>
            </div>
            <div className="sub-kv-row">
              <span>Email cont</span>
              <strong>{user?.email || '—'}</strong>
            </div>
            <div className="sub-kv-row">
              <span>Status abonament</span>
              <strong>{activeSubscription ? mapStatusLabel(activeSubscription.status) : 'Fără abonament activ'}</strong>
            </div>
            <div className="sub-kv-row">
              <span>Următoarea reînnoire</span>
              <strong>{formatDate(activeSubscription?.currentPeriodEnd)}</strong>
            </div>
            <div className="sub-kv-row">
              <span>Sursă plan</span>
              <strong>{hasManualOverride ? `Manual (${overridePlan})` : 'Stripe automat'}</strong>
            </div>
            <div className="sub-kv-row">
              <span>Anulare la final perioadă</span>
              <strong>{activeSubscription?.cancelAtPeriodEnd ? 'Da' : 'Nu'}</strong>
            </div>
          </div>

          {activeSubscription && (
            <div className="sub-billing-actions">
              <button
                type="button"
                className="sub-danger-btn"
                onClick={handleCancelAtPeriodEnd}
                disabled={!canCancelAtPeriodEnd || openingPortal}
              >
                {openingPortal
                  ? 'Se deschide portalul Stripe...'
                  : activeSubscription?.cancelAtPeriodEnd
                    ? 'Anulare programată'
                    : 'Anulează la finalul perioadei'}
              </button>
              <p className="sub-muted">
                Anularea este gestionată prin Stripe și menține accesul până la sfârșitul perioadei plătite.
              </p>
            </div>
          )}
        </div>

        <div className="sub-billing-card">
          <div className="sub-billing-head">
            <h3>Plăți efectuate</h3>
            <span className="sub-muted">{payments.length} înregistrări</span>
          </div>

          {billingLoading && payments.length === 0 ? (
            <p className="sub-muted">Se încarcă istoricul...</p>
          ) : payments.length === 0 ? (
            <p className="sub-muted">Încă nu există plăți confirmate pentru acest cont.</p>
          ) : (
            <div className="sub-payments-list">
              {payments.map((item) => (
                <div key={item.id} className="sub-payment-row">
                  <div className="sub-payment-left">
                    <div className="sub-payment-date">{formatDate(item.createdAt)}</div>
                    <div className="sub-payment-plan">{item.plan || 'Plan necunoscut'}</div>
                  </div>
                  <div className="sub-payment-right">
                    <div className="sub-payment-amount">{formatAmount(item.amountTotal, item.currency)}</div>
                    <span className={`sub-payment-status ${statusClass(item.status)}`}>
                      {mapStatusLabel(item.status)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <BillingSettings user={user} />
      <BillingHistory user={user} />
    </div>
  );
};

export default SubscriptionSection;
