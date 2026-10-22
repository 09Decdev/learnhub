// Tính toán dùng chung cho trang chủ, thống kê và ôn tập: bài tiếp theo,
// chuỗi ngày học, tốc độ học, thẻ ôn tập đến hạn.

import { useEffect, useState } from "react";
import { allLessons, cachedTree, findVideo, remainingSeconds, type CourseTree, type LessonIn } from "./course";
import { loadAllCards, type Card } from "./content";
import { labFor } from "./data/labMaps";
import { leadingNo } from "./util";
import { dayKey, getState, startOfDay, studyByDay, useStore, type Course, type State } from "./store";

export type NextUp = {
  course: Course;
  tree: CourseTree;
  resume?: LessonIn;      // video đang xem dở
  next?: LessonIn;        // video đầu tiên chưa xem xong
  chapterLeft: number;    // giây còn lại của chương chứa bài tiếp theo
  courseLeft: number;
  lab?: { path: string; url: string; done: boolean };
};

export function nextUp(course: Course, s: State): NextUp | null {
  const tree = cachedTree(course.folderId);
  if (!tree) return null;
  const videos = allLessons(tree).filter((l) => l.kind === "video");
  const lastId = s.last[course.folderId]?.fileId;
  const lastLesson = videos.find((v) => v.id === lastId);
  const resume = lastLesson && !s.progress[lastLesson.id]?.done && (s.progress[lastLesson.id]?.pos || 0) > 5 ? lastLesson : undefined;
  // Bài tiếp theo: video chưa xong đầu tiên sau bài xem gần nhất, nếu không có thì từ đầu khoá.
  const from = lastLesson ? videos.indexOf(lastLesson) : 0;
  const notDone = (v: LessonIn) => !s.progress[v.id]?.done;
  const next = resume ?? (videos.slice(from).find(notDone) || videos.find(notDone));
  const chapterVideos = next ? videos.filter((v) => v.chapter.id === next.chapter.id) : [];
  const l = next ? labFor(course.labMap, next.chapter.name, next.name) : null;
  return {
    course, tree, resume, next,
    chapterLeft: remainingSeconds(chapterVideos, s.progress),
    courseLeft: remainingSeconds(videos, s.progress),
    lab: l ? { ...l, done: !!s.labs[course.folderId + "|" + l.path]?.done } : undefined,
  };
}

/** Chuỗi ngày học liên tiếp tính tới hôm nay (hôm nay chưa học vẫn giữ chuỗi của hôm qua). */
export function streaks(byDay: Record<string, number>, minSec = 60) {
  const studied = (t: number) => (byDay[dayKey(t)] || 0) >= minSec;
  let t = startOfDay(Date.now());
  if (!studied(t)) t -= 86400_000;
  let current = 0;
  while (studied(t)) { current++; t -= 86400_000; }
  let longest = 0, run = 0, prev = 0;
  for (const k of Object.keys(byDay).filter((k) => byDay[k] >= minSec).sort()) {
    const d = new Date(k + "T00:00:00").getTime();
    run = prev && Math.round((d - prev) / 86400_000) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  return { current, longest };
}

/** Số giây học trung bình mỗi ngày trong `days` ngày gần nhất (tính cả ngày không học). */
export function pace(byDay: Record<string, number>, days = 14) {
  let sum = 0;
  const today = startOfDay(Date.now());
  for (let i = 0; i < days; i++) sum += byDay[dayKey(today - i * 86400_000)] || 0;
  return sum / days;
}

export const useStudyByDay = () => studyByDay(useStore((s) => s));

// ---- Ôn tập ----

export const NEW_PER_DAY = 10;

/** Các video đã xem xong, dạng "<labMap>:<chương>:<số video>", gom từ mọi khoá dùng lý thuyết. */
function doneVideoKeys(s: State) {
  const keys = new Set<string>();
  for (const c of s.courses) {
    if (!c.labMap) continue;
    const tree = cachedTree(c.folderId);
    if (!tree) continue;
    for (const l of allLessons(tree)) {
      if (l.kind === "video" && s.progress[l.id]?.done) {
        keys.add(`${c.labMap}:${Number(leadingNo(l.chapter.name))}:${Number(leadingNo(l.name))}`);
      }
    }
  }
  return keys;
}

/** Phần lý thuyết được "mở" khi đã xem xong ít nhất một video thuộc phần đó. */
const isUnlocked = (card: Card, done: Set<string>) => {
  for (let v = card.section.from; v <= card.section.to; v++) if (done.has(`${card.labMap}:${card.chapter}:${v}`)) return true;
  return false;
};

/** Thẻ đến hạn hôm nay: thẻ cũ đã tới ngày ôn + tối đa NEW_PER_DAY thẻ mới mỗi ngày. */
export function dueCards(cards: Card[], s: State) {
  const now = Date.now();
  const today = startOfDay(now);
  const done = doneVideoKeys(s);
  const open = cards.filter((c) => isUnlocked(c, done));
  const due = open.filter((c) => s.reviews[c.id] && s.reviews[c.id].due <= now);
  const newToday = Object.values(s.reviews).filter((r) => (r.first ?? 0) >= today).length;
  const fresh = open.filter((c) => !s.reviews[c.id]).slice(0, Math.max(0, NEW_PER_DAY - newToday));
  return { due, fresh, open: open.length, total: cards.length, newToday };
}

/** Video đầu tiên của phần lý thuyết chứa thẻ, để mở lại bài giảng. */
export function cardVideo(card: Card, s: State) {
  for (const c of s.courses) {
    if (c.labMap !== card.labMap) continue;
    const tree = cachedTree(c.folderId);
    const v = tree && findVideo(tree, card.chapter, card.section.from);
    if (v) return { courseId: c.folderId, video: v };
  }
  return null;
}

export function useCards() {
  const [cards, setCards] = useState<Card[] | null>(null);
  useEffect(() => { let alive = true; loadAllCards().then((c) => { if (alive) setCards(c); }); return () => { alive = false; }; }, []);
  return cards;
}

/** Số thẻ cần ôn hôm nay, để hiện trên thanh điều hướng. Tải lý thuyết sau vài giây để không làm chậm lúc mở app. */
export function useDueCount() {
  const [cards, setCards] = useState<Card[] | null>(null);
  useStore((s) => s.reviews); // tính lại khi chấm thẻ
  useStore((s) => s.progress);
  useEffect(() => {
    let alive = true;
    const id = setTimeout(() => loadAllCards().then((c) => { if (alive) setCards(c); }), 2500);
    return () => { alive = false; clearTimeout(id); };
  }, []);
  if (!cards) return null;
  const d = dueCards(cards, getState());
  return d.due.length + d.fresh.length;
}
