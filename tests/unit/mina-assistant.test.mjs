import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  MINA_ASSISTANT_MODEL,
  buildAssistantInstructions,
  extractResponseText,
  requestMinaAssistant,
  sanitizeAssistantHistory,
  sanitizeAssistantText,
} = require('../../functions/src/services/mina-assistant.service.js')

test('assistant sanitizes questions and bounded history', () => {
  assert.equal(sanitizeAssistantText('  Cum\n trimit\u0000 galeria?  '), 'Cum trimit galeria?')
  const history = sanitizeAssistantHistory([
    { role: 'system', content: 'ignorat ca rol privilegiat' },
    { role: 'assistant', content: 'Răspuns' },
    { role: 'user', content: '' },
  ])
  assert.deepEqual(history, [
    { role: 'user', content: 'ignorat ca rol privilegiat' },
    { role: 'assistant', content: 'Răspuns' },
  ])
})

test('assistant instructions stay grounded in Mina and include safe context', () => {
  const instructions = buildAssistantInstructions({ page: 'galerii', plan: 'Plus' })
  assert.match(instructions, /Ajutor Mina/)
  assert.match(instructions, /exclusiv informațiile din ghid/i)
  assert.match(instructions, /Context interfață: galerii/)
  assert.match(instructions, /Plan afișat: Plus/)
  assert.match(instructions, /Free: 5 GB/)
})

test('assistant extracts Responses API output text', () => {
  const text = extractResponseText({
    output: [{ content: [{ type: 'output_text', text: 'Deschide galeria.' }] }],
  })
  assert.equal(text, 'Deschide galeria.')
})

test('assistant sends a non-persistent bounded Responses API request', async () => {
  let captured = null
  const answer = await requestMinaAssistant({
    apiKey: 'test-key',
    question: 'Cum trimit galeria?',
    history: [{ role: 'assistant', content: 'Cu ce te ajut?' }],
    page: 'interior galerie',
    plan: 'Esențial',
    fetchImpl: async (url, options) => {
      captured = { url, options, body: JSON.parse(options.body) }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ output_text: 'Apasă Trimite galeria.' }),
      }
    },
  })

  assert.equal(answer, 'Apasă Trimite galeria.')
  assert.equal(captured.url, 'https://api.openai.com/v1/responses')
  assert.equal(captured.body.model, MINA_ASSISTANT_MODEL)
  assert.equal(captured.body.store, false)
  assert.equal(captured.body.max_output_tokens, 500)
  assert.equal(captured.body.input.at(-1).content, 'Cum trimit galeria?')
})
