/**
 * SFCC OCAPI client — supports per-request credentials (multi-tenant)
 */

const tokenCache = new Map() // key: client_id → { token, expiresAt }

async function getAccessToken(config) {
  const { client_id, client_secret } = config
  const cached = tokenCache.get(client_id)
  if (cached && Date.now() < cached.expiresAt) return cached.token

  const credentials = Buffer.from(`${client_id}:${client_secret}`).toString('base64')

  const res = await fetch(
    `https://account.demandware.com/dw/oauth2/access_token?client_id=${client_id}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OCAPI auth failed: ${err}`)
  }

  const data = await res.json()
  tokenCache.set(client_id, {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  })

  return data.access_token
}

function getConfig(sfccConfig = null) {
  return sfccConfig || {
    base_url: process.env.SFCC_BASE_URL,
    client_id: process.env.SFCC_CLIENT_ID,
    client_secret: process.env.SFCC_CLIENT_SECRET,
    api_version: process.env.SFCC_API_VERSION || 'v24_1',
  }
}

export async function ocapiRequest(method, path, body = null, siteId = null, sfccConfig = null) {
  const config = getConfig(sfccConfig)
  const token = await getAccessToken(config)
  const site = siteId || process.env.SFCC_SITE_ID
  const version = config.api_version || 'v24_1'
  const url = `${config.base_url}/s/-/dw/data/${version}/sites/${site}${path}`

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await res.text()
  const data = text ? JSON.parse(text) : {}

  if (!res.ok) {
    throw new Error(`OCAPI error ${res.status}: ${JSON.stringify(data)}`)
  }

  return data
}

export async function getPromotion(id, siteId, sfccConfig) {
  return ocapiRequest('GET', `/promotions/${id}`, null, siteId, sfccConfig)
}

export async function getCampaign(id, siteId, sfccConfig) {
  return ocapiRequest('GET', `/campaigns/${id}`, null, siteId, sfccConfig)
}

export async function createCampaign(campaign, hasCoupon = false, siteId = null, sfccConfig = null) {
  const campaignId = campaign.id
  await ocapiRequest('PUT', `/campaigns/${campaignId}`, {
    start_date: campaign.start_date,
    end_date: campaign.end_date || undefined,
    enabled: campaign.enabled ?? true,
  }, siteId, sfccConfig)

  if (!hasCoupon && campaign.customer_group) {
    await ocapiRequest('PUT', `/campaigns/${campaignId}/customer_groups/${campaign.customer_group}`, {}, siteId, sfccConfig)
  }

  return { campaign_id: campaignId }
}

export async function createPromotion(promotion, siteId = null, sfccConfig = null) {
  return ocapiRequest('PUT', `/promotions/${promotion.id}`, {
    enabled: promotion.enabled ?? true,
    promotion_class: 'product',
  }, siteId, sfccConfig)
}

export async function linkPromotionToCampaign(campaignId, promotionId, siteId = null, sfccConfig = null) {
  return ocapiRequest('PUT', `/campaigns/${campaignId}/promotions/${promotionId}`,
    { campaign_id: campaignId, promotion_id: promotionId, enabled: true }, siteId, sfccConfig)
}

export async function createCoupon(coupon, siteId = null, sfccConfig = null) {
  return ocapiRequest('PUT', `/coupons/${coupon.id}`, {
    type: 'single_code',
    single_code: coupon.code,
    case_insensitive: coupon.case_insensitive ?? true,
    enabled: true,
  }, siteId, sfccConfig)
}

export async function linkCouponToCampaign(campaignId, couponId, siteId = null, sfccConfig = null) {
  return ocapiRequest('PUT', `/campaigns/${campaignId}/coupons/${couponId}`,
    { campaign_id: campaignId, coupon_id: couponId, enabled: true }, siteId, sfccConfig)
}

export async function removeCampaignCustomerGroup(campaignId, customerGroupId, siteId = null, sfccConfig = null) {
  return ocapiRequest('DELETE', `/campaigns/${campaignId}/customer_groups/${customerGroupId}`, null, siteId, sfccConfig)
}

export async function executeOperation(parsed, siteId = null, sfccConfig = null) {
  const results = []
  const hasCoupon = !!parsed.coupon

  if (parsed.intent === 'add_coupon_to_existing' && parsed.existing_campaign_id) {
    if (parsed.coupon) {
      await createCoupon(parsed.coupon, siteId, sfccConfig)
      results.push({ step: 'coupon', id: parsed.coupon.id, status: 'created' })
      await linkCouponToCampaign(parsed.existing_campaign_id, parsed.coupon.id, siteId, sfccConfig)
      results.push({ step: 'coupon_link', status: 'linked' })
    }
    return results
  }

  if (parsed.campaign) {
    const r = await createCampaign(parsed.campaign, hasCoupon, siteId, sfccConfig)
    results.push({ step: 'campaign', id: r.campaign_id, status: 'created' })
  }

  if (parsed.promotion) {
    await createPromotion(parsed.promotion, siteId, sfccConfig)
    results.push({ step: 'promotion', id: parsed.promotion.id, status: 'created' })
    if (parsed.campaign) {
      await linkPromotionToCampaign(parsed.campaign.id, parsed.promotion.id, siteId, sfccConfig)
      results.push({ step: 'promotion_link', status: 'linked' })
    }
  }

  if (parsed.coupon) {
    await createCoupon(parsed.coupon, siteId, sfccConfig)
    results.push({ step: 'coupon', id: parsed.coupon.id, status: 'created' })
    if (parsed.campaign) {
      await linkCouponToCampaign(parsed.campaign.id, parsed.coupon.id, siteId, sfccConfig)
      results.push({ step: 'coupon_link', status: 'linked' })
    }
  }

  return results
}