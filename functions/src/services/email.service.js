const { Resend } = require('resend')

const FALLBACK_STRIPE_PRICE_IDS = Object.freeze({
  starter: 'price_1T6a3S1ax2jGrLZHmevohZWA',
  pro: 'price_1T6a4F1ax2jGrLZH92vUsGzE',
  studio: 'price_1T6a501ax2jGrLZHgLBbkzT4',
})

const PLAN_STORAGE_BY_NAME = Object.freeze({
  Starter: 150,
  Pro: 600,
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
    if (amount === 39) return 'Starter'
    if (amount === 79) return 'Pro'
    if (amount === 129) return 'Studio'
  }

  return 'Starter'
}

function getStorageLimitForPlan(planName) {
  return PLAN_STORAGE_BY_NAME[planName] || 150
}

function buildWelcomeEmailHtml({ displayName = '', dashboardUrl = '' } = {}) {
  const safeDisplayName = escapeHtml(displayName || 'Fotograf')
  const safeDashboardUrl = escapeHtml(dashboardUrl)

  return `<!DOCTYPE html>
<html lang="ro">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bun venit în Mina</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'DM Sans','Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f5f5f7;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:580px;">

          <!-- Logo / Header -->
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <span style="font-family:-apple-system,BlinkMacSystemFont,'DM Sans',Arial,sans-serif;font-size:22px;font-weight:700;letter-spacing:-0.3px;color:#1d1d1f;">
                mina
              </span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.07);">

              <!-- Gold accent bar -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="height:4px;background:linear-gradient(90deg,#bf9b30 0%,#d4af37 50%,#bf9b30 100%);"></td>
                </tr>
              </table>

              <!-- Body -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:40px 40px 36px;">
                <tr>
                  <td>
                    <p style="margin:0 0 6px;font-size:13px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:#bf9b30;">
                      Bun venit
                    </p>
                    <h1 style="margin:0 0 24px;font-size:26px;font-weight:700;line-height:1.25;color:#1d1d1f;letter-spacing:-0.4px;">
                      Salut, ${safeDisplayName}! 👋
                    </h1>

                    <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#3a3a3c;">
                      Suntem bucuroși că ești alături de noi. Contul tău Mina este activ și dashboard-ul îți stă la dispoziție — gata să primească primele galerii.
                    </p>

                    <p style="margin:0 0 28px;font-size:16px;line-height:1.7;color:#3a3a3c;">
                      Cu Mina poți livra fotografii profesional, cu branding propriu și control complet — fără Google Drive, fără WeTransfer.
                    </p>

                    <!-- CTA Button -->
                    <table cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:32px;">
                      <tr>
                        <td style="border-radius:10px;background-color:#1d1d1f;">
                          <a href="${safeDashboardUrl}"
                             style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:-0.1px;border-radius:10px;">
                            Deschide dashboard-ul &rarr;
                          </a>
                        </td>
                      </tr>
                    </table>

                    <!-- Steps -->
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                           style="background-color:#f5f5f7;border-radius:10px;padding:20px 24px;margin-bottom:8px;">
                      <tr>
                        <td>
                          <p style="margin:0 0 12px;font-size:13px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;color:#86868b;">
                            Primii pași
                          </p>
                          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                            <tr>
                              <td style="padding:5px 0;font-size:14px;color:#3a3a3c;line-height:1.5;">
                                <span style="color:#bf9b30;font-weight:700;margin-right:8px;">①</span>
                                Creează prima galerie și copiază link-ul
                              </td>
                            </tr>
                            <tr>
                              <td style="padding:5px 0;font-size:14px;color:#3a3a3c;line-height:1.5;">
                                <span style="color:#bf9b30;font-weight:700;margin-right:8px;">②</span>
                                Încarcă fotografiile — thumbnails generate automat
                              </td>
                            </tr>
                            <tr>
                              <td style="padding:5px 0;font-size:14px;color:#3a3a3c;line-height:1.5;">
                                <span style="color:#bf9b30;font-weight:700;margin-right:8px;">③</span>
                                Trimite link-ul clientului și urmărește selecțiile
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:28px 16px 8px;">
              <p style="margin:0 0 6px;font-size:13px;color:#86868b;line-height:1.6;">
                O zi cu lumină frumoasă,<br />
                <strong style="color:#1d1d1f;">Echipa Mina</strong>
              </p>
              <p style="margin:8px 0 0;font-size:12px;color:#aeaeb2;">
                Ai primit acest email pentru că te-ai înregistrat pe
                <a href="https://cloudbymina.com" style="color:#86868b;text-decoration:underline;">cloudbymina.com</a>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function buildPaymentSuccessEmailHtml({ displayName = '', planName = 'Starter', storageLimitGb = 150, dashboardUrl = '' } = {}) {
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

function buildContactNotificationEmailHtml({ nume = '', email = '', mesaj = '' } = {}) {
  const safeNume = escapeHtml(nume || '-')
  const safeEmail = escapeHtml(email || '-')
  const safeMesaj = escapeHtml(mesaj || '-').replace(/\n/g, '<br />')

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1d1d1f">
      <h2 style="margin:0 0 12px">Mesaj nou din formularul de contact</h2>
      <p style="margin:0 0 8px"><strong>Nume:</strong> ${safeNume}</p>
      <p style="margin:0 0 8px"><strong>Email:</strong> ${safeEmail}</p>
      <p style="margin:0 0 8px"><strong>Mesaj:</strong></p>
      <p style="margin:0 0 18px">${safeMesaj}</p>
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


  async function sendContactNotificationEmail({ toEmail, nume, email, mesaj } = {}) {
    const to = normalizeEmail(toEmail)
    if (!to) {
      return { skipped: true, reason: 'missing_to_email' }
    }

    await resend.emails.send({
      from: fromEmail,
      to: [to],
      subject: `Contact nou: ${sanitize(nume || 'fără nume').slice(0, 120)}`,
      html: buildContactNotificationEmailHtml({ nume, email, mesaj }),
    })

    return {
      skipped: false,
      email: to,
    }
  }


  return {
    sendWelcomeEmail,
    sendPaymentSuccessEmail,
    sendSubscriptionCanceledEmail,
    sendPaymentFailedEmail,
    sendDisputeEmail,
    sendContactNotificationEmail,
  }
}

module.exports = {
  createEmailService,
}
