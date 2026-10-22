import { useEffect, useState } from "react";
import { initAuth, isSignedIn, onAuthChange, signIn, signOut } from "./google";
import { loadRemote, useSyncStatus } from "./store";
import { useRoute } from "./util";
import Home from "./components/Home";
import CoursePage from "./components/CoursePage";

export default function App() {
  const route = useRoute();
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(isSignedIn());
  const [error, setError] = useState("");
  const sync = useSyncStatus();

  useEffect(() => {
    initAuth().then(() => setReady(true)).catch((e) => setError(e.message));
    return onAuthChange(setSignedIn);
  }, []);

  useEffect(() => {
    if (signedIn) loadRemote().catch((e) => setError(e.message));
  }, [signedIn]);

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
        <div className="topbar-right">
          <span className={"sync sync-" + sync}>
            {sync === "saving" ? "Đang lưu…" : sync === "saved" ? "Đã lưu lên Drive" : sync === "error" ? "Chưa lưu được" : ""}
          </span>
          <button className="btn ghost" onClick={signOut}>Đăng xuất</button>
        </div>
      </header>
      {error && <p className="error banner" role="alert">{error}</p>}
      {route.page === "home" ? <Home /> : <CoursePage courseId={route.courseId} fileId={route.fileId} />}
    </div>
  );
}
