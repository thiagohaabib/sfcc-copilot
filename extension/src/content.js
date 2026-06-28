const BACKEND_URL = 'https://sfcc-copilot-production.up.railway.app/api'

let isOpen = false
let history = []
let sfccConfig = null

// ─── Config ───────────────────────────────────────────────────────────────────

async function loadConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['sfcc_base_url', 'sfcc_client_id', 'sfcc_client_secret', 'sfcc_api_version', 'sfcc_license_key'], (result) => {
      if (result.sfcc_client_id && result.sfcc_client_secret) {
        sfccConfig = {
          base_url: result.sfcc_base_url || location.origin,
          client_id: result.sfcc_client_id,
          client_secret: result.sfcc_client_secret,
          api_version: result.sfcc_api_version || 'v24_1',
          license_key: result.sfcc_license_key || null,
        }
      }
      resolve(sfccConfig)
    })
  })
}

async function saveConfig(config) {
  return new Promise((resolve) => {
    chrome.storage.local.set({
      sfcc_base_url: config.base_url,
      sfcc_client_id: config.client_id,
      sfcc_client_secret: config.client_secret,
      sfcc_api_version: config.api_version,
      sfcc_license_key: config.license_key,
    }, resolve)
  })
}

// ─── Extract site ID from BM URL ──────────────────────────────────────────────

function getSiteId() {
  const decoded = decodeURIComponent(location.href)
  const match = decoded.match(/site[=:]([A-Za-z0-9_-]+)/)
  return match ? match[1] : null
}

