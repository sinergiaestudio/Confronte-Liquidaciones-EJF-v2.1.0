"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const BASE = "https://sinergiaestudio.github.io";
const STORAGE_KEY = "sec29-theme";

const MODULES = [
  {
    group: "Mensajería y reportes",
    label: "Actuaciones y vencimientos",
    detail: "Listados para WhatsApp",
    icon: "▤",
    href: `${BASE}/herramientas-j15sec29/#procesadores`,
  },
  {
    group: "Automatización EJE",
    label: "Creador de actuaciones en lote",
    detail: "Carga secuencial de expedientes",
    icon: "⇩",
    href: `${BASE}/herramientas-j15sec29/#actuaciones-lote`,
  },
  {
    group: "Automatización EJE",
    label: "Creador de Lotes - Cédulas",
    detail: "Del PDF al lote de notificaciones",
    icon: "✉",
    href: `${BASE}/Cedulas-EJE-v1.0/`,
  },
  {
    group: "Control y cálculo",
    label: "Confronte de Liquidaciones EJF",
    detail: "Control documental e intereses",
    icon: "≋",
    href: `${BASE}/Confronte-Liquidaciones-EJF-v2.1.0/`,
    active: true,
  },
] as const;

function preferredTheme(): Theme {
  if (typeof window === "undefined") return "light";

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Continúa con la preferencia del sistema cuando el almacenamiento está bloqueado.
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function Sec29SuiteShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setTheme(preferredTheme()));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;

    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    themeColor?.setAttribute("content", theme === "dark" ? "#3f0914" : "#821529");

    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // El tema sigue activo durante la sesión aunque el navegador no permita persistirlo.
    }
  }, [theme]);

  useEffect(() => {
    document.body.classList.toggle("sec29-suite-menu-open", menuOpen);
    return () => document.body.classList.remove("sec29-suite-menu-open");
  }, [menuOpen]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, []);

  const groups = Array.from(new Set(MODULES.map((module) => module.group)));
  const nextTheme = theme === "dark" ? "light" : "dark";
  const themeLabel = nextTheme === "dark" ? "Activar modo oscuro" : "Activar modo claro";

  return (
    <>
      <header className="sec29-suite-header">
        <div className="sec29-suite-header__left">
          <button
            className="sec29-suite-control"
            type="button"
            aria-label={menuOpen ? "Cerrar menú de herramientas" : "Abrir menú de herramientas"}
            aria-controls="sec29-suite-sidebar"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span aria-hidden="true">☰</span>
          </button>

          <button
            className="sec29-suite-control"
            type="button"
            aria-label={themeLabel}
            aria-pressed={theme === "dark"}
            title={themeLabel}
            onClick={() => setTheme(nextTheme)}
          >
            <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
          </button>

          <a className="sec29-suite-brand" href={`${BASE}/herramientas-j15sec29/#procesadores`}>
            <span className="sec29-suite-brand__mark" aria-hidden="true">⚖</span>
            <span className="sec29-suite-brand__copy">
              <strong>Juzgado N.º 15 · Secretaría N.º 29</strong>
              <small>Biblioteca de Mero Trámite · Herramientas internas</small>
            </span>
          </a>
        </div>

        <span className="sec29-suite-current">Confronte de Liquidaciones EJF</span>
      </header>

      <aside
        id="sec29-suite-sidebar"
        className={`sec29-suite-sidebar${menuOpen ? " is-open" : ""}`}
        aria-label="Menú de herramientas"
        aria-hidden={!menuOpen}
      >
        <div className="sec29-suite-sidebar__heading">
          <span aria-hidden="true">▦</span>
          <span>
            <strong>Herramientas SEC29</strong>
            <small>Acceso por módulos</small>
          </span>
        </div>

        <nav className="sec29-suite-nav">
          {groups.map((group) => (
            <div className="sec29-suite-group" key={group}>
              <p>{group}</p>
              {MODULES.filter((module) => module.group === group).map((module) => (
                <a
                  className={`sec29-suite-nav__item${"active" in module && module.active ? " is-active" : ""}`}
                  href={module.href}
                  aria-current={"active" in module && module.active ? "page" : undefined}
                  key={module.label}
                  onClick={() => setMenuOpen(false)}
                >
                  <span className="sec29-suite-nav__icon" aria-hidden="true">{module.icon}</span>
                  <span className="sec29-suite-nav__copy">
                    <strong>{module.label}</strong>
                    <small>{module.detail}</small>
                  </span>
                </a>
              ))}
            </div>
          ))}
        </nav>

        <div className="sec29-suite-sidebar__footer">
          Diseño y desarrollo: Marcelo Gómez · innovación aplicada a la gestión judicial.
        </div>
      </aside>

      <button
        className={`sec29-suite-backdrop${menuOpen ? " is-visible" : ""}`}
        type="button"
        aria-label="Cerrar menú"
        tabIndex={menuOpen ? 0 : -1}
        onClick={() => setMenuOpen(false)}
      />
    </>
  );
}
