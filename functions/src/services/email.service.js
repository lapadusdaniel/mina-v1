const { Resend } = require('resend')

const FALLBACK_STRIPE_PRICE_IDS = Object.freeze({
  starter: 'price_1T5srU1ax2jGrLZHgpdKCPnm',
  pro: 'price_1T5ssF1ax2jGrLZHNR9EjINy',
  studio: 'price_1T5ssk1ax2jGrLZHZ0Lxitgp',
})

const PLAN_STORAGE_BY_NAME = Object.freeze({
  Starter: 200,
  Pro: 500,
  Studio: 2000,
})

function sanitize(value) {
  return String(value || '').trim()
}

function normalizeEmail(value) {
  return sanitize(value).toLowerCase().slice(0, 190)
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function resolvePlanFromPriceId(priceId, ids = {}) {
  const candidate = sanitize(priceId)
  if (!candidate) return ''
  if (candidate === ids.starter) return 'Starter'
  if (candidate === ids.pro) return 'Pro'
  if (candidate === ids.studio) return 'Studio'
  return ''
}

function resolvePlanFromName(value) {
  const normalized = sanitize(value).toLowerCase()
  if (!normalized) return ''
  if (normalized.includes('starter')) return 'Starter'
  if (normalized.includes('studio') || normalized.includes('unlimited')) return 'Studio'
  if (normalized.includes('pro')) return 'Pro'
  return ''
}

function resolvePlanForPaymentEmail({ session = {}, paymentData = {}, priceIds = {} } = {}) {
  const fallbackIds = {
    starter: sanitize(priceIds.starter) || FALLBACK_STRIPE_PRICE_IDS.starter,
    pro: sanitize(priceIds.pro) || FALLBACK_STRIPE_PRICE_IDS.pro,
    studio: sanitize(priceIds.studio) || FALLBACK_STRIPE_PRICE_IDS.studio,
  }

  const priceIdCandidates = [
    session.metadata?.priceId,
    session.metadata?.stripePriceId,
    paymentData.primaryPriceId,
    ...(paymentData.lineItems || []).map((item) => item?.priceId),
  ]

  for (const priceId of priceIdCandidates) {
    const fromPrice = resolvePlanFromPriceId(priceId, fallbackIds)
    if (fromPrice) return fromPrice
  }

  const nameCandidates = [
    session.metadata?.planName,
    session.metadata?.plan,
    ...(paymentData.lineItems || []).map((item) => item?.name),
  ]

  for (const name of nameCandidates) {
    const fromName = resolvePlanFromName(name)
    if (fromName) return fromName
  }

  const amount = Number(paymentData.amount)
  if (Number.isFinite(amount)) {
    if (amount === 49) return 'Starter'
    if (amount === 99) return 'Pro'
    if (amount === 149) return 'Studio'
  }

  return 'Starter'
}

function getStorageLimitForPlan(planName) {
  return PLAN_STORAGE_BY_NAME[planName] || 200
}

function buildWelcomeEmailHtml({ displayName = '', dashboardUrl = '' } = {}) {
  const safeDisplayName = escapeHtml(displayName || 'Fotograf')
  const safeDashboardUrl = escapeHtml(dashboardUrl)

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1d1d1f">
      <h2 style="margin:0 0 12px">Bun venit în Mina!</h2>
      <p style="margin:0 0 12px">Salut, ${safeDisplayName} 👋</p>
      <p style="margin:0 0 18px">
        Contul tău a fost creat cu succes, iar dashboard-ul este pregătit pentru primele galerii.
      </p>
      <p style="margin:0 0 18px">
        <a href="${safeDashboardUrl}" style="display:inline-block;padding:10px 16px;background:#111111;color:#ffffff;text-decoration:none;border-radius:8px">
          Intră în dashboard
        </a>
      </p>
      <p style="margin:0;color:#666">Echipa Mina</p>
    </div>
  `
}

function buildPaymentSuccessEmailHtml({ displayName = '', planName = 'Starter', storageLimitGb = 200, dashboardUrl = '' } = {}) {
  const safeDisplayName = escapeHtml(displayName || 'Fotograf')
  const safePlanName = escapeHtml(planName)
  const safeStorage = escapeHtml(`${storageLimitGb} GB`)
  const safeDashboardUrl = escapeHtml(dashboardUrl)

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1d1d1f">
      <h2 style="margin:0 0 12px">Plată confirmată cu succes ✅</h2>
      <p style="margin:0 0 12px">Salut, ${safeDisplayName}</p>
      <p style="margin:0 0 8px">Abonamentul tău Mina este acum activ:</p>
      <ul style="margin:0 0 16px;padding-left:20px">
        <li><strong>Plan:</strong> ${safePlanName}</li>
        <li><strong>Stocare:</strong> ${safeStorage}</li>
      </ul>
      <p style="margin:0 0 18px">
        Îți poți gestiona galeriile direct din dashboard.
      </p>
      <p style="margin:0 0 18px">
        <a href="${safeDashboardUrl}" style="display:inline-block;padding:10px 16px;background:#111111;color:#ffffff;text-decoration:none;border-radius:8px">
          Deschide dashboard-ul
        </a>
      </p>
      <p style="margin:0;color:#666">Mulțumim, echipa Mina</p>
    </div>
  `
}


function buildSubscriptionCanceledEmailHtml(userEmail, planName) {
  const safeEmail = escapeHtml(userEmail || '')
  const safePlanName = escapeHtml(planName || 'abonament activ')

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1d1d1f">
      <h2 style="margin:0 0 12px">Abonamentul tău Mina a expirat</h2>
      <p style="margin:0 0 12px">Salut, ${safeEmail || 'Fotograf'}</p>
      <p style="margin:0 0 8px">
        Abonamentul <strong>${safePlanName}</strong> a fost anulat din Stripe.
      </p>
      <p style="margin:0 0 8px">
        Fotografiile tale rămân păstrate în siguranță încă 90 de zile.
      </p>
      <p style="margin:0 0 18px">
        Poți reactiva oricând un plan direct din dashboard-ul Mina.
      </p>
      <p style="margin:0;color:#666">Echipa Mina</p>
    </div>
  `
}

function buildPaymentFailedEmailHtml(userEmail, planName, customerPortalUrl) {
  const safeEmail = escapeHtml(userEmail || '')
  const safePlanName = escapeHtml(planName || 'abonament activ')
  const safeCustomerPortalUrl = escapeHtml(customerPortalUrl || '')

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1d1d1f">
      <h2 style="margin:0 0 12px">Plata abonamentului a eșuat</h2>
      <p style="margin:0 0 12px">Salut, ${safeEmail || 'Fotograf'}</p>
      <p style="margin:0 0 8px">
        Nu am putut procesa plata pentru planul <strong>${safePlanName}</strong>.
      </p>
      <p style="margin:0 0 8px">
        Ai la dispoziție 7 zile să actualizezi metoda de plată, fără să pierzi accesul curent.
      </p>
      ${
        safeCustomerPortalUrl
          ? `<p style="margin:0 0 18px">
              <a href="${safeCustomerPortalUrl}" style="display:inline-block;padding:10px 16px;background:#111111;color:#ffffff;text-decoration:none;border-radius:8px">
                Actualizează metoda de plată
              </a>
            </p>`
          : ''
      }
      <p style="margin:0;color:#666">Echipa Mina</p>
    </div>
  `
}


function buildDisputeEmailHtml(userEmail) {
  const safeEmail = escapeHtml(userEmail || '')

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1d1d1f">
      <h2 style="margin:0 0 12px">Plată contestată</h2>
      <p style="margin:0 0 12px">Salut, ${safeEmail || 'Fotograf'}</p>
      <p style="margin:0 0 8px">
        O plată asociată abonamentului tău a fost contestată în Stripe.
      </p>
      <p style="margin:0 0 8px">
        Contul tău este temporar restricționat până la clarificarea disputei.
      </p>
      <p style="margin:0 0 18px">
        Pentru suport, contactează-ne la <a href="mailto:hello@cloudbymina.com">hello@cloudbymina.com</a>.
      </p>
      <p style="margin:0;color:#666">Echipa Mina</p>
    </div>
  `
}

function createEmailService({ apiKey, fromEmail, dashboardUrl, priceIds = {} } = {}) {
  const key = sanitize(apiKey)
  if (!key) {
    throw new Error('RESEND_API_KEY is not configured.')
  }

  const resend = new Resend(key)

  async function sendWelcomeEmail(user = {}) {
    const email = normalizeEmail(user.email)
    if (!email) {
      return { skipped: true, reason: 'missing_email' }
    }

    await resend.emails.send({
      from: fromEmail,
      to: [email],
      subject: 'Bun venit în Mina! Dashboard-ul tău este gata',
      html: buildWelcomeEmailHtml({
        displayName: sanitize(user.displayName) || 'Fotograf',
        dashboardUrl,
      }),
    })

    return { skipped: false, email }
  }

  async function sendPaymentSuccessEmail({ customerEmail, session = {}, paymentData = {}, userData = {} } = {}) {
    const email = normalizeEmail(customerEmail)
    if (!email) {
      return { skipped: true, reason: 'missing_email' }
    }

    const planName = resolvePlanForPaymentEmail({
      session,
      paymentData,
      priceIds,
    })

    const storageLimitGb = getStorageLimitForPlan(planName)
    const displayName =
      sanitize(userData.displayName || userData.name) ||
      sanitize(session.customer_details?.name) ||
      'Fotograf'

    await resend.emails.send({
      from: fromEmail,
      to: [email],
      subject: `Plată confirmată • Plan ${planName}`,
      html: buildPaymentSuccessEmailHtml({
        displayName,
        planName,
        storageLimitGb,
        dashboardUrl,
      }),
    })

    return {
      skipped: false,
      email,
      planName,
      storageLimitGb,
    }
  }


  async function sendSubscriptionCanceledEmail({ customerEmail, planName = 'Plan activ' } = {}) {
    const email = normalizeEmail(customerEmail)
    if (!email) {
      return { skipped: true, reason: 'missing_email' }
    }

    await resend.emails.send({
      from: fromEmail,
      to: [email],
      subject: 'Abonament anulat • Mina',
      html: buildSubscriptionCanceledEmailHtml(email, planName),
    })

    return {
      skipped: false,
      email,
      planName,
    }
  }

  async function sendPaymentFailedEmail({
    customerEmail,
    planName = 'Plan activ',
    customerPortalUrl = '',
  } = {}) {
    const email = normalizeEmail(customerEmail)
    if (!email) {
      return { skipped: true, reason: 'missing_email' }
    }

    await resend.emails.send({
      from: fromEmail,
      to: [email],
      subject: 'Plată eșuată • Mina',
      html: buildPaymentFailedEmailHtml(email, planName, customerPortalUrl),
    })

    return {
      skipped: false,
      email,
      planName,
      customerPortalUrl: sanitize(customerPortalUrl),
    }
  }


  async function sendDisputeEmail({ customerEmail } = {}) {
    const email = normalizeEmail(customerEmail)
    if (!email) {
      return { skipped: true, reason: 'missing_email' }
    }

    await resend.emails.send({
      from: fromEmail,
      to: [email],
      subject: 'Plată contestată • Mina',
      html: buildDisputeEmailHtml(email),
    })

    return {
      skipped: false,
      email,
    }
  }


  return {
    sendWelcomeEmail,
    sendPaymentSuccessEmail,
    sendSubscriptionCanceledEmail,
    sendPaymentFailedEmail,
    sendDisputeEmail,
  }
}

module.exports = {
  createEmailService,
}