function getSiteLabel() {
  const siteId = getSiteId()
  return siteId || location.hostname.match(/^([^.]+)/)?.[1]?.toUpperCase() || 'BM'
}

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
            <div class="scp-site" id="scp-site-label">${getSiteLabel()}</div>
          </div>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <button id="scp-settings-btn" title="Settings" style="background:none;border:none;cursor:pointer;color:#706e6b;font-size:14px;padding:2px 4px;">⚙</button>
          <button id="scp-close">✕</button>
        </div>
      </div>

      <!-- Settings panel -->
      <div id="scp-settings" style="display:none;flex-direction:column;gap:10px;padding:14px;flex:1;overflow-y:auto;">
        <div style="font-size:13px;font-weight:600;color:#16325c;">SFCC Credentials</div>
        <div style="font-size:11px;color:#706e6b;">These are stored locally in your browser.</div>
        <div class="scp-field-group">
          <label class="scp-label">Base URL</label>
          <input id="cfg-base-url" class="scp-input" placeholder="https://xxxx-001.dx.commercecloud.salesforce.com" />
        </div>
        <div class="scp-field-group">
          <label class="scp-label">Client ID</label>
          <input id="cfg-client-id" class="scp-input" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
        </div>
        <div class="scp-field-group">
          <label class="scp-label">Client Secret</label>
          <input id="cfg-client-secret" class="scp-input" type="password" placeholder="••••••••" />
        </div>
        <div class="scp-field-group">
          <label class="scp-label">API Version</label>
          <input id="cfg-api-version" class="scp-input" placeholder="v24_1" value="v24_1" />
        </div>
        <div class="scp-field-group">
          <label class="scp-label">License Key</label>
          <input id="cfg-license-key" class="scp-input" placeholder="SFCC-XXXX-XXXX-XXXX" />
        </div>
        <button id="cfg-save" class="scp-btn scp-btn--primary" style="margin-top:4px;">Save & Connect</button>
        <div id="cfg-status" style="font-size:12px;color:#2e844a;display:none;">✓ Saved successfully</div>
      </div>

      <!-- Chat panel -->
      <div id="scp-chat" style="display:flex;flex-direction:column;flex:1;overflow:hidden;">
        <div id="scp-messages">
          <div class="scp-msg scp-msg--assistant">
            <div class="scp-bubble">Hi! Describe the promotion, campaign, or coupon you want to create. I can also look up details of an existing one.</div>
          </div>
        </div>
        <div id="scp-suggestions">
          <button class="scp-pill" data-text="50% off for all customers this week">50% off this week</button>
          <button class="scp-pill" data-text="Free shipping for VIP customers until Sunday">Free shipping VIP</button>
          <button class="scp-pill" data-text="Coupon FLASH20 with 200 uses until Friday">Coupon FLASH20</button>
        </div>
        <div id="scp-input-row">
          <textarea id="scp-input" placeholder="Describe a promotion or ask for details..." rows="1"></textarea>
          <button id="scp-send">↑</button>
        </div>
      </div>
    </div>
  `
  document.body.appendChild(root)
  bindEvents()
}

function bindEvents() {
  document.getElementById('scp-toggle').onclick = togglePanel
  document.getElementById('scp-close').onclick = togglePanel
  document.getElementById('scp-send').onclick = sendMessage
  document.getElementById('scp-settings-btn').onclick = toggleSettings
  document.getElementById('cfg-save').onclick = saveSettings
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
  if (isOpen && !sfccConfig) toggleSettings(true)
}

function toggleSettings(forceOpen = false) {
  const settings = document.getElementById('scp-settings')
  const chat = document.getElementById('scp-chat')
  const isSettingsOpen = settings.style.display !== 'none'

  if (forceOpen === true || !isSettingsOpen) {
    settings.style.display = 'flex'
    chat.style.display = 'none'
    // pre-fill if config exists
    if (sfccConfig) {
      document.getElementById('cfg-base-url').value = sfccConfig.base_url || ''
      document.getElementById('cfg-client-id').value = sfccConfig.client_id || ''
      document.getElementById('cfg-api-version').value = sfccConfig.api_version || 'v24_1'
      document.getElementById('cfg-license-key').value = sfccConfig.license_key || ''
    } else {
      document.getElementById('cfg-base-url').value = location.origin
    }
  } else {
    settings.style.display = 'none'
    chat.style.display = 'flex'
  }
}

async function saveSettings() {
  const config = {
    base_url: document.getElementById('cfg-base-url').value.trim(),
    client_id: document.getElementById('cfg-client-id').value.trim(),
    client_secret: document.getElementById('cfg-client-secret').value.trim(),
    api_version: document.getElementById('cfg-api-version').value.trim() || 'v24_1',
    license_key: document.getElementById('cfg-license-key').value.trim(),
  }

  if (!config.client_id || !config.client_secret || !config.license_key) {
    alert('Client ID, Client Secret and License Key are required.')
    return
  }

  await saveConfig(config)
  sfccConfig = config

  const status = document.getElementById('cfg-status')
  status.style.display = 'block'
  setTimeout(() => {
    status.style.display = 'none'
    toggleSettings()
  }, 1200)
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

// ─── Details card ─────────────────────────────────────────────────────────────

function buildDetailsCard(type, data) {
  const card = document.createElement('div')
  card.className = 'scp-card'
  const header = document.createElement('div')
  header.className = 'scp-card__header'
  header.innerHTML = `<span class="scp-tag">${type === 'promotion' ? 'Promotion' : 'Campaign'}</span><span>${data.id || data.campaign_id || ''}</span>`
  card.appendChild(header)
  const body = document.createElement('div')
  body.className = 'scp-card__body'
  const fields = []
  if (type === 'promotion') {
    fields.push(['ID', data.id])
    fields.push(['Status', data.enabled ? 'Active' : 'Inactive'])
    fields.push(['Class', data.promotion_class || '—'])
    fields.push(['Exclusivity', data.exclusivity || '—'])
    if (data.assignment_information) fields.push(['Active now', data.assignment_information.active ? 'Yes' : 'No'])
  } else {
    fields.push(['ID', data.campaign_id || data.id])
    fields.push(['Status', data.enabled ? 'Active' : 'Inactive'])
    if (data.start_date) fields.push(['Start', data.start_date.split('T')[0]])
    fields.push(['End', data.end_date ? data.end_date.split('T')[0] : 'No end date'])
    const groups = data.customer_groups?.map(g => g.id).join(', ') || '—'
    fields.push(['Customer Groups', groups])
  }
  fields.forEach(([label, value]) => {
    const row = document.createElement('div')
    row.className = 'scp-field'
    row.innerHTML = `<span class="scp-field__label">${label}</span><span class="scp-field__value">${value}</span>`
    body.appendChild(row)
  })
  card.appendChild(body)
  return card
}

// ─── Preview card ─────────────────────────────────────────────────────────────

function buildPreviewCard(data, warning = null) {
  const card = document.createElement('div')
  card.className = 'scp-card'
  const header = document.createElement('div')
  header.className = 'scp-card__header'
  header.innerHTML = `<span class="scp-tag">Preview</span><span>${data.campaign?.id || data.existing_campaign_id || ''}</span>`
  card.appendChild(header)
  const body = document.createElement('div')
  body.className = 'scp-card__body'
  const fields = []
  if (data.campaign) {
    if (data.campaign.start_date) fields.push(['Start', data.campaign.start_date.split('T')[0]])
    fields.push(['End', data.campaign.end_date ? data.campaign.end_date.split('T')[0] : 'No end date'])
    if (!data.coupon) fields.push(['Audience', data.campaign.customer_group || 'Everyone'])
    else fields.push(['Audience', 'Controlled by coupon'])
  }
  if (data.existing_campaign_id) fields.push(['Existing Campaign', data.existing_campaign_id])
  if (data.promotion) {
    fields.push(['Promotion', data.promotion.id])
    fields.push(['Discount', 'Set manually in BM'])
  }
  if (data.coupon) {
    fields.push(['Coupon', data.coupon.code])
    fields.push(['Limit', data.coupon.usage_limit ? `${data.coupon.usage_limit} uses` : 'Unlimited'])
  }
  fields.forEach(([label, value]) => {
    const row = document.createElement('div')
    row.className = 'scp-field'
    row.innerHTML = `<span class="scp-field__label">${label}</span><span class="scp-field__value">${value}</span>`
    body.appendChild(row)
  })
  if (warning) {
    const warningEl = document.createElement('div')
    warningEl.className = 'scp-warning'
    warningEl.textContent = warning
    body.appendChild(warningEl)
  }
  card.appendChild(body)
  const actions = document.createElement('div')
  actions.className = 'scp-card__actions'
  if (warning) {
    const btnRemove = document.createElement('button')
    btnRemove.className = 'scp-btn scp-btn--primary'
    btnRemove.textContent = 'Yes, remove Everyone'
    btnRemove.onclick = () => execute(data, card, true)
    const btnKeep = document.createElement('button')
    btnKeep.className = 'scp-btn scp-btn--secondary'
    btnKeep.textContent = 'No, keep Everyone'
    btnKeep.onclick = () => execute(data, card, false)
    actions.appendChild(btnRemove)
    actions.appendChild(btnKeep)
  } else {
    const confirmBtn = document.createElement('button')
    confirmBtn.className = 'scp-btn scp-btn--primary'
    confirmBtn.textContent = 'Confirm & Create'
    confirmBtn.onclick = () => execute(data, card, false)
    const cancelBtn = document.createElement('button')
    cancelBtn.className = 'scp-btn scp-btn--secondary'
    cancelBtn.textContent = 'Cancel'
    cancelBtn.onclick = () => {
      card.closest('.scp-msg').remove()
      addMessage('assistant', 'Cancelled. How else can I help?')
    }
    actions.appendChild(confirmBtn)
    actions.appendChild(cancelBtn)
  }
  card.appendChild(actions)
  return card
}

// ─── Execute ──────────────────────────────────────────────────────────────────

async function execute(data, cardEl, removeEveryone = false) {
  cardEl?.closest('.scp-msg')?.remove()
  showTyping()
  try {
    const res = await fetch(`${BACKEND_URL}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: data,
        remove_everyone: removeEveryone,
        site_id: getSiteId(),
        sfcc_config: sfccConfig,
      }),
    })
    const json = await res.json()
    removeTyping()
    if (!json.ok) throw new Error(json.error)
    const promoId = data.promotion?.id
    addMessage('assistant', promoId
      ? `✓ Done! Go to Online Marketing → Promotions → ${promoId} and set:\n• Discount value\n• Discounted Products`
      : `✓ Coupon created and linked successfully!`)
    history = []
  } catch (err) {
    removeTyping()
    addMessage('assistant', `Error: ${err.message}`)
  }
}

