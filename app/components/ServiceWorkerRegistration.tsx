"use client";

import { useEffect } from "react";
import { publicPath } from "../../lib/domain/public-path";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register(publicPath("/sw.js")).catch(() => {
        // La aplicación sigue operativa aunque el navegador rechace el modo offline.
      });
    }
  }, []);
  return null;
}
