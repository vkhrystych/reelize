import { useState } from "react";
import { devMode, getUser, signIn, signUp } from "../auth.js";

export default function Login({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fn = mode === "login" ? signIn : signUp;
    const { error } = await fn(email, password);
    setBusy(false);
    if (error) return setError(error);
    onAuth(await getUser());
  };

  return (
    <div className="center">
      <form className="card auth" onSubmit={submit}>
        <h1>🎬 Reelize</h1>
        <p className="muted">YouTube video in → pack of viral-ready clips out.</p>
        {devMode ? (
          <button className="primary" disabled={busy}>Continue (dev mode)</button>
        ) : (
          <>
            <input type="email" placeholder="email" value={email} required
                   onChange={(e) => setEmail(e.target.value)} />
            <input type="password" placeholder="password" value={password} required minLength={6}
                   onChange={(e) => setPassword(e.target.value)} />
            <button className="primary" disabled={busy}>
              {mode === "login" ? "Log in" : "Sign up"}
            </button>
            <p className="muted link" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
              {mode === "login" ? "No account? Sign up" : "Have an account? Log in"}
            </p>
          </>
        )}
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
}
