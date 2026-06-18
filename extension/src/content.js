const BACKEND_URL = 'http://localhost:3001/api'

let isOpen = false
let history = []
let pendingOperation = null

// ─── Inject UI ────────────────────────────────────────────────────────────────

function injectUI() {
  if (document.getElementById('sfcc-copilot-root')) return

  const root = document.createElement('div')
  root.id = 'sfcc-copilot-root'
  root.innerHTML = `
    <button id="scp-toggle" title="SFCC Copilot">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
        <path d="M8 12h8M12 8v8"/>
      </svg>
      <span>Copilot</span>
    </button>

    <div id="scp-panel">
      <div id="scp-header">
        <div id="scp-title">
          <span class="scp-logo">✦</span>
          <div>
            <div class="scp-name">SFCC Copilot</div>
            <div class="scp-site" id="scp-site-label">Business Manager</div>
          </div>
        </div>
        <button id="scp-close">✕</button>
      </div>

      <div id="scp-messages">
        <div class="scp-msg scp-msg--assistant">
          <div class="scp-bubble">Olá! Descreva a promoção, campanha ou cupom que você quer criar.</div>
        </div>
      </div>

      <div id="scp-suggestions">
        <button class="scp-pill" data-text="20% off em bolsas pra clientes VIP este fim de semana">20% off VIP este fim de semana</button>
        <button class="scp-pill" data-text="Frete grátis acima de R$ 200 até domingo">Frete grátis acima de R$200</button>
        <button class="scp-pill" data-text="Cupom FLASH20 de 20% off com 200 usos">Cupom FLASH20</button>
      </div>

      <div id="scp-input-row">
        <textarea id="scp-input" placeholder="Descreva a promoção..." rows="1"></textarea>
        <button id="scp-send">↑</button>
      </div>
    </div>
  `
  document.body.appendChild(root)
  bindEvents()
  setSiteLabel()
}

function setSiteLabel() {
  const match = location.hostname.match(/^([^.]+)/)
  const label = document.getElementById('scp-site-label')
  if (label && match) label.textContent = match[1].toUpperCase()
}

// ─── Events ───────────────────────────────────────────────────────────────────

function bindEvents() {
  document.getElementById('scp-toggle').onclick = togglePanel
  document.getElementById('scp-close').onclick = togglePanel
  document.getElementById('scp-send').onclick = sendMessage
  document.getElementById('scp-input').onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }
  document.querySelectorAll('.scp-pill').forEach(pill => {
    pill.onclick = () => {
      document.getElementById('scp-input').value = pill.dataset.text
      document.getElementById('scp-suggestions').style.display = 'none'
      sendMessage()
    }
  })
}

function togglePanel() {
  isOpen = !isOpen
  document.getElementById('scp-panel').classList.toggle('scp-panel--open', isOpen)
}

// ─── Messaging ────────────────────────────────────────────────────────────────

function addMessage(role, content) {
  const msgs = document.getElementById('scp-messages')
  const wrapper = document.createElement('div')
  wrapper.className = `scp-msg scp-msg--${role}`

  if (typeof content === 'string') {
    const bubble = document.createElement('div')
    bubble.className = 'scp-bubble'
    bubble.textContent = content
    wrapper.appendChild(bubble)
  } else {
    wrapper.appendChild(content)
  }

  msgs.appendChild(wrapper)
  msgs.scrollTop = msgs.scrollHeight
}

function showTyping() {
  const msgs = document.getElementById('scp-messages')
  const el = document.createElement('div')
  el.id = 'scp-typing'
  el.className = 'scp-msg scp-msg--assistant'
  el.innerHTML = '<div class="scp-bubble scp-typing"><span></span><span></span><span></span></div>'
  msgs.appendChild(el)
  msgs.scrollTop = msgs.scrollHeight
}

function removeTyping() {
  document.getElementById('scp-typing')?.remove()
}

// ─── Preview card ─────────────────────────────────────────────────────────────

