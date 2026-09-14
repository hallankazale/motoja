import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'dark' | 'light';
const storageKey = 'motoja-appearance';
const ThemeContext = createContext<{ theme: Theme; toggle: () => void } | null>(null);

function readTheme(): Theme {
  try { return localStorage.getItem(storageKey) === 'light' ? 'light' : 'dark'; }
  catch { return 'dark'; }
}

/** Apply before React paints; a blocked preference store must not prevent sign-in. */
export function initializeTheme() {
  document.documentElement.dataset.theme = readTheme();
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#040e20' : '#f2f6fc');
    try { localStorage.setItem(storageKey, theme); } catch { /* The current tab can still change appearance. */ }
  }, [theme]);
  return <ThemeContext.Provider value={{ theme, toggle: () => setTheme(current => current === 'dark' ? 'light' : 'dark') }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('ThemeProvider is required.');
  return context;
}
