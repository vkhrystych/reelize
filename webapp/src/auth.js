// Supabase auth when configured; transparent dev-mode bypass when not.
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && key ? createClient(url, key) : null;
export const devMode = !supabase;

export async function getUser() {
  if (devMode) {
    return localStorage.getItem("reelize-dev-user")
      ? { email: "dev@localhost", dev: true }
      : null;
  }
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function signIn(email, password) {
  if (devMode) {
    localStorage.setItem("reelize-dev-user", "1");
    return {};
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error?.message };
}

export async function signUp(email, password) {
  if (devMode) {
    localStorage.setItem("reelize-dev-user", "1");
    return {};
  }
  const { error } = await supabase.auth.signUp({ email, password });
  return { error: error?.message };
}

export async function signOut() {
  if (devMode) localStorage.removeItem("reelize-dev-user");
  else await supabase.auth.signOut();
}
