import { useEffect, useState } from "react";
import { initAuth, isSignedIn, onAuthChange, signIn, signOut } from "./google";
import { loadRemote, useSyncStatus } from "./store";
import { useDueCount } from "./plan";
import { go, useRoute } from "./util";
import Home from "./components/Home";
import CoursePage from "./components/CoursePage";
import Search from "./components/Search";
import Review from "./components/Review";
import Stats from "./components/Stats";

type Theme = "auto" | "light" | "dark";
const THEME_KEY = "learnhub.theme";
const THEMES: Theme[] = ["auto", "light", "dark"];
const THEME_LABEL: Record<Theme, string> = { auto: "◐ Theo máy", light: "☀ Sáng", dark: "☾ Tối" };

function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try { const t = localStorage.getItem(THEME_KEY); return t === "light" || t === "dark" ? t : "auto"; } catch { return "auto"; }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "auto") delete root.dataset.theme; else root.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* bỏ qua */ }
  }, [theme]);
  return [theme, () => setTheme((t) => THEMES[(THEMES.indexOf(t) + 1) % THEMES.length])] as const;
}

function Nav({ page }: { page: string }) {
  const due = useDueCount();
  const [q, setQ] = useState("");
  return (
    <nav className="nav" aria-label="Điều hướng chính">
      <a href="#/" aria-current={page === "home" ? "page" : undefined}>Hôm nay</a>
      <a href="#/review" aria-current={page === "review" ? "page" : undefined}>
        Ôn tập{due ? <span className="badge" aria-label={`${due} thẻ cần ôn`}>{due}</span> : null}
      </a>
      <a href="#/stats" aria-current={page === "stats" ? "page" : undefined}>Thống kê</a>
      {page !== "search" && (
        <form role="search" className="nav-search" onSubmit={(e) => { e.preventDefault(); go("#/search?q=" + encodeURIComponent(q)); setQ(""); }}>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm bài, ghi chú, lý thuyết…" aria-label="Tìm kiếm" />
        </form>
      )}
    </nav>
  );
}

export default function App() {
  const route = useRoute();
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(isSignedIn());
  const [error, setError] = useState("");
  const sync = useSyncStatus();
  const [theme, nextTheme] = useTheme();

  useEffect(() => {
    initAuth().then(() => setReady(true)).catch((e) => setError(e.message));
    return onAuthChange(setSignedIn);
  }, []);

  useEffect(() => {
    if (signedIn) loadRemote().catch((e) => setError(e.message));
  }, [signedIn]);

  // Phím "/" để nhảy vào ô tìm kiếm.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || (e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
      const box = document.querySelector<HTMLInputElement>("input[type=search]");
      if (box) { e.preventDefault(); box.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const login = () => { setError(""); signIn().catch((e) => setError(e.message)); };

  if (!signedIn) {
    return (
      <main className="login">
        <div className="login-card">
          <div className="brand">learnhub</div>
          <h1>Học từ thư mục khoá học trên Google Drive</h1>
          <p>Đăng nhập bằng tài khoản Google có quyền xem thư mục khoá học. learnhub chỉ đọc file, không sửa hay xoá gì trên Drive của bạn.</p>
          <button className="btn primary" disabled={!ready} onClick={login}>
            {ready ? "Đăng nhập bằng Google" : "Đang tải…"}
          </button>
          {error && <p className="error" role="alert">{error}</p>}
        </div>
      </main>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/">learnhub</a>
        <Nav page={route.page} />
        <div className="topbar-right">
          <span className={"sync sync-" + sync}>
            {sync === "saving" ? "Đang lưu…" : sync === "saved" ? "Đã lưu lên Drive" : sync === "error" ? "Chưa lưu được" : ""}
          </span>
          <button className="btn ghost small" onClick={nextTheme} title="Đổi giao diện sáng / tối">{THEME_LABEL[theme]}</button>
          <button className="btn ghost small" onClick={signOut}>Đăng xuất</button>
        </div>
      </header>
      {error && <p className="error banner" role="alert">{error}</p>}
      {route.page === "home" ? <Home />
        : route.page === "search" ? <Search q={route.q} />
        : route.page === "review" ? <Review />
        : route.page === "stats" ? <Stats />
        : <CoursePage courseId={route.courseId} fileId={route.fileId} t={route.t} />}
    </div>
  );
}
