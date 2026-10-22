import { useEffect, useMemo, useState } from "react";
import { allLessons, cachedTree, loadTree, type CourseTree, type Lesson } from "../course";
import { getState, labKey, setDone, setLabDone, setLast, useStore } from "../store";
import { downloadNotes } from "../exportNotes";
import { labFor, trackerFor } from "../data/labMaps";
import { cleanName, fmtTime, go, leadingNo } from "../util";
import Player from "./Player";
import Notes from "./Notes";
import DocView from "./DocView";
import Theory from "./Theory";
import FocusTimer from "./FocusTimer";

const FOCUS_KEY = "learnhub.focus";

export default function CoursePage({ courseId, fileId, t }: { courseId: string; fileId?: string; t?: number }) {
  const course = useStore((s) => s.courses.find((c) => c.folderId === courseId));
  const progress = useStore((s) => s.progress);
  const last = useStore((s) => s.last[courseId]);
  const [tree, setTree] = useState<CourseTree | null>(() => cachedTree(courseId));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [openCh, setOpenCh] = useState<Record<string, boolean>>({});
  const [autoNext, setAutoNext] = useState(true);
  const [seekTo, setSeekTo] = useState<{ t: number; n: number } | null>(null);
  const [now, setNow] = useState(0);
  const labs = useStore((s) => s.labs);
  const [focus, setFocus] = useState(() => { try { return localStorage.getItem(FOCUS_KEY) === "on"; } catch { return false; } });
  const toggleFocus = () => setFocus((f) => {
    try { localStorage.setItem(FOCUS_KEY, f ? "off" : "on"); } catch { /* bỏ qua */ }
    return !f;
  });

  const refresh = () => {
    setLoading(true); setError("");
    loadTree(courseId).then(setTree).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { if (!tree) refresh(); }, [courseId]); // eslint-disable-line react-hooks/exhaustive-deps

  const lessons = useMemo(() => (tree ? allLessons(tree) : []), [tree]);
  const videos = lessons.filter((l) => l.kind === "video");

  // Không chọn bài nào: mở bài đang xem dở, hoặc video đầu tiên chưa xong.
  useEffect(() => {
    if (!tree || fileId) return;
    const target = last?.fileId && lessons.some((l) => l.id === last.fileId)
      ? last.fileId
      : (videos.find((v) => !progress[v.id]?.done) ?? videos[0])?.id;
    if (target) location.replace(`#/c/${courseId}/${target}`); // không thêm vào lịch sử, để nút Back vẫn về trang trước
  }, [tree, fileId]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = lessons.find((l) => l.id === fileId);
  useEffect(() => {
    if (!current) return;
    setLast(courseId, current.id);
    setOpenCh((o) => ({ ...o, [current.chapter.id]: true }));
    setSeekTo(null);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mở link có ?t= khi đang ở đúng video đó: Player không tải lại, nên tua trực tiếp.
  useEffect(() => {
    if (t !== undefined) setSeekTo({ t, n: Date.now() });
  }, [t, current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!course) {
    return (
      <main className="empty-page">
        <p>Khoá học này chưa có trong danh sách của bạn.</p>
        <a className="btn primary" href="#/">Về trang chủ</a>
      </main>
    );
  }

  const idx = current ? videos.findIndex((v) => v.id === current.id) : -1;
  const next = idx >= 0 ? videos[idx + 1] : undefined;
  const prev = idx > 0 ? videos[idx - 1] : undefined;
  const lab = current ? labFor(course.labMap, current.chapter.name, current.name) : null;
  const tracker = trackerFor(course.labMap);
  const doneCount = videos.filter((v) => progress[v.id]?.done).length;

  const lessonRow = (l: Lesson, chapterName: string) => {
    const p = progress[l.id];
    const state = p?.done ? "done" : p && p.pos > 5 ? "started" : "new";
    const rowLab = labFor(course.labMap, chapterName, l.name);
    return (
      <li key={l.id}>
        <a href={`#/c/${courseId}/${l.id}`} className={"lesson " + state + (l.id === fileId ? " active" : "")}
          aria-current={l.id === fileId ? "page" : undefined}>
          <span className="lesson-no">{leadingNo(l.name) || "·"}</span>
          <span className="lesson-name">{cleanName(l.name)}</span>
          <span className="lesson-meta">
            {l.kind === "video" ? (p?.done ? "✓" : l.duration ? fmtTime(l.duration) : "") : l.kind === "doc" ? "đọc" : "file"}
          </span>
          {rowLab && (labs[labKey(courseId, rowLab.path)]?.done
            ? <span className="lab-dot done" title="Đã tự làm lab này" />
            : <span className="lab-dot" title="Có lab trong repo" />)}
        </a>
      </li>
    );
  };

  return (
    <div className={"course" + (focus ? " focus" : "")}>
      <aside className="sidebar" aria-label="Danh sách bài học">
        <div className="sidebar-head">
          <a href="#/" className="back">← Tất cả khoá học</a>
          <h1 className="course-title">{course.name}</h1>
          <div className="meter" aria-hidden="true"><span style={{ width: (videos.length ? (doneCount / videos.length) * 100 : 0) + "%" }} /></div>
          <div className="muted small">{doneCount}/{videos.length} video đã xem xong</div>
          <div className="sidebar-actions">
            <button className="btn ghost small" onClick={refresh} disabled={loading}>{loading ? "Đang tải…" : "Tải lại danh sách"}</button>
            {tree && <button className="btn ghost small" onClick={() => downloadNotes(course, tree, getState())}>Xuất ghi chú .md</button>}
            {tracker && <a className="btn ghost small" href={tracker} target="_blank" rel="noopener">Lộ trình 16 tuần ↗</a>}
          </div>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {!tree && loading && <p className="muted pad">Đang đọc thư mục khoá học trên Drive…</p>}
        <ol className="chapters">
          {tree?.chapters.map((ch) => {
            const vids = ch.lessons.filter((l) => l.kind === "video");
            const d = vids.filter((v) => progress[v.id]?.done).length;
            const open = openCh[ch.id] ?? false;
            return (
              <li key={ch.id} className="chapter">
                <button className="chapter-head" aria-expanded={open} onClick={() => setOpenCh({ ...openCh, [ch.id]: !open })}>
                  <span className="chapter-name">{ch.name}</span>
                  <span className={"chapter-count" + (vids.length && d === vids.length ? " full" : "")}>{d}/{vids.length}</span>
                </button>
                {open && <ul className="lessons">{ch.lessons.map((l) => lessonRow(l, ch.name))}</ul>}
              </li>
            );
          })}
        </ol>
      </aside>

      <main className="stage">
        {!current ? (
          <p className="muted pad">{tree ? "Chọn một bài ở danh sách bên trái." : ""}</p>
        ) : (
          <>
            <div className="lesson-head">
              <div>
                <div className="muted small">{current.chapter.name}</div>
                <h2>{cleanName(current.name)}</h2>
              </div>
              <div className="row">
                {focus && <FocusTimer />}
                <button className={"btn small " + (focus ? "primary" : "ghost")} onClick={toggleFocus} aria-pressed={focus}>
                  {focus ? "Thoát tập trung" : "Chế độ tập trung"}
                </button>
              </div>
            </div>

            {current.kind === "video" ? (
              <Player
                key={current.id}
                fileId={current.id}
                size={Number(current.size || 0)}
                subs={current.subs}
                startAt={t}
                seekTo={seekTo}
                onTime={setNow}
                onEnded={() => { if (autoNext && next) go(`#/c/${courseId}/${next.id}`); }}
              />
            ) : current.kind === "doc" ? (
              <DocView fileId={current.id} name={current.name} />
            ) : (
              <div className="file-card">
                <p>File này không xem trực tiếp được trong learnhub.</p>
                <a className="btn primary" href={`https://drive.google.com/file/d/${current.id}/view`} target="_blank" rel="noopener">Mở trên Google Drive ↗</a>
              </div>
            )}

            <div className="lesson-bar">
              <div className="row">
                <button className="btn ghost" disabled={!prev} onClick={() => prev && go(`#/c/${courseId}/${prev.id}`)}>← Bài trước</button>
                <button className="btn ghost" disabled={!next} onClick={() => next && go(`#/c/${courseId}/${next.id}`)}>Bài sau →</button>
              </div>
              <div className="row">
                {current.kind === "video" && (
                  <>
                    <label className="check">
                      <input type="checkbox" id="auto-next" checked={autoNext} onChange={(e) => setAutoNext(e.target.checked)} />
                      Tự chuyển bài
                    </label>
                    <button className={"btn " + (progress[current.id]?.done ? "ghost" : "primary")} onClick={() => setDone(current.id, !progress[current.id]?.done)}>
                      {progress[current.id]?.done ? "Đánh dấu chưa xem" : "Đánh dấu đã xem xong"}
                    </button>
                  </>
                )}
              </div>
            </div>

            {current.kind === "video" && (
              <Theory labMap={course.labMap} chapterName={current.chapter.name} fileName={current.name} />
            )}

            {lab && (() => {
              const labDone = !!labs[labKey(courseId, lab.path)]?.done;
              return (
                <div className={"lab-card" + (labDone ? " done" : "")}>
                  <a href={lab.url} target="_blank" rel="noopener" className="lab-link">
                    <span className="lab-label">LAB THỰC HÀNH</span>
                    <code>{lab.path}</code>
                    <span className="muted small">Xem video xong, tắt video và tự làm lab này trong repo devops-learning ↗</span>
                  </a>
                  <label className="check lab-check">
                    <input type="checkbox" checked={labDone} onChange={(e) => setLabDone(courseId, lab.path, e.target.checked)} />
                    {labDone ? "Đã tự làm xong lab này" : "Đánh dấu đã tự làm lab"}
                  </label>
                </div>
              );
            })()}

          </>
        )}
      </main>

      {current?.kind === "video" && (
        <aside className="notes-panel" aria-label="Ghi chú của bài">
          <Notes fileId={current.id} now={now} onSeek={(t) => setSeekTo({ t, n: Date.now() })} />
        </aside>
      )}
    </div>
  );
}
