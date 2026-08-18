import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { Clapperboard, LogOut } from "lucide-react";
import { devMode, getUser, signOut } from "./auth.js";
import { Button } from "./components/ui.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Job from "./pages/Job.jsx";

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = loading
  const navigate = useNavigate();

  useEffect(() => {
    getUser().then(setUser);
  }, []);

  if (user === undefined) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">loading…</div>;
  }

  const logout = async () => {
    await signOut();
    setUser(null);
    navigate("/login");
  };

  return (
    <>
      {user && (
        <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-6">
            <button
              className="flex items-center gap-2 font-semibold tracking-tight cursor-pointer"
              onClick={() => navigate("/")}
            >
              <Clapperboard className="h-5 w-5" /> Reelize
            </button>
            <div className="flex-1" />
            <span className="text-sm text-muted-foreground">
              {user.email}{devMode ? " · dev mode" : ""}
            </span>
            <Button variant="ghost" size="icon" onClick={logout} title="Log out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>
      )}
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" /> : <Login onAuth={setUser} />} />
        <Route path="/" element={user ? <Dashboard /> : <Navigate to="/login" />} />
        <Route path="/jobs/:id" element={user ? <Job /> : <Navigate to="/login" />} />
      </Routes>
    </>
  );
}
