import { interpretRequest } from '../services/llm.js'
import { validateLicense } from '../services/license.js'

export default async function chatRoute(app) {
  app.post('/chat', {
    schema: {
      body: {
        type: 'object',
        required: ['message'],
        properties: {
          message: { type: 'string', minLength: 1, maxLength: 2000 },
          history: { type: 'array', default: [] },
          site_id: { type: 'string' },
          sfcc_config: { type: 'object' },
          license_key: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const { message, history, site_id, sfcc_config, license_key } = req.body

    const { valid, reason } = await validateLicense(license_key)
    if (!valid) {
      return reply.status(401).send({ ok: false, error: `Unauthorized: ${reason}` })
    }

    try {
      const parsed = await interpretRequest(message, history)
      return reply.send({ ok: true, data: parsed })
    } catch (err) {
      req.log.error(err)
      return reply.status(500).send({ ok: false, error: err.message })
    }
  })
}