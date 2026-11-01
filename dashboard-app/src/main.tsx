import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import App from "./App";
import { ToastProvider } from "@/lib/store";
import { bootHW } from "@/lib/hw";

// installable console (own manifest, like the driver/guide apps) + shared offline service worker
if (!import.meta.env.DEV) {
  const l = document.createElement("link"); l.rel = "manifest"; l.href = "manifest.webmanifest"; document.head.appendChild(l);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("../sw.js", { scope: "../" }).catch(() => {});
}
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); (window as unknown as { __hwInstall?: Event }).__hwInstall = e; window.dispatchEvent(new Event("hw-installable")); });

const root = createRoot(document.getElementById("root")!);

// apply the saved theme before first paint of the app
try {
  const t = JSON.parse(localStorage.getItem("hw_theme") || '""');
  const dark = t === "dark" || (!t && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
} catch { /* ignore */ }

bootHW()
  .then((hw) => root.render(<StrictMode><ToastProvider><App hw={hw} /></ToastProvider></StrictMode>))
  .catch((e: Error) => root.render(<p style={{ padding: 24, fontFamily: "system-ui" }}>Could not start the dashboard: {e.message}</p>));
