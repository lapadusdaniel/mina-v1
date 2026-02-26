const SMARTBILL_API_BASE = 'https://ws.smartbill.ro/SBORO/api'
const DEFAULT_CURRENCY = 'RON'
const DEFAULT_UNIT = 'serv'
const DEFAULT_TAX_NAME = 'Normala'
const DEFAULT_TAX_PERCENTAGE = 21

function sanitizeString(value, maxLen = 255) {
  return String(value || '').trim().slice(0, maxLen)
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function formatDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now())
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeCountry(value) {
  const raw = sanitizeString(value || 'Romania', 100)
  return raw || 'Romania'
}

function normalizeEmail(value) {
  return sanitizeString(value, 190).toLowerCase()
}

class SmartBillService {
  constructor({
    username = process.env.SMARTBILL_USERNAME,
    token = process.env.SMARTBILL_TOKEN,
    cif = process.env.SMARTBILL_CIF,
    seriesName = process.env.SMARTBILL_SERIES_NAME,
    baseUrl = process.env.SMARTBILL_API_BASE,
    taxName = process.env.SMARTBILL_TAX_NAME,
    taxPercentage = process.env.SMARTBILL_TAX_PERCENTAGE,
  } = {}) {
    this.username = sanitizeString(username, 190)
    this.token = sanitizeString(token, 300)
    this.cif = sanitizeString(cif, 32)
    this.seriesName = sanitizeString(seriesName, 32)
    this.baseUrl = sanitizeString(baseUrl || SMARTBILL_API_BASE, 120)
    this.taxName = sanitizeString(taxName || DEFAULT_TAX_NAME, 32)

    const parsedTax = toNumber(taxPercentage, DEFAULT_TAX_PERCENTAGE)
    this.taxPercentage = Number.isFinite(parsedTax) ? parsedTax : DEFAULT_TAX_PERCENTAGE
  }

  hasCredentials() {
    return Boolean(this.username && this.token && this.cif && this.seriesName)
  }

  buildAuthHeader() {
    const raw = `${this.username}:${this.token}`
    return `Basic ${Buffer.from(raw).toString('base64')}`
  }

  normalizeBillingDetails(billingDetails = {}) {
    const type = String(billingDetails.type || 'individual').toLowerCase() === 'business'
      ? 'business'
      : 'individual'

    return {
      type,
      name: sanitizeString(billingDetails.name, 160),
      address: sanitizeString(billingDetails.address, 220),
      city: sanitizeString(billingDetails.city, 100),
      county: sanitizeString(billingDetails.county, 100),
      country: normalizeCountry(billingDetails.country),
      cui: type === 'business' ? sanitizeString(billingDetails.cui, 32).toUpperCase() : '',
      regCom: type === 'business' ? sanitizeString(billingDetails.regCom, 64).toUpperCase() : '',
    }
  }

  normalizeLineItems(paymentData = {}) {
    const currency = sanitizeString(paymentData.currency || DEFAULT_CURRENCY, 8).toUpperCase() || DEFAULT_CURRENCY
    const rawLineItems = Array.isArray(paymentData.lineItems) ? paymentData.lineItems : []

    const fallbackAmount = Number(toNumber(paymentData.amount, 0).toFixed(2))
    const fallbackName = sanitizeString(paymentData.description || 'Abonament Mina', 180)

    const sourceItems = rawLineItems.length
      ? rawLineItems
      : [{ name: fallbackName, quantity: 1, unitPrice: fallbackAmount }]

    return sourceItems.map((item) => {
      const quantity = Math.max(1, toNumber(item.quantity, 1))
      const unitPriceRaw = item.unitPrice ?? item.price ?? fallbackAmount
      const unitPrice = Number(toNumber(unitPriceRaw, 0).toFixed(2))

      return {
        name: sanitizeString(item.name || fallbackName, 180),
        quantity,
        measuringUnitName: sanitizeString(item.measuringUnitName || item.unit || DEFAULT_UNIT, 20) || DEFAULT_UNIT,
        currency,
        price: unitPrice,
        isTaxIncluded: true,
        taxName: this.taxName,
        taxPercentage: this.taxPercentage,
        isService: true,
        saveToDb: false,
      }
    })
  }

