import { useState } from "react";
import { getFile, parseFolderId } from "../google";
import { addCourse, removeCourse, useStore, type State } from "../store";
import { cachedTree, allLessons } from "../course";
import { detectLabMap } from "../data/labMaps";
import { go } from "../util";

function courseStats(folderId: string, s: State) {
  const tree = cachedTree(folderId);
  if (!tree) return null;
  const videos = allLessons(tree).filter((l) => l.kind === "video");
  const done = videos.filter((v) => s.progress[v.id]?.done).length;
  return { total: videos.length, done };
}

export default function Home() {
  const courses = useStore((s) => s.courses);
  const state = useStore((s) => s);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const id = parseFolderId(link);
    if (!id) return setError("Link chưa đúng. Hãy dán link thư mục Drive, dạng drive.google.com/drive/folders/…");
    setBusy(true);
    try {
      const f = await getFile(id);
      if (f.mimeType !== "application/vnd.google-apps.folder") throw new Error("Link này là một file, không phải thư mục khoá học.");
      addCourse({ folderId: id, name: f.name, labMap: detectLabMap(f.name) });
      setLink("");
      go(`#/c/${id}`);
    } catch (err: any) {
      setError(err.message.includes("404") ? "Không tìm thấy thư mục, hoặc tài khoản Google này chưa có quyền xem." : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="home">
      <section>
        <h1>Khoá học của bạn</h1>
        {courses.length === 0 ? (
          <p className="muted">Chưa có khoá học nào. Dán link thư mục Google Drive của khoá học vào ô bên dưới để bắt đầu.</p>
        ) : (
          <ul className="course-grid">
            {courses.map((c) => {
              const st = courseStats(c.folderId, state);
              const pct = st && st.total ? Math.round((st.done / st.total) * 100) : 0;
              return (
                <li key={c.folderId} className="course-card">
                  <a href={`#/c/${c.folderId}`} className="course-link">
                    <span className="course-name">{c.name}</span>
                    <span className="meter" aria-hidden="true"><span style={{ width: pct + "%" }} /></span>
                    <span className="muted small">
                      {st ? `${st.done}/${st.total} video · ${pct}%` : "Mở để tải danh sách bài"}
                    </span>
                  </a>
                  {confirmId === c.folderId ? (
                    <span className="confirm">
                      Gỡ khoá khỏi learnhub? (Video trên Drive vẫn giữ nguyên)
                      <button className="btn danger small" onClick={() => removeCourse(c.folderId)}>Gỡ</button>
                      <button className="btn ghost small" onClick={() => setConfirmId(null)}>Huỷ</button>
                    </span>
                  ) : (
                    <button className="btn ghost small remove" onClick={() => setConfirmId(c.folderId)}>Gỡ khoá</button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="add-course">
        <h2>Thêm khoá học</h2>
        <form onSubmit={onAdd}>
          <label htmlFor="folder-link">Link thư mục Google Drive</label>
          <div className="row">
            <input
              id="folder-link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/…"
              autoComplete="off"
            />
            <button className="btn primary" disabled={busy || !link.trim()}>{busy ? "Đang kiểm tra…" : "Thêm"}</button>
          </div>
          <p className="muted small">Mỗi thư mục con là một chương, các video bên trong là bài học, sắp theo số thứ tự ở đầu tên file.</p>
          {error && <p className="error" role="alert">{error}</p>}
        </form>
      </section>
    </main>
  );
}
