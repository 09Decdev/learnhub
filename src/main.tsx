import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { getToken } from "./google";
import { flush } from "./store";
import "./styles.css";

async function registerStreamWorker() {
  if (!("serviceWorker" in navigator)) throw new Error("Trình duyệt này không hỗ trợ Service Worker nên không phát được video.");
  const base = import.meta.env.BASE_URL;
  await navigator.serviceWorker.register(base + "sw.js", { scope: base });
  // Service worker hỏi token khi nó bị khởi động lại và mất token trong bộ nhớ.
  navigator.serviceWorker.addEventListener("message", async (e) => {
    if (e.data?.type !== "need-token") return;
    try { e.ports[0].postMessage(await getToken()); } catch { e.ports[0].postMessage(null); }
  });
  if (!navigator.serviceWorker.controller) {
    await new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
  }
}

window.addEventListener("pagehide", flush);
// Ẩn tab (chuyển tab, khoá màn hình điện thoại) là lúc an toàn nhất để lưu: trang vẫn còn sống.
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });

const root = createRoot(document.getElementById("root")!);
registerStreamWorker()
  .then(() => root.render(<StrictMode><App /></StrictMode>))
  .catch((e) => root.render(<p className="fatal">{String(e.message || e)}</p>));
