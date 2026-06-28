const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SECRET = process.env.SUPABASE_SECRET_KEY

export async function validateLicense(licenseKey) {
  if (!licenseKey) return { valid: false, reason: 'No license key provided' }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/licenses?license_key=eq.${licenseKey}&active=eq.true&select=id,email,plan,active`,
    {
      headers: {
        apikey: SUPABASE_SECRET,
        Authorization: `Bearer ${SUPABASE_SECRET}`,
        'Content-Type': 'application/json',
      },
    }
  )

  const data = await res.json()

  if (!data || data.length === 0) {
    return { valid: false, reason: 'Invalid or inactive license key' }
  }

  const license = data[0]

  // Update last_used_at
  fetch(`${SUPABASE_URL}/rest/v1/licenses?license_key=eq.${licenseKey}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_SECRET,
      Authorization: `Bearer ${SUPABASE_SECRET}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ last_used_at: new Date().toISOString() }),
  }).catch(() => {})

  return { valid: true, license }
}