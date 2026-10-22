// Lý thuyết viết bằng Markdown: src/content/<labMap>/<số chương>.md
// Mỗi phần "## Tiêu đề {011-014}" gắn với các video số 011 tới 014 của chương.
// Mỗi chương là một file riêng, chỉ tải khi cần.
//
// Bài tập trong lý thuyết (đoạn đề + khối <details> "Gợi ý"/"Lời giải") được
// tách thành thẻ ôn tập để học lại theo lịch 1, 3, 7… ngày.

import { marked } from "marked";

const FILES = import.meta.glob("./content/*/*.md", { query: "?raw", import: "default" }) as Record<string, () => Promise<string>>;

export type Section = { title: string; from: number; to: number; body: string };
export type Doc = { intro: string; sections: Section[] };
export type Card = {
  id: string;
  labMap: string;
  chapter: number;   // số chương
  section: Section;
  front: string;     // markdown của câu hỏi / đề bài
  back: string;      // markdown của lời giải
};

const path = (labMap: string, chapter: number | string) => `./content/${labMap}/${String(chapter).padStart(2, "0")}.md`;

export const loaderFor = (labMap: string | undefined, chapter: number | string) =>
  labMap ? FILES[path(labMap, chapter)] : undefined;

export function parseDoc(md: string): Doc {
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

export const html = (md: string) => marked.parse(md, { async: false }) as string;

/** Mọi chương lý thuyết hiện có: [labMap, số chương, hàm tải]. */
export const allDocs = () =>
  Object.entries(FILES).map(([p, load]) => {
    const m = /content\/([^/]+)\/(\d+)\.md$/.exec(p)!;
    return { labMap: m[1], chapter: Number(m[2]), load };
  });

let docsPromise: Promise<{ labMap: string; chapter: number; doc: Doc }[]> | null = null;
/** Tải mọi chương một lần (dùng cho tìm kiếm và ôn tập). */
export function loadAllDocs() {
  docsPromise ??= Promise.all(
    allDocs().map(async (d) => ({ labMap: d.labMap, chapter: d.chapter, doc: parseDoc((await d.load()).normalize("NFC")) })),
  ).then((list) => list.sort((a, b) => a.labMap.localeCompare(b.labMap) || a.chapter - b.chapter));
  return docsPromise;
}

// Tiêu đề khối <details> chỉ là nhãn ("Gợi ý", "Lời giải"…): câu hỏi nằm ở đoạn văn ngay trước đó.
const LABEL = /^(gợi ý|lời giải|hướng giải|đáp án|kiểm tra)/i;
const DETAILS = /^<details><summary>(.*)<\/summary>\s*$/;

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

/** Tách bài tập của một phần lý thuyết thành thẻ ôn tập. */
export function cardsOf(labMap: string, chapter: number, section: Section): Card[] {
  const lines = section.body.split("\n");
  const cards: { front: string; backs: string[] }[] = [];
  let paras: string[][] = [];     // các đoạn văn kể từ khối <details> hoặc tiêu đề gần nhất
  let cur: string[] = [];
  let lastWasDetails = false;     // để gộp "Gợi ý" + "Lời giải" liền nhau của cùng một đề
  let inFence = false;
  const endPara = () => { if (cur.length) { paras.push(cur); cur = []; } };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = !inFence && DETAILS.exec(line);
    if (!m) {
      if (line.startsWith("```")) inFence = !inFence;
      if (!inFence && line.trim() === "") { endPara(); continue; }
      if (!inFence && /^#{1,6} /.test(line)) { cur = []; paras = []; lastWasDetails = false; continue; }
      cur.push(line);
      lastWasDetails = false;
      continue;
    }
    endPara();
    const summary = m[1].trim();
    const body: string[] = [];
    for (i++; i < lines.length && lines[i].trim() !== "</details>"; i++) body.push(lines[i]);
    const isLabel = LABEL.test(summary);
    const back = (isLabel ? `**${summary}**\n\n` : "") + body.join("\n").trim();
    if (!isLabel) {
      cards.push({ front: summary, backs: [back] });
    } else if (lastWasDetails && cards.length) {
      cards[cards.length - 1].backs.push(back);
    } else if (paras.length) {
      // Đề bài bắt đầu ở đoạn có 🟢/🟡/🔴 gần nhất (có thể kèm code block phía sau); không có thì lấy đoạn cuối.
      const k = paras.map((p) => /^[🟢🟡🔴]/u.test(p[0])).lastIndexOf(true);
      const front = (k >= 0 ? paras.slice(k) : paras.slice(-1)).map((p) => p.join("\n")).join("\n\n");
      cards.push({ front: front.trim(), backs: [back] });
    }
    paras = [];
    lastWasDetails = true;
  }
  return cards.map((c) => ({
    id: `${labMap}:${chapter}:${hash(c.front)}`,
    labMap, chapter, section,
    front: c.front,
    back: c.backs.join("\n\n"),
  }));
}

let cardsPromise: Promise<Card[]> | null = null;
export function loadAllCards() {
  cardsPromise ??= loadAllDocs().then((docs) =>
    docs.flatMap((d) => d.doc.sections.flatMap((s) => cardsOf(d.labMap, d.chapter, s))),
  );
  return cardsPromise;
}

/** Bỏ ký hiệu Markdown/HTML để tìm kiếm trên chữ thuần. */
export const plain = (md: string) =>
  md
    .replace(/<\/?[a-z][^>]*>/gi, " ")
    .replace(/```[^\n]*\n/g, "")
    .replace(/[*_`>#|]+/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[ \t]+/g, " ");
