const limits = {
  login: { maximum: 5, windowMs: 60000 },
  signup: { maximum: 3, windowMs: 60000 },
  recovery: {
    maximum: 3,
    windowMs: 60 * 60 * 1000,
    minimumIntervalMs: 60 * 1000,
  },
  confirmationRetry: {
    maximum: 3,
    windowMs: 60 * 60 * 1000,
    minimumIntervalMs: 60 * 1000,
  },
  passwordUpdate: { maximum: 3, windowMs: 300000 },
}

function takeAuthAttempt(action) {
  const limit = limits[action]
  if (!limit) return { allowed: true, retryAfter: 0 }

  const key = `bcdc-auth-attempts:${action}`
  const cooldownKey = `bcdc-auth-cooldown:${action}`
  const now = Date.now()
  let attempts
  let lastActivity = 0

  try {
    attempts = JSON.parse(window.localStorage.getItem(key) || '[]')
      .filter((timestamp) => Number.isFinite(timestamp) && now - timestamp < limit.windowMs)
    const storedCooldown = Number(window.localStorage.getItem(cooldownKey))
    lastActivity = Math.max(
      attempts[attempts.length - 1] || 0,
      Number.isFinite(storedCooldown) ? storedCooldown : 0,
    )
  } catch {
    attempts = []
  }

  let retryAfterMs = 0

  if (attempts.length >= limit.maximum) {
    retryAfterMs = Math.max(retryAfterMs, limit.windowMs - (now - attempts[0]))
  }

  if (limit.minimumIntervalMs && lastActivity > 0) {
    retryAfterMs = Math.max(
      retryAfterMs,
      limit.minimumIntervalMs - (now - lastActivity),
    )
  }

  if (retryAfterMs > 0) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil(retryAfterMs / 1000)) }
  }

  attempts.push(now)
  try {
    window.localStorage.setItem(key, JSON.stringify(attempts))
    window.localStorage.setItem(cooldownKey, String(now))
  } catch {
    // Supabase still enforces the authoritative server-side rate limits.
  }
  return { allowed: true, retryAfter: 0 }
}

export function startAuthCooldown(action) {
  const limit = limits[action]
  if (!limit?.minimumIntervalMs) return

  try {
    window.localStorage.setItem(`bcdc-auth-cooldown:${action}`, String(Date.now()))
  } catch {
    // Supabase still enforces the authoritative server-side rate limits.
  }
}

export function getAuthCooldownRemaining(action) {
  const limit = limits[action]
  if (!limit?.minimumIntervalMs) return 0

  try {
    const startedAt = Number(window.localStorage.getItem(`bcdc-auth-cooldown:${action}`))
    if (!Number.isFinite(startedAt)) return 0

    return Math.max(0, Math.ceil((limit.minimumIntervalMs - (Date.now() - startedAt)) / 1000))
  } catch {
    return 0
  }
}

export default takeAuthAttempt
