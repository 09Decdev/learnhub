import { useEffect, useState } from "react";
import { getFile, parseFolderId } from "../google";
import { addCourse, dayKey, removeCourse, studyByDay, useStore, type State } from "../store";
import { cachedTree, allLessons, loadTree } from "../course";
import { detectLabMap } from "../data/labMaps";
import { nextUp, streaks, useDueCount } from "../plan";
import { cleanName, fmtMinutes, fmtTime, go, lessonHash } from "../util";

function courseStats(folderId: string, s: State) {
  const tree = cachedTree(folderId);
  if (!tree) return null;
  const videos = allLessons(tree).filter((l) => l.kind === "video");
  const done = videos.filter((v) => s.progress[v.id]?.done).length;
  return { total: videos.length, done };
}

/** Các đoạn đánh dấu gần đây nhất, kèm tên bài để mở lại. */
function recentMarks(s: State, limit = 6) {
  const out: { courseId: string; fileId: string; t: number; at: number; lesson: string }[] = [];
  for (const c of s.courses) {
    const tree = cachedTree(c.folderId);
    if (!tree) continue;
    for (const l of allLessons(tree)) {
      for (const n of s.notes[l.id] || []) {
        if (n.mark) out.push({ courseId: c.folderId, fileId: l.id, t: n.t, at: n.at, lesson: cleanName(l.name) });
      }
    }
  }
  return out.sort((a, b) => b.at - a.at).slice(0, limit);
}

function Today() {
  const state = useStore((s) => s);
  const due = useDueCount();
  const byDay = studyByDay(state);
  const today = byDay[dayKey(Date.now())] || 0;
  const { current } = streaks(byDay);
  // Khoá học gần đây nhất lên đầu.
  const ups = [...state.courses]
    .sort((a, b) => (state.last[b.folderId]?.at || 0) - (state.last[a.folderId]?.at || 0))
    .map((c) => nextUp(c, state))
    .filter((u) => u?.next);
  const marks = recentMarks(state);

  return (
    <section className="today" aria-labelledby="today-h">
      <h1 id="today-h">Hôm nay học gì</h1>
      <div className="today-stats">
        <a className="stat" href="#/stats">
          <span className="stat-num">{current}</span>
          <span className="stat-label">ngày học liên tiếp{current ? " 🔥" : ""}</span>
        </a>
        <a className="stat" href="#/stats">
          <span className="stat-num">{Math.round(today / 60)}</span>
          <span className="stat-label">phút đã học hôm nay</span>
        </a>
        <a className="stat" href="#/review">
          <span className="stat-num">{due ?? "…"}</span>
          <span className="stat-label">thẻ cần ôn hôm nay</span>
        </a>
      </div>

      {ups.map((u) => u && u.next && (
        <div key={u.course.folderId} className="next-card">
          <div className="muted small">{u.course.name} · {u.next.chapter.name}</div>
          <div className="next-title">
            {u.resume ? "Xem tiếp: " : "Bài tiếp theo: "}
            <strong>{cleanName(u.next.name)}</strong>
            {u.resume && <span className="muted"> (từ {fmtTime(state.progress[u.next.id]?.pos || 0)})</span>}
          </div>
          <div className="row">
            <a className="btn primary" href={lessonHash(u.course.folderId, u.next.id)}>{u.resume ? "▶ Xem tiếp" : "▶ Bắt đầu"}</a>
            <span className="muted small">
              Chương này còn {fmtMinutes(u.chapterLeft)} · cả khoá còn {fmtMinutes(u.courseLeft)}
            </span>
          </div>
          {u.lab && (
            <div className="small">
              Lab của bài: <a href={u.lab.url} target="_blank" rel="noopener"><code>{u.lab.path}</code> ↗</a>
              {u.lab.done ? <span className="ok"> · đã làm ✓</span> : <span className="muted"> · chưa làm</span>}
            </div>
          )}
        </div>
      ))}

      {marks.length > 0 && (
        <div>
          <h2>Đoạn đã đánh dấu gần đây</h2>
          <ul className="mark-list">
            {marks.map((m) => (
              <li key={m.fileId + m.at}>
                <a href={lessonHash(m.courseId, m.fileId, m.t)}><span className="note-time">{fmtTime(m.t)}</span> {m.lesson}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default function Home() {
  const courses = useStore((s) => s.courses);
  const state = useStore((s) => s);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  // Khoá chưa từng mở thì chưa có danh sách bài: tải ngầm để biết bài tiếp theo.
  const [, setLoaded] = useState(0);
  const missing = courses.filter((c) => !cachedTree(c.folderId)).map((c) => c.folderId).join(",");
  useEffect(() => {
    if (!missing) return;
    Promise.allSettled(missing.split(",").map(loadTree)).then(() => setLoaded((n) => n + 1));
  }, [missing]);

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
      {courses.length > 0 && <Today />}

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
          <p className="muted small">Mỗi thư mục con là một chương, các video bên trong là bài học, sắp theo số thứ tự ở đầu tên file. File phụ đề .srt/.vtt cùng tên với video sẽ tự được gắn vào.</p>
          {error && <p className="error" role="alert">{error}</p>}
        </form>
      </section>
    </main>
  );
}
