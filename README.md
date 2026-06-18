# SFCC Copilot

AI assistant that lives inside Salesforce Commerce Cloud Business Manager.
Describe a promotion in plain language — it creates the campaign, promotion, and coupons via OCAPI.

## Stack

- **Extension**: Chrome Extension MV3 (content script injected into BM)
- **Backend**: Node.js + Fastify
- **AI**: Anthropic Claude Sonnet
- **Commerce**: SFCC OCAPI Data API v23.2

## Project structure

```
sfcc-copilot/
├── backend/
│   ├── src/
│   │   ├── index.js            # Fastify entry point
│   │   ├── routes/
│   │   │   ├── chat.js         # POST /api/chat — LLM interpretation
│   │   │   └── ocapi.js        # POST /api/execute — OCAPI execution
│   │   └── services/
│   │       ├── llm.js          # Anthropic client + system prompt
│   │       └── ocapi.js        # OCAPI client + orchestrator
│   ├── .env.example
│   └── package.json
└── extension/
    ├── manifest.json
    └── src/
        ├── content.js          # Chat UI injected into BM
        └── content.css
```

## Setup

### Backend

```bash
cd backend
cp .env.example .env
# Fill in your ANTHROPIC_API_KEY and SFCC credentials
npm install
npm run dev
```

### SFCC OCAPI permissions

In Business Manager → Administration → Site Development → Open Commerce API Settings, add:

```json
{
  "client_id": "your-client-id",
  "resources": [
    { "resource_id": "/campaigns/**", "methods": ["get","put","post","delete"], "read_attributes": "(**)", "write_attributes": "(**)" },
    { "resource_id": "/promotions/**", "methods": ["get","put","post","delete"], "read_attributes": "(**)", "write_attributes": "(**)" },
    { "resource_id": "/coupon-lists/**", "methods": ["get","put","post","delete"], "read_attributes": "(**)", "write_attributes": "(**)" }
  ]
}
```

### Chrome Extension

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `extension/` folder
4. Open any SFCC Business Manager URL
5. The **Copilot** button appears bottom-right

## Flow

```
User types in chat
  → POST /api/chat (LLM interprets, returns structured JSON)
  → If complex: show preview card → user confirms
  → If simple: auto-execute
  → POST /api/execute (OCAPI calls: campaign → promotion → coupon → links)
  → Success message
```

## Roadmap

- [ ] Multi-tenant config (credentials per SFCC instance)
- [ ] Audit log (who created what, when)
- [ ] Edit existing promotions
- [ ] Disable / clone promotions
- [ ] SFCC cartridge version (server-side, no extension needed)
