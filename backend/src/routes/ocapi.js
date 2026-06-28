import { executeOperation, getPromotion, getCampaign, removeCampaignCustomerGroup } from '../services/ocapi.js'
import { validateLicense } from '../services/license.js'

function getSfccConfig(req) {
  const header = req.headers['x-sfcc-config']
  if (header) {
    try { return JSON.parse(header) } catch {}
  }
  return req.body?.sfcc_config || null
}

export default async function ocapiRoute(app) {

  app.get('/campaign/:id', async (req, reply) => {
    const { valid, reason } = await validateLicense(req.query.license_key)
    if (!valid) return reply.status(401).send({ ok: false, error: `Unauthorized: ${reason}` })

    const siteId = req.query.site_id || null
    const sfccConfig = getSfccConfig(req)
    try {
      const campaign = await getCampaign(req.params.id, siteId, sfccConfig)
      const customerGroups = campaign.customer_groups || []
      const hasEveryone = customerGroups.some(g => g.id === 'Everyone')
      return reply.send({
        ok: true,
        campaign,
        warning: hasEveryone
          ? `Campaign "${req.params.id}" is open to Everyone. Adding a coupon won't restrict access — all customers already get the discount. Do you want to remove the Everyone group and make the discount exclusive to coupon holders?`
          : null,
      })
    } catch (err) {
      return reply.status(404).send({ ok: false, error: err.message })
    }
  })

  app.get('/promotion/:id', async (req, reply) => {
    const { valid, reason } = await validateLicense(req.query.license_key)
    if (!valid) return reply.status(401).send({ ok: false, error: `Unauthorized: ${reason}` })

    const siteId = req.query.site_id || null
    const sfccConfig = getSfccConfig(req)
    try {
      const promotion = await getPromotion(req.params.id, siteId, sfccConfig)
      return reply.send({ ok: true, promotion })
    } catch (err) {
      return reply.status(404).send({ ok: false, error: err.message })
    }
  })

  app.post('/execute', {
    schema: {
      body: {
        type: 'object',
        required: ['operation'],
        properties: {
          operation: { type: 'object' },
          remove_everyone: { type: 'boolean', default: false },
          site_id: { type: 'string' },
          sfcc_config: { type: 'object' },
          license_key: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const { operation, remove_everyone, site_id, sfcc_config, license_key } = req.body

    const { valid, reason } = await validateLicense(license_key)
    if (!valid) return reply.status(401).send({ ok: false, error: `Unauthorized: ${reason}` })

    if (operation.intent === 'ambiguous') {
      return reply.status(400).send({ ok: false, error: 'Cannot execute ambiguous operation' })
    }

    try {
      if (remove_everyone && operation.existing_campaign_id) {
        await removeCampaignCustomerGroup(operation.existing_campaign_id, 'Everyone', site_id, sfcc_config)
      }
      const results = await executeOperation(operation, site_id, sfcc_config)
      return reply.send({ ok: true, results })
    } catch (err) {
      req.log.error(err)
      return reply.status(500).send({ ok: false, error: err.message })
    }
  })
}