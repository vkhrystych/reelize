import { useState } from "react";
import { Clapperboard } from "lucide-react";
import { devMode, getUser, signIn, signUp } from "../auth.js";
import { Button, Card, Input, Spinner } from "../components/ui.jsx";

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
    const user = await getUser();
    if (!user && mode === "signup") {
      return setError("Almost there — confirm the link in your email, then log in.");
    }
    onAuth(user);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm p-8">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary">
            <Clapperboard className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Reelize</h1>
          <p className="text-sm text-muted-foreground">
            YouTube video in → pack of viral-ready clips out.
          </p>
        </div>
        <form className="flex flex-col gap-3" onSubmit={submit}>
          {devMode ? (
            <Button disabled={busy}>Continue (dev mode)</Button>
          ) : (
            <>
              <Input type="email" placeholder="you@example.com" value={email} required
                     onChange={(e) => setEmail(e.target.value)} />
              <Input type="password" placeholder="password" value={password} required minLength={6}
                     onChange={(e) => setPassword(e.target.value)} />
              <Button disabled={busy}>
                {busy && <Spinner />}
                {mode === "login" ? "Log in" : "Create account"}
              </Button>
              <button
                type="button"
                className="text-sm text-muted-foreground underline-offset-4 hover:underline cursor-pointer"
                onClick={() => setMode(mode === "login" ? "signup" : "login")}
              >
                {mode === "login" ? "No account? Sign up" : "Have an account? Log in"}
              </button>
            </>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
        </form>
      </Card>
    </div>
  );
}
