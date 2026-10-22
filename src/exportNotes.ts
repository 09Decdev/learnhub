// Gom ghi chú của một khoá thành file Markdown để ôn tập. Mỗi mốc thời gian
// là một link mở lại đúng giây đó trong learnhub.

import type { CourseTree } from "./course";
import type { Course, State } from "./store";
import { cleanName, download, fmtTime, lessonUrl } from "./util";

export function notesMarkdown(course: Course, tree: CourseTree, s: State): string {
  const out = [`# Ghi chú · ${course.name}`, "", `_Xuất từ learnhub ngày ${new Date().toLocaleDateString("vi-VN")}_`, ""];
  let count = 0;
  for (const ch of tree.chapters) {
    const lessons = ch.lessons.filter((l) => s.notes[l.id]?.length);
    if (!lessons.length) continue;
    out.push(`## ${ch.name}`, "");
    for (const l of lessons) {
      out.push(`### [${cleanName(l.name)}](${lessonUrl(course.folderId, l.id)})`, "");
      for (const n of s.notes[l.id]) {
        const text = n.mark ? (n.text || "🔖 _đoạn đã đánh dấu_") : n.text;
        // Ghi chú nhiều dòng: thụt lề các dòng sau để vẫn nằm trong cùng gạch đầu dòng.
        out.push(`- [${fmtTime(n.t)}](${lessonUrl(course.folderId, l.id, n.t)}) ${text.replace(/\n/g, "\n  ")}`);
        count++;
      }
      out.push("");
    }
  }
  if (!count) out.push("_Chưa có ghi chú nào._", "");
  return out.join("\n");
}

export function downloadNotes(course: Course, tree: CourseTree, s: State) {
  const safe = course.name.replace(/[\\/:*?"<>|]+/g, "-").trim();
  download(`ghi-chu-${safe}.md`, notesMarkdown(course, tree, s));
}
