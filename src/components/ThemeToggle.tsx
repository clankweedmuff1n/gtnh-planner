"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const STORAGE_KEY = "gtnh-factory-flow.theme";

export function ThemeToggle() {
  // Initialize from the DOM so we match the no-FOUC script applied in the layout.
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Sync the button state with the class the no-FOUC layout script applied to <html>.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading external DOM state
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // Persisting is best effort; the toggle still works for this session.
    }
    setIsDark(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      aria-pressed={isDark}
      className="inline-flex h-9 w-9 items-center justify-center rounded border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