function buildPreviewCard(data) {
  const card = document.createElement('div')
  card.className = 'scp-card'

  const header = document.createElement('div')
  header.className = 'scp-card__header'
  header.innerHTML = `<span class="scp-tag">Preview</span><span>${data.promotion?.name || data.coupon?.code || data.campaign?.name || ''}</span>`
  card.appendChild(header)

  const body = document.createElement('div')
  body.className = 'scp-card__body'

  const fields = []
  if (data.promotion) {
    const typeLabel = data.promotion.type === 'percentage'
      ? `${data.promotion.discount_value}% de desconto`
      : data.promotion.type === 'free_shipping' ? 'Frete grátis'
      : `R$ ${data.promotion.discount_value} de desconto`
    fields.push(['Desconto', typeLabel])
    if (data.promotion.condition_customer_group) fields.push(['Grupo', data.promotion.condition_customer_group])
    if (data.promotion.condition_min_order) fields.push(['Pedido mín.', `R$ ${data.promotion.condition_min_order}`])
    if (data.promotion.start_date) fields.push(['Início', data.promotion.start_date.split('T')[0]])
    if (data.promotion.end_date) fields.push(['Fim', data.promotion.end_date.split('T')[0]])
  }
  if (data.coupon) {
    fields.push(['Código', data.coupon.code])
    if (data.coupon.usage_limit) fields.push(['Limite', `${data.coupon.usage_limit} usos`])
  }

  fields.forEach(([label, value]) => {
    const row = document.createElement('div')
    row.className = 'scp-field'
    row.innerHTML = `<span class="scp-field__label">${label}</span><span class="scp-field__value">${value}</span>`
    body.appendChild(row)
  })
  card.appendChild(body)

  const actions = document.createElement('div')
  actions.className = 'scp-card__actions'

  const confirmBtn = document.createElement('button')
  confirmBtn.className = 'scp-btn scp-btn--primary'
  confirmBtn.textContent = 'Confirmar e criar'
  confirmBtn.onclick = () => execute(data, card)

  const cancelBtn = document.createElement('button')
  cancelBtn.className = 'scp-btn scp-btn--secondary'
  cancelBtn.textContent = 'Cancelar'
  cancelBtn.onclick = () => { card.closest('.scp-msg').remove(); addMessage('assistant', 'Cancelado. Posso ajudar com outra coisa?') }

  actions.appendChild(confirmBtn)
  actions.appendChild(cancelBtn)
  card.appendChild(actions)
  return card
}

// ─── Execute ──────────────────────────────────────────────────────────────────

async function execute(data, cardEl) {
  cardEl?.closest('.scp-msg')?.remove()
  showTyping()

  try {
    const res = await fetch(`${BACKEND_URL}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation: data }),
    })
    const json = await res.json()
    removeTyping()

    if (!json.ok) throw new Error(json.error)

    addMessage('assistant', `✓ Pronto! ${data.summary} criado com sucesso. Acesse Merchant Tools → Online Marketing para visualizar.`)
    history = []
  } catch (err) {
    removeTyping()
    addMessage('assistant', `Erro ao criar: ${err.message}`)
  }
}

// ─── Send message ─────────────────────────────────────────────────────────────

async function sendMessage() {
  const input = document.getElementById('scp-input')
  const text = input.value.trim()
  if (!text) return

  input.value = ''
  document.getElementById('scp-suggestions').style.display = 'none'
  addMessage('user', text)
  showTyping()

  try {
    const res = await fetch(`${BACKEND_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history }),
    })
    const json = await res.json()
    removeTyping()

    if (!json.ok) throw new Error(json.error)

    const data = json.data
    history.push({ role: 'user', content: text })
    history.push({ role: 'assistant', content: JSON.stringify(data) })

    if (data.intent === 'ambiguous' && data.clarification_needed) {
      addMessage('assistant', data.clarification_needed)
      return
    }

    const wrapper = document.createElement('div')
    wrapper.className = 'scp-msg scp-msg--assistant'

    const bubble = document.createElement('div')
    bubble.className = 'scp-bubble'
    bubble.textContent = data.confirmation_message
    wrapper.appendChild(bubble)

    const card = buildPreviewCard(data)
    wrapper.appendChild(card)

    document.getElementById('scp-messages').appendChild(wrapper)
    document.getElementById('scp-messages').scrollTop = 99999

    if (data.complexity === 'simple') {
      setTimeout(() => execute(data, card), 600)
    }

  } catch (err) {
    removeTyping()
    addMessage('assistant', `Erro: ${err.message}`)
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

injectUI()
