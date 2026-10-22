// Phụ đề .srt/.vtt nằm cạnh video trên Drive. Trình duyệt chỉ hiểu WebVTT,
// nên file .srt được đổi sang VTT trước khi gắn vào <track>.
// Nội dung phụ đề đã tải được giữ lại ở localStorage để tìm kiếm lời giảng.

import { readText } from "./google";

export type Cue = { t: number; text: string };

const key = (id: string) => "learnhub.sub." + id;

export function toVtt(text: string) {
  const t = text.replace(/^\uFEFF/, "").replace(/\r/g, "");
  if (t.startsWith("WEBVTT")) return t;
  // SRT dùng dấu phẩy cho phần nghìn giây: 00:01:02,500 → 00:01:02.500
  return "WEBVTT\n\n" + t.replace(/(\d\d:\d\d:\d\d),(\d{3})/g, "$1.$2");
}

export function parseCues(vtt: string): Cue[] {
  const out: Cue[] = [];
  for (const block of vtt.split(/\n\s*\n/)) {
    const lines = block.split("\n");
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i < 0) continue;
    const m = /(?:(\d+):)?(\d\d):(\d\d)[.,](\d{3})/.exec(lines[i]);
    if (!m) continue;
    const t = Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
    const text = lines.slice(i + 1).join(" ").replace(/<[^>]+>/g, "").trim();
    if (text) out.push({ t, text });
  }
  return out;
}

export function cachedSub(id: string): string | null {
  try { return localStorage.getItem(key(id)); } catch { return null; }
}

export async function loadSub(id: string): Promise<string> {
  const hit = cachedSub(id);
  if (hit) return hit;
  const vtt = toVtt(await readText(id));
  try { localStorage.setItem(key(id), vtt); } catch { /* đầy bộ nhớ: lần sau tải lại */ }
  return vtt;
}
