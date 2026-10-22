import { useEffect, useMemo, useState } from "react";
import { html, loaderFor, parseDoc } from "../content";
import { leadingNo } from "../util";

export default function Theory({ labMap, chapterName, fileName }: { labMap?: string; chapterName: string; fileName: string }) {
  const [whole, setWhole] = useState(false);
  const loader = loaderFor(labMap, leadingNo(chapterName) || "x");
  const [raw, setRaw] = useState<string | undefined>();
  useEffect(() => {
    setRaw(undefined);
    let alive = true;
    loader?.().then((t) => { if (alive) setRaw(t); });
    return () => { alive = false; };
  }, [loader]);
  const doc = useMemo(() => (raw ? parseDoc(raw) : null), [raw]);
  const v = Number(leadingNo(fileName));
  const key = doc?.sections.findIndex((s) => v >= s.from && v <= s.to) ?? -1;
  const showAll = whole || key < 0;
  // Chỉ dựng HTML lại khi đổi bài hoặc đổi phạm vi, không phải mỗi lần video chạy thêm một giây.
  const rendered = useMemo(() => {
    if (!doc) return null;
    const list = showAll ? doc.sections : [doc.sections[key]];
    return { intro: html(doc.intro), parts: list.map((s) => ({ title: s.title, body: html(s.body) })) };
  }, [doc, showAll, key]);
  if (!rendered) return null;

  return (
    <section className="theory" aria-label="Lý thuyết">
      <div className="theory-head">
        <h3>Lý thuyết</h3>
        <div className="seg" role="group" aria-label="Phạm vi lý thuyết">
          <button className={!showAll ? "on" : ""} disabled={key < 0} onClick={() => setWhole(false)}>Bài này</button>
          <button className={showAll ? "on" : ""} onClick={() => setWhole(true)}>Cả chương</button>
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
