// Trạng thái của người học: khoá học đã thêm, tiến độ từng video, ghi chú,
// lab đã làm, lịch ôn tập, thời gian học mỗi ngày.
// Lưu bản sao ở localStorage để mở nhanh, và bản chính ở appDataFolder
// trên Google Drive để mọi máy đều thấy giống nhau.

import { useSyncExternalStore } from "react";
import { readAppState, writeAppState } from "./google";

export type Course = { folderId: string; name: string; labMap?: string; addedAt: number };
export type Progress = { pos: number; dur: number; done: boolean; at: number };
export type Note = { id: string; t: number; text: string; at: number; mark?: boolean };
export type LastSeen = { fileId: string; at: number };
export type LabDone = { done: boolean; at: number };
export type Review = { box: number; due: number; at: number; first?: number }; // first: lần chấm đầu tiên
export type Goal = { end: number; at: number };

export type State = {
  version: 1;
  courses: Course[];
  removedCourses: Record<string, number>;   // folderId -> thời điểm gỡ (để máy khác không thêm lại)
  progress: Record<string, Progress>;       // fileId -> tiến độ
  notes: Record<string, Note[]>;            // fileId -> ghi chú và đoạn đánh dấu
  deletedNotes: Record<string, number>;     // noteId -> thời điểm xoá (để đồng bộ việc xoá giữa các máy)
  last: Record<string, LastSeen>;           // courseFolderId -> video xem gần nhất
  labs: Record<string, LabDone>;            // "<courseId>|<thư mục lab>" -> đã tự làm lab
  reviews: Record<string, Review>;          // id thẻ ôn tập -> lịch ôn
  daily: Record<string, Record<string, number>>; // deviceId -> "YYYY-MM-DD" -> số giây đã học
  goals: Record<string, Goal>;              // courseFolderId -> ngày muốn học xong
};

const CACHE_KEY = "learnhub.state";
const DEVICE_KEY = "learnhub.device";
const empty = (): State => ({
  version: 1, courses: [], removedCourses: {}, progress: {}, notes: {}, deletedNotes: {}, last: {},
  labs: {}, reviews: {}, daily: {}, goals: {},
});

// Mỗi máy đếm giờ học vào ô riêng, nên gộp hai máy chỉ cần lấy số lớn hơn của từng ô.
const deviceId = (() => {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) { id = crypto.randomUUID().slice(0, 8); localStorage.setItem(DEVICE_KEY, id); }
    return id;
  } catch {
    return "nostore";
  }
})();

function readCache(): State {
  try {
    return { ...empty(), ...JSON.parse(localStorage.getItem(CACHE_KEY) || "{}") };
  } catch {
    return empty();
  }
}

let state: State = readCache();
let syncStatus: "idle" | "saving" | "saved" | "error" = "idle";
const subs = new Set<() => void>();
const emit = () => subs.forEach((fn) => fn());

export function useStore<T>(pick: (s: State) => T): T {
  return useSyncExternalStore((fn) => { subs.add(fn); return () => subs.delete(fn); }, () => pick(state));
}
export function useSyncStatus() {
  return useSyncExternalStore((fn) => { subs.add(fn); return () => subs.delete(fn); }, () => syncStatus);
}
export const getState = () => state;

/** Giữ bản có `at` mới hơn của từng khoá. */
function newer<T extends { at: number }>(a: Record<string, T>, b: Record<string, T>) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) if (!out[k] || v.at > out[k].at) out[k] = v;
  return out;
}

const maxOf = (a: Record<string, number>, b: Record<string, number>) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] ?? 0, v);
  return out;
};

// Dấu xoá ghi chú cũ hơn 180 ngày được dọn đi để file trạng thái không phình mãi.
const TOMBSTONE_TTL = 180 * 86400_000;

/** Gộp hai bản trạng thái (máy này và Drive), giữ bản mới hơn của từng mục. */
function merge(a: State, b: State): State {
  const removedCourses = maxOf(a.removedCourses, b.removedCourses);
  const courses = new Map<string, Course>();
  for (const c of [...a.courses, ...b.courses]) {
    const prev = courses.get(c.folderId);
    if (!prev || c.addedAt > prev.addedAt) courses.set(c.folderId, c);
  }
  // Khoá đã bị gỡ ở một máy thì bỏ, trừ khi được thêm lại sau lần gỡ đó.
  for (const [id, c] of courses) if ((removedCourses[id] ?? 0) >= c.addedAt) courses.delete(id);

  const cutoff = Date.now() - TOMBSTONE_TTL;
  const deletedNotes: Record<string, number> = {};
  for (const [k, v] of Object.entries(maxOf(a.deletedNotes, b.deletedNotes))) if (v > cutoff) deletedNotes[k] = v;
  const allDeleted = { ...a.deletedNotes, ...b.deletedNotes };
  const notes: Record<string, Note[]> = {};
  for (const key of new Set([...Object.keys(a.notes), ...Object.keys(b.notes)])) {
    const byId = new Map<string, Note>();
    for (const n of [...(a.notes[key] || []), ...(b.notes[key] || [])]) {
      const prev = byId.get(n.id);
      if (!prev || n.at > prev.at) byId.set(n.id, n);
    }
    const list = [...byId.values()].filter((n) => !allDeleted[n.id]).sort((x, y) => x.t - y.t);
    if (list.length) notes[key] = list;
  }

  const daily: State["daily"] = { ...a.daily };
  for (const [dev, days] of Object.entries(b.daily)) daily[dev] = maxOf(daily[dev] || {}, days);

  return {
    version: 1,
    courses: [...courses.values()],
    removedCourses,
    progress: newer(a.progress, b.progress),
    notes,
    deletedNotes,
    last: newer(a.last, b.last),
    labs: newer(a.labs, b.labs),
    reviews: newer(a.reviews, b.reviews),
    daily,
    goals: newer(a.goals, b.goals),
  };
}

