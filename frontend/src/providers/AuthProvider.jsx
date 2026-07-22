import { createContext, useContext, useEffect, useState } from "react";

const TOKEN_KEY = "jwt_token";
const AuthContext = createContext(null);

function parseToken(token) {
  try {
    const encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const user = JSON.parse(atob(payload));
    const validRole = ["admin", "operator", "viewer"].includes(user.role);
    return user.sub && user.username && validRole && user.exp * 1000 > Date.now() ? user : null;
  } catch {
    return null;
  }
}

function readSession() {
  const token = localStorage.getItem(TOKEN_KEY);
  const user = token ? parseToken(token) : null;

  if (!user) localStorage.removeItem(TOKEN_KEY);
  return { token: user ? token : null, user };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(readSession);

  useEffect(() => {
    const clearExpiredSession = () => setSession({ token: null, user: null });
    const syncSession = (event) => {
      if (event.key === TOKEN_KEY) setSession(readSession());
    };
    window.addEventListener("auth:unauthorized", clearExpiredSession);
    window.addEventListener("storage", syncSession);
    return () => {
      window.removeEventListener("auth:unauthorized", clearExpiredSession);
      window.removeEventListener("storage", syncSession);
    };
  }, []);

  useEffect(() => {
    if (!session.user?.exp) return;
    const timeout = setTimeout(logout, Math.max(0, session.user.exp * 1000 - Date.now()));
    return () => clearTimeout(timeout);
  }, [session.user?.exp]);

  async function login(username, password) {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      throw new Error(response.status === 401 ? "Benutzername oder Passwort ist falsch." : "Anmeldung fehlgeschlagen.");
    }

    const { access_token: token } = await response.json();
    const user = parseToken(token);
    if (!user) throw new Error("Das Backend hat keinen gültigen Token geliefert.");

    localStorage.setItem(TOKEN_KEY, token);
    setSession({ token, user });
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setSession({ token: null, user: null });
  }

  return (
    <AuthContext.Provider value={{ ...session, isAuthenticated: Boolean(session.token), login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
