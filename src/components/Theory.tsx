import { useMemo, useState } from "react";
import { marked } from "marked";
import { leadingNo } from "../util";

// Lý thuyết viết bằng Markdown: src/content/<labMap>/<số chương>.md
// Mỗi phần "## Tiêu đề {011-014}" gắn với các video số 011 tới 014 của chương.
const FILES = import.meta.glob("../content/*/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

type Section = { title: string; from: number; to: number; body: string };
type Doc = { intro: string; sections: Section[] };

function parse(md: string): Doc {
  const [intro, ...parts] = md.split(/^## /m);
  const sections = parts.map((p) => {
    const nl = p.indexOf("\n");
    const head = p.slice(0, nl).trim();
    const m = /\{(\d+)(?:-(\d+))?\}\s*$/.exec(head);
    return {
      title: head.replace(/\s*\{[\d-]+\}\s*$/, ""),
      from: m ? Number(m[1]) : -1,
      to: m ? Number(m[2] ?? m[1]) : -1,
      body: p.slice(nl + 1),
    };
  });
  return { intro, sections };
}

const html = (md: string) => marked.parse(md, { async: false }) as string;

export function hasTheory(labMap: string | undefined, chapterName: string) {
  return !!(labMap && FILES[`../content/${labMap}/${leadingNo(chapterName).padStart(2, "0")}.md`]);
}

export default function Theory({ labMap, chapterName, fileName }: { labMap?: string; chapterName: string; fileName: string }) {
  const [whole, setWhole] = useState(false);
  const raw = labMap ? FILES[`../content/${labMap}/${leadingNo(chapterName).padStart(2, "0")}.md`] : undefined;
  const doc = useMemo(() => (raw ? parse(raw) : null), [raw]);
  const v0 = Number(leadingNo(fileName));
  const key = doc?.sections.findIndex((s) => v0 >= s.from && v0 <= s.to) ?? -1;
  // Chỉ dựng HTML lại khi đổi bài hoặc đổi phạm vi, không phải mỗi lần video chạy thêm một giây.
  const rendered = useMemo(() => {
    if (!doc) return null;
    const list = whole || key < 0 ? doc.sections : [doc.sections[key]];
    return { intro: html(doc.intro), parts: list.map((s) => ({ title: s.title, body: html(s.body) })) };
  }, [doc, whole, key]);
  if (!doc || !rendered) return null;

  const v = Number(leadingNo(fileName));
  const match = doc.sections.find((s) => v >= s.from && v <= s.to);
  const showAll = whole || !match;

  return (
    <section className="theory" aria-label="Lý thuyết">
      <div className="theory-head">
        <h3>Lý thuyết</h3>
        <div className="seg" role="group" aria-label="Phạm vi lý thuyết">
          <button className={!whole && match ? "on" : ""} disabled={!match} onClick={() => setWhole(false)}>Bài này</button>
          <button className={whole || !match ? "on" : ""} onClick={() => setWhole(true)}>Cả chương</button>
        </div>
      </div>
      {showAll && <div className="md" dangerouslySetInnerHTML={{ __html: rendered.intro }} />}
      {rendered.parts.map((s) => (
        <article key={s.title} className="md">
          <h4>{s.title}</h4>
          <div dangerouslySetInnerHTML={{ __html: s.body }} />
        </article>
      ))}
    </section>
  );
}