let saveTimer: number | undefined;
let loaded = false;

function commit(next: State, opts: { remote?: boolean } = {}) {
  state = next;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(state)); } catch { /* bỏ qua: vẫn còn bản trên Drive */ }
  emit();
  if (opts.remote !== false && loaded) {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(pushRemote, 3000);
  }
}

async function pushRemote(opts: { keepalive?: boolean } = {}) {
  saveTimer = undefined;
  syncStatus = "saving"; emit();
  try {
    await writeAppState(state, opts);
    syncStatus = "saved";
  } catch {
    syncStatus = "error";
  }
  emit();
}

/** Tải trạng thái từ Drive và gộp với bản trên máy. Gọi sau khi đăng nhập. */
export async function loadRemote() {
  const remote = await readAppState<State>();
  loaded = true;
  const merged = remote ? merge(state, { ...empty(), ...remote }) : state;
  commit(merged, { remote: false });
  if (!remote || JSON.stringify(remote) !== JSON.stringify(merged)) await pushRemote();
  else { syncStatus = "saved"; emit(); }
}

/** Lưu ngay, ví dụ khi tab bị ẩn hoặc sắp đóng. */
export function flush() {
  if (saveTimer !== undefined && loaded) { clearTimeout(saveTimer); void pushRemote({ keepalive: true }); }
}

export function addCourse(c: Omit<Course, "addedAt">) {
  if (state.courses.some((x) => x.folderId === c.folderId)) return;
  commit({ ...state, courses: [...state.courses, { ...c, addedAt: Date.now() }] });
}

export function removeCourse(folderId: string) {
  commit({
    ...state,
    courses: state.courses.filter((c) => c.folderId !== folderId),
    removedCourses: { ...state.removedCourses, [folderId]: Date.now() },
  });
}

export function saveProgress(fileId: string, pos: number, dur: number, done?: boolean) {
  const prev = state.progress[fileId];
  const isDone = done ?? (prev?.done || (dur > 0 && pos >= dur - 15));
  commit({ ...state, progress: { ...state.progress, [fileId]: { pos, dur, done: isDone, at: Date.now() } } });
}

export function setDone(fileId: string, done: boolean) {
  const prev = state.progress[fileId] || { pos: 0, dur: 0, done: false, at: 0 };
  commit({ ...state, progress: { ...state.progress, [fileId]: { ...prev, done, at: Date.now() } } });
}

export function setLast(courseId: string, fileId: string) {
  commit({ ...state, last: { ...state.last, [courseId]: { fileId, at: Date.now() } } });
}

export function addNote(fileId: string, t: number, text: string, mark = false) {
  const note: Note = { id: crypto.randomUUID(), t, text, at: Date.now(), ...(mark ? { mark: true } : {}) };
  const list = [...(state.notes[fileId] || []), note].sort((a, b) => a.t - b.t);
  commit({ ...state, notes: { ...state.notes, [fileId]: list } });
}

export function deleteNote(fileId: string, noteId: string) {
  const list = (state.notes[fileId] || []).filter((n) => n.id !== noteId);
  const notes = { ...state.notes };
  if (list.length) notes[fileId] = list; else delete notes[fileId];
  commit({ ...state, notes, deletedNotes: { ...state.deletedNotes, [noteId]: Date.now() } });
}

export const labKey = (courseId: string, path: string) => courseId + "|" + path;

export function setLabDone(courseId: string, path: string, done: boolean) {
  commit({ ...state, labs: { ...state.labs, [labKey(courseId, path)]: { done, at: Date.now() } } });
}

// Ôn lại sau 1, 3, 7, 14 rồi 30 ngày; trả lời sai thì quay về 1 ngày.
export const INTERVALS = [1, 3, 7, 14, 30];

export function gradeCard(cardId: string, remembered: boolean) {
  const prev = state.reviews[cardId];
  const box = remembered ? Math.min(prev ? prev.box + 1 : 1, INTERVALS.length - 1) : 0;
  const due = startOfDay(Date.now()) + INTERVALS[box] * 86400_000;
  const first = prev ? prev.first ?? prev.at : Date.now();
  commit({ ...state, reviews: { ...state.reviews, [cardId]: { box, due, at: Date.now(), first } } });
}

export function setGoal(courseId: string, end: number | null) {
  // end = 0 nghĩa là đã bỏ mục tiêu (vẫn giữ `at` để đồng bộ việc bỏ giữa các máy).
  commit({ ...state, goals: { ...state.goals, [courseId]: { end: end ?? 0, at: Date.now() } } });
}

// ---- Thời gian học mỗi ngày ----

export const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function addStudy(seconds: number) {
  if (seconds < 1) return;
  const k = dayKey(Date.now());
  const mine = state.daily[deviceId] || {};
  commit({ ...state, daily: { ...state.daily, [deviceId]: { ...mine, [k]: Math.round((mine[k] || 0) + seconds) } } });
}

/** Tổng số giây học mỗi ngày, cộng mọi máy. */
export function studyByDay(s: State): Record<string, number> {
  const out: Record<string, number> = {};
  for (const days of Object.values(s.daily)) for (const [k, v] of Object.entries(days)) out[k] = (out[k] || 0) + v;
  return out;
}