// ─── Send message ─────────────────────────────────────────────────────────────

async function sendMessage() {
  if (!sfccConfig) {
    toggleSettings(true)
    addMessage('assistant', 'Please configure your SFCC credentials first.')
    return
  }

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
      body: JSON.stringify({ message: text, history, site_id: getSiteId(), sfcc_config: sfccConfig, license_key: sfccConfig?.license_key }),
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

    if (data.intent === 'get_details' && data.lookup_id) {
      showTyping()
      try {
        const endpoint = `${BACKEND_URL}/${data.lookup_type}/${data.lookup_id}?site_id=${getSiteId()}&license_key=${sfccConfig?.license_key}`
        const detailRes = await fetch(endpoint, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', 'x-sfcc-config': JSON.stringify(sfccConfig) },
        })
        const detailJson = await detailRes.json()
        removeTyping()
        if (!detailJson.ok) {
          addMessage('assistant', `No ${data.lookup_type} found with ID "${data.lookup_id}".`)
          return
        }
        const wrapper = document.createElement('div')
        wrapper.className = 'scp-msg scp-msg--assistant'
        const bubble = document.createElement('div')
        bubble.className = 'scp-bubble'
        bubble.textContent = `Here are the details for ${data.lookup_type} "${data.lookup_id}":`
        wrapper.appendChild(bubble)
        wrapper.appendChild(buildDetailsCard(data.lookup_type, detailJson.promotion || detailJson.campaign))
        document.getElementById('scp-messages').appendChild(wrapper)
        document.getElementById('scp-messages').scrollTop = 99999
      } catch {
        removeTyping()
        addMessage('assistant', 'Error fetching details. Please check the ID and try again.')
      }
      return
    }

    if (data.intent === 'add_coupon_to_existing' && data.existing_campaign_id) {
      showTyping()
      try {
        const campRes = await fetch(`${BACKEND_URL}/campaign/${data.existing_campaign_id}?site_id=${getSiteId()}&license_key=${sfccConfig?.license_key}`, {
          headers: { 'x-sfcc-config': JSON.stringify(sfccConfig) },
        })
        const campJson = await campRes.json()
        removeTyping()
        showPreview(data, campJson.ok ? campJson.warning : null)
      } catch {
        removeTyping()
        showPreview(data, null)
      }
      return
    }

    showPreview(data, null)
  } catch (err) {
    removeTyping()
    addMessage('assistant', `Error: ${err.message}`)
  }
}

function showPreview(data, warning) {
  const wrapper = document.createElement('div')
  wrapper.className = 'scp-msg scp-msg--assistant'
  const bubble = document.createElement('div')
  bubble.className = 'scp-bubble'
  bubble.textContent = data.confirmation_message
  wrapper.appendChild(bubble)
  wrapper.appendChild(buildPreviewCard(data, warning))
  document.getElementById('scp-messages').appendChild(wrapper)
  document.getElementById('scp-messages').scrollTop = 99999
}

// ─── Init ─────────────────────────────────────────────────────────────────────

loadConfig().then(() => injectUI())