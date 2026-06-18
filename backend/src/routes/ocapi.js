import { executeOperation } from '../services/ocapi.js'

export default async function ocapiRoute(app) {
  app.post('/execute', {
    schema: {
      body: {
        type: 'object',
        required: ['operation'],
        properties: {
          operation: { type: 'object' },
        },
      },
    },
  }, async (req, reply) => {
    const { operation } = req.body

    if (operation.intent === 'ambiguous') {
      return reply.status(400).send({ ok: false, error: 'Cannot execute ambiguous operation' })
    }

    try {
      const results = await executeOperation(operation)
      return reply.send({ ok: true, results })
    } catch (err) {
      req.log.error(err)
      return reply.status(500).send({ ok: false, error: err.message })
    }
  })
}
