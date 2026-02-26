import React, { useEffect, useState } from 'react'
import { Download, FileText, RefreshCw } from 'lucide-react'
import { getAppServices } from '../core/bootstrap/appBootstrap'
import './BillingHistory.css'

const { billing: billingService } = getAppServices()

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

function formatAmount(value, currency = 'RON') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return new Intl.NumberFormat('ro-RO', {
    style: 'currency',
    currency: String(currency || 'RON').toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value))
}

function formatSeriesNumber(invoice) {
  const series = String(invoice?.series || '').trim()
  const number = String(invoice?.number || invoice?.id || '').trim()
  if (!series && !number) return '—'
  if (!series) return number
  if (!number) return series
  return `${series}/${number}`
}

function BillingHistory({ user }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [invoices, setInvoices] = useState([])

  const loadInvoices = async () => {
    if (!user?.uid) return
    setLoading(true)
    setError('')

    try {
      const rows = await billingService.getInvoices(user.uid, { limit: 60 })
      setInvoices(rows)
    } catch (err) {
      console.error('Eroare încărcare istoric facturi:', err)
      setError('Nu pot încărca facturile în acest moment.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!user?.uid) {
      setInvoices([])
      return
    }
    loadInvoices()
  }, [user?.uid])

  return (
    <section className="bill-history-card">
      <div className="bill-history-head">
        <div>
          <h3>Istoric facturare</h3>
          <p>Facturile emise pentru abonamentele tale.</p>
        </div>
        <button
          type="button"
          className="bill-history-refresh"
          onClick={loadInvoices}
          disabled={loading}
          aria-label="Actualizează istoric facturi"
        >
          <RefreshCw size={14} />
          {loading ? 'Se încarcă...' : 'Actualizează'}
        </button>
      </div>

      {error && <p className="bill-history-error">{error}</p>}

      {loading && invoices.length === 0 ? (
        <p className="bill-history-muted">Se încarcă facturile...</p>
      ) : invoices.length === 0 ? (
        <div className="bill-history-empty">
          <FileText size={16} />
          <p>Nu ai nicio factură emisă încă.</p>
        </div>
      ) : (
        <div className="bill-history-table-wrap">
          <table className="bill-history-table">
            <thead>
              <tr>
                <th>Dată</th>
                <th>Serie/Număr</th>
                <th>Sumă</th>
                <th>Acțiuni</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => {
                const pdfUrl = String(invoice?.url || '').trim()
                return (
                  <tr key={invoice.id}>
                    <td>{formatDate(invoice.createdAt)}</td>
                    <td>{formatSeriesNumber(invoice)}</td>
                    <td>{formatAmount(invoice.amount, invoice.currency)}</td>
                    <td>
                      {pdfUrl ? (
                        <a
                          href={pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="bill-history-download"
                          title="Deschide factura PDF"
                        >
                          <Download size={14} />
                          Download PDF
                        </a>
                      ) : (
                        <span className="bill-history-no-pdf">PDF indisponibil</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default BillingHistory
