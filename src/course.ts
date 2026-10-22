// Đọc cấu trúc một khoá học từ Drive: thư mục gốc → chương (thư mục con) → bài (file).

import { FOLDER, listChildren, type DriveFile } from "./google";
import { leadingNo } from "./util";

export type Lesson = DriveFile & {
  kind: "video" | "doc" | "other";
  duration: number;
  subs?: { id: string; name: string }[]; // file phụ đề .srt/.vtt cùng tên với video
};
export type Chapter = { id: string; name: string; lessons: Lesson[] };
export type CourseTree = { v: 2; folderId: string; chapters: Chapter[]; loadedAt: number };

const key = (id: string) => "learnhub.tree." + id;
const SUB_EXT = /\.(srt|vtt)$/i;
const baseName = (n: string) => n.replace(/\.[^.]+$/, "").replace(/\.(vi|en|vie|eng)$/i, "").toLowerCase();

function toLesson(f: DriveFile): Lesson {
  const kind = f.mimeType.startsWith("video/")
    ? "video"
    : /^text\/(html|plain)/.test(f.mimeType) || /\.(txt|html)$/i.test(f.name) ? "doc" : "other";
  return { ...f, kind, duration: Number(f.videoMediaMetadata?.durationMillis || 0) / 1000 };
}

/** Biến danh sách file của một thư mục thành bài học; phụ đề được gắn vào video cùng tên. */
function toLessons(files: DriveFile[]): Lesson[] {
  const subs = files.filter((f) => SUB_EXT.test(f.name));
  return files
    .filter((f) => f.mimeType !== FOLDER && !SUB_EXT.test(f.name))
    .map((f) => {
      const l = toLesson(f);
      if (l.kind !== "video") return l;
      const mine = subs.filter((s) => baseName(s.name) === baseName(f.name));
      return mine.length ? { ...l, subs: mine.map((s) => ({ id: s.id, name: s.name })) } : l;
    });
}

export function cachedTree(folderId: string): CourseTree | null {
  try {
    const t = JSON.parse(localStorage.getItem(key(folderId)) || "null");
    return t?.v === 2 ? t : null; // bản cache cũ chưa tách phụ đề: tải lại
  } catch {
    return null;
  }
}

export async function loadTree(folderId: string): Promise<CourseTree> {
  const top = await listChildren(folderId);
  const folders = top.filter((f) => f.mimeType === FOLDER);
  const loose = top.filter((f) => f.mimeType !== FOLDER);
  const chapters: Chapter[] = await Promise.all(
    folders.map(async (f) => ({ id: f.id, name: f.name, lessons: toLessons(await listChildren(f.id)) })),
  );
  const looseLessons = toLessons(loose);
  if (looseLessons.length) chapters.unshift({ id: folderId, name: "Tài liệu chung", lessons: looseLessons });
  const tree: CourseTree = { v: 2, folderId, chapters, loadedAt: Date.now() };
  try { localStorage.setItem(key(folderId), JSON.stringify(tree)); } catch { /* cache đầy: lần sau tải lại từ Drive */ }
  return tree;
}

export type LessonIn = Lesson & { chapter: Chapter };
export const allLessons = (t: CourseTree): LessonIn[] => t.chapters.flatMap((c) => c.lessons.map((l) => ({ ...l, chapter: c })));

/** Tìm video theo số chương và số thứ tự ở đầu tên ("05 - ..." / "017 ..."). */
export function findVideo(t: CourseTree, ch: number, no: number): LessonIn | undefined {
  return allLessons(t).find(
    (l) => l.kind === "video" && Number(leadingNo(l.chapter.name)) === ch && Number(leadingNo(l.name)) === no,
  );
}

/** Thời gian còn phải xem của một nhóm video, tính cả chỗ đang xem dở. */
export function remainingSeconds(videos: Lesson[], progress: Record<string, { pos: number; done: boolean }>) {
  return videos.reduce((sum, v) => {
    const p = progress[v.id];
    if (p?.done) return sum;
    return sum + Math.max(0, v.duration - (p?.pos || 0));
  }, 0);
}
