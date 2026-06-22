import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

// Re-hydrate dark mode from persisted store before first paint
try {
  const persisted = JSON.parse(localStorage.getItem('data2dash-ui') || '{}');
  if (persisted?.state?.isDarkMode) {
    document.documentElement.classList.add('dark');
  }
} catch { /* ignore */ }

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
