import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

/**
 * Theme provider — light / dark / system.
 *
 * The app's design tokens already define a complete `.dark` palette in
 * styles.css; this provider is the missing activation mechanism. It only
 * ever toggles the `dark` class on <html> and persists the user's choice —
 * no business logic, no data, purely presentational.
 *
 * A blocking inline script in routes/__root.tsx applies the stored/system
 * preference before first paint so there's no light->dark flash on load;
 * this provider takes over from there for in-app toggling.
 */

export type ThemePreference = "light" | "dark" | "system";

interface ThemeContextType {
  /** The user's stored preference — may be "system" */
  preference: ThemePreference;
  /** The actually-applied theme, with "system" already resolved */
  resolvedTheme: "light" | "dark";
  setPreference: (pref: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = "dpdpa-theme";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    if (typeof window === "undefined") return "system";
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "light" || stored === "dark" || stored === "system") return stored;
    } catch {
      // localStorage unavailable (private browsing, etc.) — fall back to system
    }
    return "system";
  });

  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() =>
    preference === "system" ? getSystemTheme() : preference
  );

  const setPreference = useCallback((pref: ThemePreference) => {
    setPreferenceState(pref);
    try {
      window.localStorage.setItem(STORAGE_KEY, pref);
    } catch {
      // ignore — preference just won't persist across sessions
    }
  }, []);

  useEffect(() => {
    const resolved = preference === "system" ? getSystemTheme() : preference;
    setResolvedTheme(resolved);
    applyTheme(resolved);

    if (preference !== "system") return;

    // Track OS-level changes while "system" is selected
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const next = getSystemTheme();
      setResolvedTheme(next);
      applyTheme(next);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [preference]);

  return (
    <ThemeContext.Provider value={{ preference, resolvedTheme, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
