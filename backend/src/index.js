import Fastify from 'fastify'
import cors from '@fastify/cors'
import 'dotenv/config'

import chatRoute from './routes/chat.js'
import ocapiRoute from './routes/ocapi.js'

const app = Fastify({ logger: true })

await app.register(cors, {
  origin: ['chrome-extension://*', 'http://localhost:*'],
})

await app.register(chatRoute, { prefix: '/api' })
await app.register(ocapiRoute, { prefix: '/api' })

app.get('/health', async () => ({ status: 'ok' }))

try {
  await app.listen({ port: Number(process.env.PORT) || 3001, host: '0.0.0.0' })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
