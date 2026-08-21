"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // La aplicación sigue operativa aunque el navegador rechace el modo offline.
      });
    }
  }, []);
  return null;
}