  buildInvoicePayload(billingDetails, paymentData = {}) {
    const customer = this.normalizeBillingDetails(billingDetails)

    if (!customer.name) {
      throw new Error('SmartBill: billingDetails.name este obligatoriu')
    }
    if (!customer.address) {
      throw new Error('SmartBill: billingDetails.address este obligatoriu')
    }

    if (customer.type === 'business') {
      if (!customer.cui) throw new Error('SmartBill: CUI este obligatoriu pentru persoane juridice')
      if (!customer.regCom) throw new Error('SmartBill: RegCom este obligatoriu pentru persoane juridice')
    }

    const customerEmail = normalizeEmail(paymentData.customerEmail || paymentData.email)
    if (!customerEmail) {
      throw new Error('SmartBill: client email este obligatoriu pentru trimiterea facturii pe email')
    }

    const products = this.normalizeLineItems(paymentData)

    const issueDate = formatDate(paymentData.issueDate || Date.now())
    const dueDate = formatDate(paymentData.dueDate || issueDate)

    const client = {
      name: customer.name,
      email: customerEmail,
      address: customer.address,
      city: customer.city,
      county: customer.county,
      country: customer.country,
      saveToDb: true,
      isTaxPayer: customer.type === 'business',
    }

    if (customer.type === 'business') {
      client.vatCode = customer.cui
      client.regCom = customer.regCom
    }

    const payload = {
      companyVatCode: this.cif,
      client,
      issueDate,
      dueDate,
      seriesName: this.seriesName,
      sendEmail: true,
      useStock: false,
      isDraft: false,
      currency: products[0]?.currency || DEFAULT_CURRENCY,
      products,
    }

    const observation = sanitizeString(paymentData.description, 500)
    if (observation) {
      payload.observations = observation
    }

    return payload
  }

  async requestInvoice(payload) {
    const response = await fetch(`${this.baseUrl}/invoice`, {
      method: 'POST',
      headers: {
        Authorization: this.buildAuthHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const bodyText = await response.text()
    let body

    try {
      body = bodyText ? JSON.parse(bodyText) : {}
    } catch (err) {
      body = { raw: bodyText }
    }

    if (!response.ok) {
      const apiMessage =
        body?.errorText ||
        body?.error ||
        body?.message ||
        bodyText ||
        `HTTP ${response.status}`

      const error = new Error(`SmartBill invoice failed (${response.status}): ${apiMessage}`)
      error.status = response.status
      error.response = body
      error.requestPayload = payload
      error.apiMessage = String(apiMessage || '')
      throw error
    }

    return { body, payload }
  }

  buildInvoiceResult(body) {
    const series = sanitizeString(
      body?.series || body?.seriesName || body?.numberSeries || body?.invoice?.series || this.seriesName,
      32
    )
    const number = sanitizeString(
      body?.number || body?.invoiceNumber || body?.numberString || body?.invoice?.number,
      32
    )
    const url = sanitizeString(
      body?.url || body?.invoiceUrl || body?.documentUrl || body?.invoice?.url,
      500
    )

    if (!number) {
      const error = new Error('SmartBill response missing invoice number')
      error.response = body
      throw error
    }

    return {
      series: series || this.seriesName,
      number,
      url: url || null,
      raw: body,
    }
  }

  isEmailServerMissingError(err) {
    const message = String(err?.apiMessage || err?.message || '').toLowerCase()
    return message.includes('server-ul de email nu a fost configurat')
      || message.includes('serverul de email nu a fost configurat')
  }

  async issueInvoice(billingDetails, paymentData = {}) {
    if (!this.hasCredentials()) {
      throw new Error('SmartBill credentials missing (SMARTBILL_USERNAME, SMARTBILL_TOKEN, SMARTBILL_CIF, SMARTBILL_SERIES_NAME)')
    }

    const payload = this.buildInvoicePayload(billingDetails, paymentData)

    try {
      const { body } = await this.requestInvoice(payload)
      const result = this.buildInvoiceResult(body)
      return {
        ...result,
        sentEmail: true,
      }
    } catch (err) {
      if (!this.isEmailServerMissingError(err)) {
        throw err
      }

      const fallbackPayload = {
        ...payload,
        sendEmail: false,
      }

      const { body } = await this.requestInvoice(fallbackPayload)
      const result = this.buildInvoiceResult(body)

      return {
        ...result,
        sentEmail: false,
        warning: 'SmartBill email server not configured. Invoice created without automatic email.',
      }
    }
  }
}

const smartBillService = new SmartBillService()

module.exports = {
  SmartBillService,
  smartBillService,
}
