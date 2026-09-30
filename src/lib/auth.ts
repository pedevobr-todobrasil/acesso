import { supabase } from './supabase'

export async function signIn(email: string, password: string) {
  if (!supabase) return { demo: true, error: null }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { demo: false, data, error }
}

export async function signUp(email: string, password: string, name: string) {
  if (!supabase) return { demo: true, error: null }
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  })
  return { demo: false, data, error }
}
