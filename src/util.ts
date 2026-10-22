import { useEffect, useState } from "react";

export function fmtTime(sec: number) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return (h ? h + ":" : "") + mm + ":" + String(s).padStart(2, "0");
}

/** Bỏ số thứ tự và đuôi file: "017 Lab4 - Sử dụng Output.mp4" → "Lab4 - Sử dụng Output". */
export function cleanName(name: string) {
  return name.replace(/\.(mp4|mkv|webm|mov|html|txt|pdf|pptx?)$/i, "").replace(/^\s*\d+\s*[-.)]?\s*/, "");
}

export function leadingNo(name: string) {
  return /^\s*(\d+)/.exec(name)?.[1] ?? "";
}

export type Route =
  | { page: "home" }
  | { page: "course"; courseId: string; fileId?: string; t?: number }
  | { page: "search"; q: string }
  | { page: "review" }
  | { page: "stats" };

// Dạng link: #/c/<khoá>/<video>?t=123, #/search?q=..., #/review, #/stats
function parse(): Route {
  const [path, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const qs = new URLSearchParams(query);
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "c" && parts[1]) {
    const t = Number(qs.get("t"));
    return { page: "course", courseId: parts[1], fileId: parts[2], t: t > 0 ? t : undefined };
  }
  if (parts[0] === "search") return { page: "search", q: qs.get("q") || "" };
  if (parts[0] === "review") return { page: "review" };
  if (parts[0] === "stats") return { page: "stats" };
  return { page: "home" };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export const go = (hash: string) => { location.hash = hash; };

export const lessonHash = (courseId: string, fileId: string, t?: number) =>
  `#/c/${courseId}/${fileId}` + (t && t > 0 ? `?t=${Math.floor(t)}` : "");

/** Link đầy đủ (dán được vào file ghi chú) tới một bài, có thể kèm mốc thời gian. */
export const lessonUrl = (courseId: string, fileId: string, t?: number) =>
  location.origin + location.pathname + lessonHash(courseId, fileId, t);

/** Bỏ dấu tiếng Việt và viết thường, để gõ "trien khai" vẫn tìm ra "triển khai". */
export const fold = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

export function download(name: string, text: string, type = "text/markdown") {
  const url = URL.createObjectURL(new Blob([text], { type: type + ";charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const fmtMinutes = (sec: number) => {
  if (sec > 0 && sec < 30) return "dưới 1 phút";
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} giờ ${m % 60 ? (m % 60) + " phút" : ""}`.trim() : `${m} phút`;
};
