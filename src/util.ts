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

export type Route = { page: "home" } | { page: "course"; courseId: string; fileId?: string };

function parse(): Route {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "c" && parts[1]) return { page: "course", courseId: parts[1], fileId: parts[2] };
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
