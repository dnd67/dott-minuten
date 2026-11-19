"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

export type ThemeChoice = "system" | "light" | "dark";

const THEME_KEY = "minutenclub-theme";
const listeners = new Set<() => void>();

function readStoredTheme(): ThemeChoice {
  if (typeof window === "undefined") return "system";
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* Ohne Storage gilt die Systemeinstellung. */
  }
  return "system";
}

export function applyThemeToDom(choice: ThemeChoice) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (choice === "light" || choice === "dark") {
    root.dataset.theme = choice;
  } else {
    delete root.dataset.theme;
  }
  const prefersLight =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: light)").matches;
  const resolved =
    choice === "system" ? (prefersLight ? "light" : "dark") : choice;
  const color = resolved === "light" ? "#f4f4f7" : "#111113";
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  metas.forEach((meta) => {
    if (!meta.getAttribute("media")) meta.setAttribute("content", color);
  });
}

export function setThemeChoice(next: ThemeChoice) {
  try {
    if (next === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, next);
  } catch {
    /* Ohne Storage nur für diese Sitzung anwenden. */
  }
  applyThemeToDom(next);
  listeners.forEach((fn) => fn());
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_KEY) callback();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

export function useThemeChoice(): [ThemeChoice, (next: ThemeChoice) => void] {
  const choice = useSyncExternalStore(
    subscribe,
    readStoredTheme,
    () => "system" as ThemeChoice,
  );
  useEffect(() => {
    applyThemeToDom(choice);
  }, [choice]);
  return [choice, setThemeChoice];
}

const ORDER: ThemeChoice[] = ["system", "light", "dark"];
const LABELS: Record<ThemeChoice, string> = {
  system: "Automatisch (System)",
  light: "Heller Modus",
  dark: "Dunkler Modus",
};

export function ThemeCycleButton() {
  const [choice, setChoice] = useThemeChoice();
  const next = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length];
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={`Darstellung wechseln (aktuell: ${LABELS[choice]})`}
      title={`Darstellung: ${LABELS[choice]} – Tippen für ${LABELS[next]}`}
      onClick={() => setChoice(next)}
    >
      {choice === "light" ? (
        <Sun size={17} />
      ) : choice === "dark" ? (
        <Moon size={17} />
      ) : (
        <Monitor size={17} />
      )}
    </button>
  );
}

export function ThemeSegmented() {
  const [choice, setChoice] = useThemeChoice();
  const options: { id: ThemeChoice; label: string; icon: typeof Sun }[] = [
    { id: "system", label: "System", icon: Monitor },
    { id: "light", label: "Hell", icon: Sun },
    { id: "dark", label: "Dunkel", icon: Moon },
  ];
  return (
    <div
      className="segmented-control"
      role="group"
      aria-label="Darstellungsmodus"
    >
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          aria-pressed={choice === opt.id}
          className={choice === opt.id ? "active" : ""}
          onClick={() => setChoice(opt.id)}
        >
          <opt.icon size={15} />
          <span>{opt.label}</span>
        </button>
      ))}
    </div>
  );
}
