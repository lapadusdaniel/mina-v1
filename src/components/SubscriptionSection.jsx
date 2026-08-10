import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAppServices } from '../core/bootstrap/appBootstrap';
import {
  FOUNDER_OFFER,
  PRICING_PLANS,
  getPlanPrice,
  isFounderOfferActive,
  isFounderPriceId,
} from '../modules/billing/pricing.config';
import BillingSettings from './BillingSettings';
import BillingHistory from './BillingHistory';
import './SubscriptionSection.css';
import { trackEvent } from '../services/analytics'

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

const DASH_PLANS = PRICING_PLANS.map((plan) => ({
  ...plan,
  id: plan.key,
  highlight: plan.featured,
}))

const SubscriptionSection = ({ user, userPlan: userPlanProp, storageLimit, mode = 'full', initialBillingCycle = 'monthly' }) => {
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [openingPortal, setOpeningPortal] = useState(false)
  const [activatingAddon, setActivatingAddon] = useState(false)
  const [deactivatingAddon, setDeactivatingAddon] = useState(false)
  const [billingData, setBillingData] = useState(null)
  const [billingLoading, setBillingLoading] = useState(false)
  const [billingError, setBillingError] = useState('')
  const [billingCycle, setBillingCycle] = useState(initialBillingCycle === 'yearly' ? 'yearly' : 'monthly')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const founderOfferActive = isFounderOfferActive()
  const normalizedRawPlan = String(userPlanProp ?? user?.plan ?? 'Free')
  const userPlan = normalizedRawPlan === 'Unlimited' ? 'Studio' : normalizedRawPlan
  const showPlans = mode === 'full' || mode === 'plansOnly'
  const showBilling = mode === 'full' || mode === 'billingOnly'

  const loadBillingOverview = useCallback(async () => {
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
  }, [user?.uid])

  useEffect(() => {
    loadBillingOverview()
  }, [loadBillingOverview, userPlan])

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
        termsAccepted,
      });

      if (url) {
        trackEvent('begin_checkout', {
          currency: 'RON',
          plan_id: String(planId).replace(/_(monthly|yearly)$/, ''),
          billing_cycle: String(planId).endsWith('_yearly') ? 'yearly' : 'monthly',
        })
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
  const activeAddonSubscription = billingData?.activeAddonSubscription || null
  const addonSubscriptionId = activeAddonSubscription?.id || billingData?.addonSubscriptionId || null
  const addonActive = Boolean(billingData?.addonActive)
  const effectiveStorageLimit = Number.isFinite(Number(billingData?.effectiveStorageLimit))
    ? Number(billingData.effectiveStorageLimit)
    : Number(storageLimit || 0)
  const overridePlan = billingData?.overridePlan || null
  const hasManualOverride = Boolean(overridePlan)
  const canCancelAtPeriodEnd = Boolean(
    activeSubscription &&
      ['active', 'trialing'].includes(String(activeSubscription.status || '').toLowerCase()) &&
      !activeSubscription.cancelAtPeriodEnd
  )
  const hasActiveSubscription = Boolean(activeSubscription)
  const activeSubscriptionHasFounderPrice = isFounderPriceId(activeSubscription?.priceId)
  const portalConfiguration = activeSubscriptionHasFounderPrice
    ? String(import.meta.env.VITE_STRIPE_PORTAL_CONFIGURATION_FOUNDER || '').trim()
    : String(import.meta.env.VITE_STRIPE_PORTAL_CONFIGURATION_STANDARD || '').trim()

  const handleOpenPortal = async () => {
    setOpeningPortal(true)
    try {
      const portalUrl = await billingService.createPortalLink({
        returnUrl: `${window.location.origin}/dashboard?tab=abonament&billing=updated`,
        configuration: portalConfiguration,
      })
      window.location.assign(portalUrl)
    } catch (err) {
      console.error('Eroare portal Stripe:', err)
      alert(`Nu pot deschide portalul Stripe.\nDetalii: ${String(err?.message || 'necunoscut')}`)
      setOpeningPortal(false)
    }
  }

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
          configuration: portalConfiguration,
        })
      } catch {
        portalUrl = await billingService.createPortalLink({ returnUrl, configuration: portalConfiguration })
      }
      window.location.assign(portalUrl)
    } catch (err) {
      console.error('Eroare portal Stripe:', err)
      alert(`Nu pot deschide portalul Stripe.\nDetalii: ${String(err?.message || 'necunoscut')}`)
      setOpeningPortal(false)
    }
  }

  const handleActivateAddon = async () => {
    if (!user?.uid || userPlan !== 'Studio' || addonActive) return

    setActivatingAddon(true)
    try {
      const url = await billingService.startAddonCheckout({
        uid: user.uid,
        successUrl: window.location.origin + '/dashboard?tab=abonament&addon=success',
        cancelUrl: window.location.origin + '/dashboard?tab=abonament&addon=cancel',
      })

      if (url) {
        window.location.assign(url)
      } else {
        setActivatingAddon(false)
      }
    } catch (err) {
      console.error('Eroare activare add-on:', err)
      alert('Nu s-a putut iniția checkout-ul pentru add-on.\nDetalii: ' + String(err?.message || 'necunoscut'))
      setActivatingAddon(false)
    }
  }

  const handleDeactivateAddon = async () => {
    if (!addonActive) return

    const returnUrl = window.location.origin + '/dashboard?tab=abonament&addon=updated'
    const flowData = addonSubscriptionId
      ? {
          type: 'subscription_cancel',
          subscription_cancel: {
            subscription: addonSubscriptionId,
          },
          after_completion: {
            type: 'redirect',
            redirect: {
              return_url: returnUrl,
            },
          },
        }
      : null

    setDeactivatingAddon(true)
    try {
      let portalUrl = ''
      try {
        portalUrl = await billingService.createPortalLink({
          returnUrl,
          flowData,
          configuration: portalConfiguration,
        })
      } catch {
        portalUrl = await billingService.createPortalLink({ returnUrl, configuration: portalConfiguration })
      }

      window.location.assign(portalUrl)
    } catch (err) {
      console.error('Eroare dezactivare add-on:', err)
      alert('Nu pot deschide portalul Stripe pentru add-on.\nDetalii: ' + String(err?.message || 'necunoscut'))
      setDeactivatingAddon(false)
    }
  }

  return (
    <div className="sub-wrapper">
      {showPlans && (
        <>
          <div className="sub-header">
            <h2 className="sub-display-title">
              Alege planul potrivit <span className="sub-display-title-accent">viziunii tale</span>.
            </h2>
            <p className="sub-display-sub">Alege stocarea potrivită pentru volumul tău de lucru.</p>

            {activeSubscriptionHasFounderPrice ? (
              <div className="sub-founder-offer is-active">
                <strong>Preț Fondator activ</strong>
                <span>Îl păstrezi cât timp abonamentul tău plătit rămâne activ, fără întrerupere.</span>
              </div>
            ) : founderOfferActive && !hasActiveSubscription ? (
              <div className="sub-founder-offer">
                <strong>Activează până la {FOUNDER_OFFER.endsAtLabel}</strong>
                <span>Alege un plan plătit și păstrează prețul Fondator cât timp abonamentul rămâne activ.</span>
              </div>
            ) : null}

            <div className="sub-billing-toggle">
              <button
                className={`sub-billing-opt${billingCycle === 'monthly' ? ' sub-billing-opt-active' : ''}`}
                onClick={() => setBillingCycle('monthly')}
              >
                Lunar
              </button>
              <button
                className={`sub-billing-opt${billingCycle === 'yearly' ? ' sub-billing-opt-active' : ''}`}
                onClick={() => setBillingCycle('yearly')}
              >
                Anual
                <span className="sub-billing-save">≈ 2 luni incluse</span>
              </button>
            </div>
          </div>

          <div className="sub-pricing-grid sub-pricing-grid-5">
            {DASH_PLANS.map((plan) => {
              const isCurrent = userPlan.toLowerCase() === plan.id
              const price = getPlanPrice(plan, billingCycle, {
                founderEligible: hasActiveSubscription ? activeSubscriptionHasFounderPrice : undefined,
              })
              const isFreePlan = plan.id === 'free'
              const checkoutId = price.planId
              const isDisabled = isCurrent || Boolean(loadingPlan) || isFreePlan || openingPortal || (!hasActiveSubscription && !termsAccepted)

              return (
                <div
                  key={plan.id}
                  className={[
                    'sub-plan-card',
                    `sub-plan-card--${plan.id}`,
                    plan.highlight ? 'pro-featured' : '',
                    isCurrent ? 'is-current-plan' : '',
                  ].filter(Boolean).join(' ')}
                >
                  {plan.highlight && !isCurrent && (
                    <div className="sub-plan-badge">Recomandat</div>
                  )}
                  {isCurrent && (
                    <div className="sub-plan-badge sub-plan-badge-current">Plan activ</div>
                  )}

                  <h3 className="sub-plan-name">{plan.name}</h3>
                  <p className="sub-plan-storage-tag">{plan.storage} stocare</p>

                  {price.founderActive && <p className="sub-plan-founder-label">Preț Fondator</p>}
                  <div className="sub-plan-price">
                    {price.display}
                    {!isFreePlan && billingCycle === 'monthly' && (
                      <span className="sub-period">/lună</span>
                    )}
                    {!isFreePlan && billingCycle === 'yearly' && (
                      <span className="sub-period">/an</span>
                    )}
                  </div>
                  {billingCycle === 'yearly' && price.equiv && (
                    <p className="sub-plan-equiv">{price.equiv}</p>
                  )}
                  {price.standardDisplay && (
                    <p className="sub-plan-standard-price">
                      Preț standard: {price.standardDisplay}/{billingCycle === 'yearly' ? 'an' : 'lună'}
                    </p>
                  )}

                  <ul className="sub-plan-features">
                    {plan.features.map((f) => <li key={f}>{f}</li>)}
                    {plan.lockedFeatures.map((f) => (
                      <li key={f} className="sub-feature-muted">{f}</li>
                    ))}
                  </ul>

                  {isFreePlan ? (
                    isCurrent && <p className="sub-free-label">Plan activ</p>
                  ) : (
                    <button
                      className={`sub-plan-btn ${plan.highlight ? 'btn-gold-filled' : 'btn-outline'}`}
                      onClick={() => checkoutId && (hasActiveSubscription ? handleOpenPortal() : handleCheckout(checkoutId))}
                      disabled={isDisabled}
                    >
                      {loadingPlan === checkoutId
                        ? 'Se încarcă...'
                        : openingPortal
                          ? 'Se deschide portalul...'
                          : isCurrent
                            ? 'Planul tău'
                            : hasActiveSubscription
                              ? 'Gestionează planul'
                              : plan.cta}
                    </button>
                  )}

                  {plan.id === 'studio' && (
                    <div className={`sub-addon-card ${addonActive ? 'is-active' : ''}`}>
                      <div className="sub-addon-head">
                        <h4>Storage Add-on 500 GB</h4>
                        <span>{addonActive ? 'Activ' : '49 lei/lună'}</span>
                      </div>
                      {addonActive ? (
                        <p className="sub-addon-text">Add-on activ — 2.5 TB total stocare.</p>
                      ) : (
                        <p className="sub-addon-text">Extinzi instant planul Studio de la 2 TB la 2.5 TB.</p>
                      )}
                      {isCurrent ? (
                        addonActive ? (
                          <button
                            type="button"
                            className="sub-addon-btn sub-addon-btn-outline"
                            onClick={handleDeactivateAddon}
                            disabled={deactivatingAddon || activatingAddon || openingPortal}
                          >
                            {deactivatingAddon ? 'Se deschide portalul Stripe...' : 'Dezactivează'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="sub-addon-btn sub-addon-btn-solid"
                            onClick={handleActivateAddon}
                            disabled={activatingAddon || deactivatingAddon || Boolean(loadingPlan)}
                          >
                            {activatingAddon ? 'Se încarcă...' : 'Activează'}
                          </button>
                        )
                      ) : (
                        <p className="sub-muted">Disponibil doar pentru conturile cu plan Studio.</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {founderOfferActive && !hasActiveSubscription && (
            <p className="sub-founder-terms">
              Oferta se aplică abonamentelor plătite activate până la {FOUNDER_OFFER.endsAtLabel}, inclusiv. Dacă abonamentul este anulat sau expiră, oferta se pierde. <Link to="/termeni">Vezi condițiile complete</Link>.
            </p>
          )}
          {!hasActiveSubscription && (
            <label className="sub-legal-consent">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(event) => setTermsAccepted(event.target.checked)}
              />
              <span>
                Am citit și accept <Link to="/termeni">Termenii</Link> și <Link to="/refund">Politica de rambursare</Link> și solicit activarea serviciului imediat după plată.
              </span>
            </label>
          )}
        </>
      )}

      {showBilling && (
        <>
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
              <strong>{effectiveStorageLimit} GB</strong>
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
            <div className="sub-kv-row">
              <span>Add-on storage</span>
              <strong>{addonActive ? 'Activ (+500 GB)' : 'Inactiv'}</strong>
            </div>
          </div>

          <div style={{ marginTop: '16px', fontSize: '13px', color: '#6e6e73' }}>
            <Link to="/termeni" style={{ color: '#6e6e73', textDecoration: 'underline' }}>Termeni</Link>
            {' · '}
            <Link to="/confidentialitate" style={{ color: '#6e6e73', textDecoration: 'underline' }}>Confidențialitate</Link>
            {' · '}
            <Link to="/refund" style={{ color: '#6e6e73', textDecoration: 'underline' }}>Refund</Link>
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
        </>
      )}
    </div>
  );
};

export default SubscriptionSection;
