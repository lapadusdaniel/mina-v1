import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { SmartBillService } = require('../../functions/src/services/smartbill.service.js')

function createMockResponse({ status = 200, contentType = 'application/json', body = '' } = {}) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body))
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get(name) {
        if (String(name || '').toLowerCase() === 'content-type') return contentType
        return null
      },
    },
    async arrayBuffer() {
      return buffer
    },
  }
}

test('SmartBill PDF parser accepts %PDF payload even when content-type is application/json', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () =>
    createMockResponse({
      status: 200,
      contentType: 'application/json',
      body: '%PDF-1.4\n%fake-pdf-content',
    })

  try {
    const service = new SmartBillService({
      username: 'user@example.com',
      token: 'token',
      cif: '41893743',
      seriesName: 'MINA',
    })

    const result = await service.downloadInvoicePdf({
      series: 'MINA',
      number: '0001',
    })

    assert.equal(result.contentType, 'application/pdf')
    assert.equal(result.buffer.toString('utf8', 0, 4), '%PDF')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('SmartBill PDF parser retries query variants and succeeds on second request', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    if (calls === 1) {
      return createMockResponse({
        status: 401,
        contentType: 'application/json',
        body: '{"errorText":"Firma indisponibila"}',
      })
    }
    return createMockResponse({
      status: 200,
      contentType: 'application/json',
      body: '%PDF-1.7\n%second-attempt',
    })
  }

  try {
    const service = new SmartBillService({
      username: 'user@example.com',
      token: 'token',
      cif: '41893743',
      seriesName: 'MINA',
    })

    const result = await service.downloadInvoicePdf({
      series: 'MINA',
      number: '0002',
    })

    assert.equal(result.buffer.toString('utf8', 0, 4), '%PDF')
    assert.equal(calls, 2)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('SmartBill omits VAT fields by default for a non-VAT-registered issuer', () => {
  const service = new SmartBillService()
  const [item] = service.normalizeLineItems({
    amount: 49,
    description: 'Abonament Mina Plus',
  })

  assert.equal(item.price, 49)
  assert.equal('isTaxIncluded' in item, false)
  assert.equal('taxName' in item, false)
  assert.equal('taxPercentage' in item, false)
})

test('SmartBill includes configured VAT fields only when the issuer is marked as VAT payer', () => {
  const service = new SmartBillService({
    issuerIsTaxPayer: true,
    taxName: 'Normala',
    taxPercentage: 21,
  })
  const [item] = service.normalizeLineItems({ amount: 49 })

  assert.equal(item.isTaxIncluded, true)
  assert.equal(item.taxName, 'Normala')
  assert.equal(item.taxPercentage, 21)
})
