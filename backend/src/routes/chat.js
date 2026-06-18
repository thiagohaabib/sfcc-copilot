import { interpretRequest } from '../services/llm.js'

export default async function chatRoute(app) {
  app.post('/chat', {
    schema: {
      body: {
        type: 'object',
        required: ['message'],
        properties: {
          message: { type: 'string', minLength: 1, maxLength: 2000 },
          history: { type: 'array', default: [] },
        },
      },
    },
  }, async (req, reply) => {
    const { message, history } = req.body

    try {
      const parsed = await interpretRequest(message, history)
      return reply.send({ ok: true, data: parsed })
    } catch (err) {
      req.log.error(err)
      return reply.status(500).send({ ok: false, error: err.message })
    }
  })
}
