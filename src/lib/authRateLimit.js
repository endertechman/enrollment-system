const limits = {
  login: { maximum: 5, windowMs: 60000 },
  signup: { maximum: 3, windowMs: 60000 },
  recovery: { maximum: 1, windowMs: 60000 },
  confirmationRetry: { maximum: 1, windowMs: 60000 },
  passwordUpdate: { maximum: 3, windowMs: 300000 },
}

function takeAuthAttempt(action) {
  const limit = limits[action]
  if (!limit) return { allowed: true, retryAfter: 0 }

  const key = `bcdc-auth-attempts:${action}`
  const now = Date.now()
  let attempts

  try {
    attempts = JSON.parse(window.localStorage.getItem(key) || '[]')
      .filter((timestamp) => Number.isFinite(timestamp) && now - timestamp < limit.windowMs)
  } catch {
    attempts = []
  }

  if (attempts.length >= limit.maximum) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((limit.windowMs - (now - attempts[0])) / 1000)) }
  }

  attempts.push(now)
  try {
    window.localStorage.setItem(key, JSON.stringify(attempts))
  } catch {
    // Supabase still enforces the authoritative server-side rate limits.
  }
  return { allowed: true, retryAfter: 0 }
}

export default takeAuthAttempt
