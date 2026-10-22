import { useState } from "react";
import { addNote, deleteNote, useStore } from "../store";
import { fmtTime } from "../util";

export default function Notes({ fileId, now, onSeek }: { fileId: string; now: number; onSeek: (t: number) => void }) {
  const notes = useStore((s) => s.notes[fileId]) || [];
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
      <h3>Ghi chú <span className="muted small">{notes.length ? `· ${notes.length}` : ""}</span></h3>
      <form onSubmit={submit} className="note-form">
        <label htmlFor={"note-" + fileId} className="note-time">{fmtTime(at ?? now)}</label>
        <textarea
          id={"note-" + fileId}
          rows={2}
          value={text}
          placeholder="Ghi lại ý chính bằng lời của bạn… (Ctrl+Enter để lưu)"
          onFocus={() => { if (at === null) setAt(now); }}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit(e); }}
        />
        <button className="btn primary" disabled={!text.trim()}>Lưu</button>
      </form>
      {notes.length > 0 && (
        <ul className="note-list">
          {notes.map((n) => (
            <li key={n.id}>
              <button className="note-jump" onClick={() => onSeek(n.t)} title="Tua tới đoạn này">{fmtTime(n.t)}</button>
              <p>{n.text}</p>
              <button className="btn ghost small" aria-label="Xoá ghi chú" onClick={() => deleteNote(fileId, n.id)}>Xoá</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
