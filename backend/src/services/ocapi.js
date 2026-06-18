/**
 * SFCC OCAPI client
 * Handles OAuth2 (client_credentials) and all Data API calls
 */

let tokenCache = { token: null, expiresAt: 0 }

async function getAccessToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token
  }

  const { SFCC_BASE_URL, SFCC_CLIENT_ID, SFCC_CLIENT_SECRET } = process.env
  const credentials = Buffer.from(`${SFCC_CLIENT_ID}:${SFCC_CLIENT_SECRET}`).toString('base64')

  const res = await fetch(`${SFCC_BASE_URL}/dw/oauth2/access_token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OCAPI auth failed: ${err}`)
  }

  const data = await res.json()
  tokenCache.token = data.access_token
  tokenCache.expiresAt = Date.now() + (data.expires_in - 60) * 1000

  return tokenCache.token
}

async function ocapiRequest(method, path, body = null) {
  const { SFCC_BASE_URL, SFCC_SITE_ID } = process.env
  const token = await getAccessToken()

  const url = `${SFCC_BASE_URL}/dw/data/v23_2/sites/${SFCC_SITE_ID}${path}`

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(`OCAPI error ${res.status}: ${JSON.stringify(data)}`)
  }

  return data
}

// ─── Campaign ─────────────────────────────────────────────────────────────────

export async function createCampaign(campaign) {
  return ocapiRequest('PUT', `/campaigns/${campaign.id}`, {
    id: campaign.id,
    name: campaign.name,
    description: campaign.description,
    start_date: campaign.start_date,
    end_date: campaign.end_date,
    enabled: campaign.enabled ?? true,
  })
}

// ─── Promotion ────────────────────────────────────────────────────────────────

export async function createPromotion(promotion) {
  const payload = {
    id: promotion.id,
    name: promotion.name,
    enabled: promotion.enabled ?? true,
    exclusive: promotion.exclusive ?? false,
    start_date: promotion.start_date,
    end_date: promotion.end_date,
  }

  if (promotion.type === 'percentage') {
    payload.discount = {
      type: 'percentage',
      percentage: promotion.discount_value,
    }
  } else if (promotion.type === 'fixed_amount') {
    payload.discount = {
      type: 'fixed_price',
      amount: promotion.discount_value,
      currency: promotion.currency || 'BRL',
    }
  } else if (promotion.type === 'free_shipping') {
    payload.discount = { type: 'free_shipping' }
  }

  if (promotion.condition_min_order) {
    payload.qualifying_products_operator = 'any'
    payload.basket_conditions = {
      threshold_type: 'amount',
      threshold_amount: promotion.condition_min_order,
    }
  }

  if (promotion.condition_customer_group) {
    payload.customer_groups = [{ id: promotion.condition_customer_group }]
  }

  return ocapiRequest('PUT', `/promotions/${promotion.id}`, payload)
}

// ─── Link promotion to campaign ───────────────────────────────────────────────

export async function linkPromotionToCampaign(campaignId, promotionId) {
  return ocapiRequest(
    'PUT',
    `/campaigns/${campaignId}/promotion-campaign-assignments/${promotionId}`,
    { campaign_id: campaignId, promotion_id: promotionId, enabled: true }
  )
}

// ─── Coupon ───────────────────────────────────────────────────────────────────

export async function createCouponList(coupon) {
  return ocapiRequest('PUT', `/coupon-lists/${coupon.id}`, {
    id: coupon.id,
    coupon_count: coupon.usage_limit ?? 9999,
    coupon_type: coupon.single_use ? 'single_use' : 'reusable',
    case_insensitive: coupon.case_insensitive ?? true,
  })
}

export async function createCouponCode(couponListId, code) {
  return ocapiRequest('POST', `/coupon-lists/${couponListId}/coupons`, {
    code,
  })
}

export async function linkCouponToPromotion(promotionId, couponListId) {
  return ocapiRequest('PUT', `/promotions/${promotionId}`, {
    coupons: [{ coupon_list_id: couponListId, enabled: true }],
  })
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export async function executeOperation(parsed) {
  const results = []

  if (parsed.campaign) {
    const r = await createCampaign(parsed.campaign)
    results.push({ step: 'campaign', id: r.id, status: 'created' })
  }

  if (parsed.promotion) {
    const r = await createPromotion(parsed.promotion)
    results.push({ step: 'promotion', id: r.id, status: 'created' })

    if (parsed.campaign) {
      await linkPromotionToCampaign(parsed.campaign.id, parsed.promotion.id)
      results.push({ step: 'link', status: 'linked' })
    }
  }

  if (parsed.coupon) {
    await createCouponList(parsed.coupon)
    await createCouponCode(parsed.coupon.id, parsed.coupon.code)
    results.push({ step: 'coupon', code: parsed.coupon.code, status: 'created' })

    if (parsed.promotion) {
      await linkCouponToPromotion(parsed.promotion.id, parsed.coupon.id)
      results.push({ step: 'coupon_link', status: 'linked' })
    }
  }

  return results
}
