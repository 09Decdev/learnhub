// Đọc cấu trúc một khoá học từ Drive: thư mục gốc → chương (thư mục con) → bài (file).

import { FOLDER, listChildren, type DriveFile } from "./google";

export type Lesson = DriveFile & { kind: "video" | "doc" | "other"; duration: number };
export type Chapter = { id: string; name: string; lessons: Lesson[] };
export type CourseTree = { folderId: string; chapters: Chapter[]; loadedAt: number };

const key = (id: string) => "learnhub.tree." + id;

function toLesson(f: DriveFile): Lesson {
  const kind = f.mimeType.startsWith("video/")
    ? "video"
    : /^text\/(html|plain)/.test(f.mimeType) || /\.(txt|html)$/i.test(f.name) ? "doc" : "other";
  return { ...f, kind, duration: Number(f.videoMediaMetadata?.durationMillis || 0) / 1000 };
}

export function cachedTree(folderId: string): CourseTree | null {
  try { return JSON.parse(localStorage.getItem(key(folderId)) || "null"); } catch { return null; }
}

export async function loadTree(folderId: string): Promise<CourseTree> {
  const top = await listChildren(folderId);
  const folders = top.filter((f) => f.mimeType === FOLDER);
  const loose = top.filter((f) => f.mimeType !== FOLDER);
  const chapters: Chapter[] = await Promise.all(
    folders.map(async (f) => ({
      id: f.id,
      name: f.name,
      lessons: (await listChildren(f.id)).filter((x) => x.mimeType !== FOLDER).map(toLesson),
    })),
  );
  if (loose.length) chapters.unshift({ id: folderId, name: "Tài liệu chung", lessons: loose.map(toLesson) });
  const tree = { folderId, chapters, loadedAt: Date.now() };
  try { localStorage.setItem(key(folderId), JSON.stringify(tree)); } catch { /* cache đầy: lần sau tải lại từ Drive */ }
  return tree;
}

export const allLessons = (t: CourseTree) => t.chapters.flatMap((c) => c.lessons.map((l) => ({ ...l, chapter: c })));
