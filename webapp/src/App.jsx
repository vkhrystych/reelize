import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { devMode, getUser, signOut } from "./auth.js";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Job from "./pages/Job.jsx";

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = loading
  const navigate = useNavigate();

  useEffect(() => {
    getUser().then(setUser);
  }, []);

  if (user === undefined) return <div className="center muted">loading…</div>;

  const logout = async () => {
    await signOut();
    setUser(null);
    navigate("/login");
  };

  return (
    <>
      {user && (
        <header className="topbar">
          <span className="brand" onClick={() => navigate("/")}>🎬 Reelize</span>
          <span className="spacer" />
          <span className="muted">{user.email}{devMode ? " (dev mode)" : ""}</span>
          <button className="ghost" onClick={logout}>log out</button>
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
