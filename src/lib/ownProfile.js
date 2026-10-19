import { supabase } from './supabase'

// Reads the signed-in user's role. If their profile row is missing it is recreated
// (as a parent) through ensure_own_profile, so a deleted profile never locks anyone out.
export async function fetchOwnRole(userId) {
  const { data, error } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
  if (error) return { role: null, error }
  if (data) return { role: data.role, error: null }

  const { data: created, error: createError } = await supabase.rpc('ensure_own_profile').single()
  if (createError) return { role: null, error: createError }
  return { role: created.account_role, error: null }
}
