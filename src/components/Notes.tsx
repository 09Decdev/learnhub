import { useState } from "react";
import { addNote, deleteNote, useStore } from "../store";
import { fmtTime } from "../util";

export default function Notes({ fileId, now, onSeek }: { fileId: string; now: number; onSeek: (t: number) => void }) {
  const all = useStore((s) => s.notes[fileId]) || [];
  const [onlyMarks, setOnlyMarks] = useState(false);
  const notes = onlyMarks ? all.filter((n) => n.mark) : all;
  const markCount = all.filter((n) => n.mark).length;
  const [text, setText] = useState("");
  const [at, setAt] = useState<number | null>(null); // giữ mốc thời gian lúc bắt đầu gõ

  const submit = (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!text.trim()) return;
    addNote(fileId, at ?? now, text.trim());
    setText("");
    setAt(null);
  };

  return (
    <section className="notes" aria-label="Ghi chú">
      <div className="notes-head">
        <h3>Ghi chú <span className="muted small">{all.length ? `· ${all.length}` : ""}</span></h3>
        {markCount > 0 && (
          <div className="seg" role="group" aria-label="Lọc ghi chú">
            <button className={!onlyMarks ? "on" : ""} onClick={() => setOnlyMarks(false)}>Tất cả</button>
            <button className={onlyMarks ? "on" : ""} onClick={() => setOnlyMarks(true)}>🔖 {markCount}</button>
          </div>
        )}
      </div>
      <form onSubmit={submit} className="note-form">
        <label htmlFor={"note-" + fileId} className="note-time">{fmtTime(at ?? now)}</label>
        <textarea
          id={"note-" + fileId}
          rows={2}
          value={text}
          placeholder="Ghi lại ý chính bằng lời của bạn… (Ctrl+Enter để lưu, phím B để chỉ đánh dấu)"
          onFocus={() => { if (at === null) setAt(now); }}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit(e); }}
        />
        <button className="btn primary" disabled={!text.trim()}>Lưu</button>
      </form>
      {notes.length > 0 && (
        <ul className="note-list">
          {notes.map((n) => (
            <li key={n.id} className={n.mark ? "mark" : undefined}>
              <button className="note-jump" onClick={() => onSeek(n.t)} title="Tua tới đoạn này">{fmtTime(n.t)}</button>
              <p>{n.mark ? (n.text || "🔖 Đoạn đã đánh dấu để xem lại") : n.text}</p>
              <button className="btn ghost small" aria-label="Xoá ghi chú" onClick={() => deleteNote(fileId, n.id)}>Xoá</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
