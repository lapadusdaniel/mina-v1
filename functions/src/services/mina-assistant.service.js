const MINA_ASSISTANT_MODEL = 'gpt-5.6-terra'

const MINA_KNOWLEDGE = `
Mina este o platformă pentru fotografi din România, disponibilă la cloudbymina.com.

FUNCȚII PRINCIPALE
- Fotograful creează galerii, încarcă fotografii și le poate organiza în foldere.
- Galeria poate fi previzualizată, trimisă prin link, email, WhatsApp sau Messenger și protejată cu parolă.
- Clientul poate marca fotografii favorite, poate crea liste de selecție și poate trimite selecția finală fotografului.
- După finalizare, selecția clientului se blochează. Fotograful o poate redeschide din secțiunea Selecții a galeriei.
- Pentru Lightroom, fotograful poate copia lista numelor fișierelor din sertarul Selecții.
- Fotograful poate descărca originalele selectate de client.
- Mina include un profil public și un editor pentru site-ul fotografului.

GALERII
- O galerie nouă se creează din Galerii → Adaugă galerie.
- Fotografii suplimentare se încarcă din interiorul galeriei cu Adaugă poze.
- Setările galeriei includ identitate, aspect, acces, parolă, descărcări, selecții și expirare.
- Linkul se trimite din butonul Trimite galeria.
- Preview-ul clientului se deschide din iconița cu ochi din antetul galeriei.
- Galeriile pot fi fixate, arhivate, mutate în coș și restaurate.
- Coșul păstrează galeriile înainte de ștergerea definitivă.

SELECȚII
- Butonul Selecții apare în antetul galeriei numai după ce există cel puțin o selecție.
- În lucru înseamnă că utilizatorul încă poate modifica fotografiile alese.
- Finalizată înseamnă că selecția a fost trimisă și blocată.
- Fotograful poate vedea fotografiile, copia șirul pentru Lightroom, descărca originalele sau redeschide selecția.

CONT ȘI PLANURI
- Free: 5 GB și maximum 3 galerii active.
- Esențial: 100 GB.
- Plus: 500 GB.
- Pro: 1 TB.
- Studio: 2 TB.
- Planurile plătite includ galerii nelimitate, parole, selecții și site de prezentare.
- Planul și facturarea se gestionează din Plan și facturare.
- Datele profilului se gestionează din Setări.
- Profilul public se configurează din Profil public.

SIGURANȚĂ ȘI LIMITĂRI
- Nu cere și nu accepta parole, chei API, date de card sau alte secrete.
- Nu pretinde că ai modificat contul, galeria, abonamentul sau fotografiile.
- Nu ai acces direct la datele utilizatorului și nu poți efectua acțiuni în numele lui.
- Pentru plăți eșuate, probleme de cont sau situații care nu apar în acest ghid, recomandă formularul de contact Mina.
`.trim()

function sanitizeAssistantText(value, maxLength = 700) {
  return Array.from(String(value || ''))
    .map((character) => {
      const code = character.charCodeAt(0)
      return code < 32 || code === 127 ? ' ' : character
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function sanitizeAssistantHistory(value) {
  if (!Array.isArray(value)) return []
  return value
    .slice(-6)
    .map((item) => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: sanitizeAssistantText(item?.content, 700),
    }))
    .filter((item) => item.content)
}

function buildAssistantInstructions({ page = 'dashboard', plan = 'Free' } = {}) {
  const safePage = sanitizeAssistantText(page, 80) || 'dashboard'
  const safePlan = sanitizeAssistantText(plan, 40) || 'Free'
  return `Ești Ajutor Mina, asistentul oficial al platformei Mina pentru fotografi.
Răspunde în română, clar, prietenos și scurt. Folosește cel mult 6 pași când explici un proces.
Răspunde numai despre Mina și fluxurile fotografilor. Dacă întrebarea nu ține de Mina, spune politicos că poți ajuta doar cu platforma.
Folosește exclusiv informațiile din ghidul de mai jos. Dacă răspunsul nu este în ghid, spune sincer că nu ești sigur și recomandă Contact.
Nu inventa meniuri, prețuri, funcții, politici sau acțiuni. Nu spune că ai accesat ori modificat contul.
Nu cere niciodată parole, date de card, chei sau alte informații sensibile.

Context interfață: ${safePage}
Plan afișat: ${safePlan}

GHID MINA
${MINA_KNOWLEDGE}`
}

function extractResponseText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim()
  }
  const parts = []
  for (const output of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(output?.content) ? output.content : []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') parts.push(content.text)
    }
  }
  return parts.join('\n').trim()
}

async function requestMinaAssistant({ apiKey, question, history, page, plan, fetchImpl = fetch }) {
  const cleanQuestion = sanitizeAssistantText(question, 500)
  if (!cleanQuestion) throw new Error('QUESTION_REQUIRED')

  const input = [
    ...sanitizeAssistantHistory(history).map((item) => ({
      role: item.role,
      content: item.content,
    })),
    { role: 'user', content: cleanQuestion },
  ]

  const response = await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MINA_ASSISTANT_MODEL,
      instructions: buildAssistantInstructions({ page, plan }),
      input,
      reasoning: { effort: 'low' },
      max_output_tokens: 500,
      store: false,
    }),
  })

  const rawText = await response.text()
  let payload = {}
  try { payload = rawText ? JSON.parse(rawText) : {} } catch (_) {}
  if (!response.ok) {
    const error = new Error('OPENAI_REQUEST_FAILED')
    error.status = response.status
    throw error
  }

  const answer = extractResponseText(payload)
  if (!answer) throw new Error('EMPTY_OPENAI_RESPONSE')
  return sanitizeAssistantText(answer, 2400)
}

module.exports = {
  MINA_ASSISTANT_MODEL,
  MINA_KNOWLEDGE,
  buildAssistantInstructions,
  extractResponseText,
  requestMinaAssistant,
  sanitizeAssistantHistory,
  sanitizeAssistantText,
}
