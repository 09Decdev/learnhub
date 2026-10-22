import { useEffect, useMemo, useState, type ReactNode } from "react";
import { allLessons, cachedTree, findVideo } from "../course";
import { loadAllDocs, plain, type Doc } from "../content";
import { cachedSub, parseCues } from "../subs";
import { useStore } from "../store";
import { cleanName, fmtTime, fold, lessonHash } from "../util";

type Hit = { kind: "bài" | "ghi chú" | "lý thuyết" | "phụ đề"; title: string; text: string; href: string; score: number };

const MAX = 80;

// Từ khoá chỉ khớp ở đầu một từ: "ip" khớp "IP", "ipv4" nhưng không khớp "pipeline".
const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRe = (t: string) => new RegExp("(?<![\\p{L}\\p{N}])" + escape(t), "gu");

/** Đoạn trích quanh chỗ khớp, có tô đậm từ khoá. Tìm trên bản bỏ dấu nhưng hiển thị chữ gốc. */
function snippet(text: string, terms: string[], width = 160): ReactNode {
  const f = fold(text);
  const found = terms.map((t) => f.search(wordRe(t))).filter((i) => i >= 0);
  const at = found.length ? Math.min(...found) : 0;
  const start = Math.max(0, at - 50);
  const s = text.slice(start, start + width);
  const fs = fold(s);
  const marks: [number, number][] = [];
  for (const t of terms) for (const m of fs.matchAll(wordRe(t))) marks.push([m.index!, m.index! + t.length]);
  marks.sort((a, b) => a[0] - b[0]);
  const out: ReactNode[] = [];
  let pos = 0;
  for (const [a, b] of marks) {
    if (a < pos) continue;
    out.push(s.slice(pos, a), <mark key={a}>{s.slice(a, b)}</mark>);
    pos = b;
  }
  out.push(s.slice(pos));
  return <>{start > 0 && "…"}{out}{start + width < text.length && "…"}</>;
}

export default function Search({ q }: { q: string }) {
  const s = useStore((x) => x);
  const [input, setInput] = useState(q);
  const [docs, setDocs] = useState<{ labMap: string; chapter: number; doc: Doc }[] | null>(null);
  useEffect(() => { setInput(q); }, [q]);
  useEffect(() => { loadAllDocs().then(setDocs); }, []);

  const terms = useMemo(() => fold(input.normalize("NFC")).split(/\s+/).filter((t) => t.length > 1), [input]);

  const hits = useMemo(() => {
    if (!terms.length) return [];
    const out: Hit[] = [];
    const res = terms.map(wordRe);
    const phrase = terms.join(" ");
    const match = (text: string) => { const f = fold(text); return res.every((r) => { r.lastIndex = 0; return r.test(f); }); };
    // Chứa nguyên cụm từ đã gõ thì xếp lên trên.
    const bonus = (text: string) => (terms.length > 1 && fold(text).includes(phrase) ? 2 : 0);
    for (const c of s.courses) {
      const tree = cachedTree(c.folderId);
      if (!tree) continue;
      for (const l of allLessons(tree)) {
        const name = l.name.normalize("NFC");
        if (match(name + " " + l.chapter.name)) {
          out.push({ kind: "bài", title: cleanName(name), text: l.chapter.name, href: lessonHash(c.folderId, l.id), score: 3 + bonus(name) });
        }
        for (const n of s.notes[l.id] || []) {
          if (n.text && match(n.text)) {
            out.push({ kind: "ghi chú", title: `${fmtTime(n.t)} · ${cleanName(name)}`, text: n.text, href: lessonHash(c.folderId, l.id, n.t), score: 2 + bonus(n.text) });
          }
        }
        for (const sub of l.subs || []) {
          const vtt = cachedSub(sub.id);
          if (!vtt) continue;
          for (const cue of parseCues(vtt)) {
            if (match(cue.text)) {
              out.push({ kind: "phụ đề", title: `${fmtTime(cue.t)} · ${cleanName(name)}`, text: cue.text, href: lessonHash(c.folderId, l.id, cue.t), score: 1 + bonus(cue.text) });
            }
          }
        }
      }
    }
    for (const d of docs || []) {
      const course = s.courses.find((c) => c.labMap === d.labMap);
      const tree = course && cachedTree(course.folderId);
      for (const sec of d.doc.sections) {
        const body = plain(sec.body);
        if (!match(sec.title + " " + body)) continue;
        const v = tree && findVideo(tree, d.chapter, sec.from);
        out.push({
          kind: "lý thuyết",
          title: `Chương ${String(d.chapter).padStart(2, "0")} · ${sec.title}`,
          text: body,
          href: course && v ? lessonHash(course.folderId, v.id) : "#/",
          score: (match(sec.title) ? 2.5 : 1.5) + bonus(sec.title + " " + body),
        });
      }
    }
    return out.sort((a, b) => b.score - a.score);
  }, [terms, s, docs]);

  return (
    <main className="page search">
      <h1>Tìm kiếm</h1>
      <form role="search" onSubmit={(e) => { e.preventDefault(); location.replace("#/search?q=" + encodeURIComponent(input)); }}>
        <input
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Tên bài, ghi chú, lý thuyết, phụ đề… (gõ không dấu cũng được)"
          aria-label="Từ khoá"
          autoFocus
        />
      </form>
      {!docs && <p className="muted small">Đang tải lý thuyết để tìm…</p>}
      {terms.length > 0 && (
        <p className="muted small">
          {hits.length ? `${hits.length} kết quả${hits.length > MAX ? `, hiện ${MAX} kết quả đầu` : ""}` : "Không tìm thấy gì."}
          {" "}Phụ đề chỉ tìm được ở các video đã mở ít nhất một lần.
        </p>
      )}
      <ul className="hits">
        {hits.slice(0, MAX).map((h, i) => (
          <li key={i}>
            <a href={h.href}>
              <span className="hit-kind">{h.kind}</span>
              <span className="hit-title">{h.title}</span>
              <span className="hit-text muted small">{snippet(h.text, terms)}</span>
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
