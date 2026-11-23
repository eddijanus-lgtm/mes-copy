import { createContext, useState, useEffect, useContext } from "react";

export const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("mes-theme");
    if (saved) return saved === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    localStorage.setItem("mes-theme", dark ? "dark" : "light");
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const toggleTheme = () => setDark(prev => !prev);

  return (
    <ThemeContext.Provider value={{ dark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
