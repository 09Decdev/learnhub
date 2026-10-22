// Trạng thái của người học: khoá học đã thêm, tiến độ từng video, ghi chú.
// Lưu bản sao ở localStorage để mở nhanh, và bản chính ở appDataFolder
// trên Google Drive để mọi máy đều thấy giống nhau.

import { useSyncExternalStore } from "react";
import { readAppState, writeAppState } from "./google";

export type Course = { folderId: string; name: string; labMap?: string; addedAt: number };
export type Progress = { pos: number; dur: number; done: boolean; at: number };
export type Note = { id: string; t: number; text: string; at: number };
export type LastSeen = { fileId: string; at: number };

export type State = {
  version: 1;
  courses: Course[];
  progress: Record<string, Progress>;      // fileId -> tiến độ
  notes: Record<string, Note[]>;          // fileId -> ghi chú
  deletedNotes: Record<string, number>;   // noteId -> thời điểm xoá (để đồng bộ việc xoá giữa các máy)
  last: Record<string, LastSeen>;         // courseFolderId -> video xem gần nhất
};

const CACHE_KEY = "learnhub.state";
const empty = (): State => ({ version: 1, courses: [], progress: {}, notes: {}, deletedNotes: {}, last: {} });

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

/** Gộp hai bản trạng thái (máy này và Drive), giữ bản mới hơn của từng mục. */
function merge(a: State, b: State): State {
  const courses = new Map<string, Course>();
  for (const c of [...a.courses, ...b.courses]) if (!courses.has(c.folderId)) courses.set(c.folderId, c);

  const progress = { ...a.progress };
  for (const [k, v] of Object.entries(b.progress)) if (!progress[k] || v.at > progress[k].at) progress[k] = v;

  const last = { ...a.last };
  for (const [k, v] of Object.entries(b.last)) if (!last[k] || v.at > last[k].at) last[k] = v;

  const deletedNotes = { ...a.deletedNotes, ...b.deletedNotes };
  const notes: Record<string, Note[]> = {};
  for (const key of new Set([...Object.keys(a.notes), ...Object.keys(b.notes)])) {
    const byId = new Map<string, Note>();
    for (const n of [...(a.notes[key] || []), ...(b.notes[key] || [])]) {
      const prev = byId.get(n.id);
      if (!prev || n.at > prev.at) byId.set(n.id, n);
    }
    const list = [...byId.values()].filter((n) => !deletedNotes[n.id]).sort((x, y) => x.t - y.t);
    if (list.length) notes[key] = list;
  }
  return { version: 1, courses: [...courses.values()], progress, notes, deletedNotes, last };
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

async function pushRemote() {
  syncStatus = "saving"; emit();
  try {
    await writeAppState(state);
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

/** Lưu ngay (ví dụ trước khi đóng tab). */
export function flush() {
  if (saveTimer !== undefined && loaded) { clearTimeout(saveTimer); saveTimer = undefined; void pushRemote(); }
}

export function addCourse(c: Omit<Course, "addedAt">) {
  if (state.courses.some((x) => x.folderId === c.folderId)) return;
  commit({ ...state, courses: [...state.courses, { ...c, addedAt: Date.now() }] });
}

export function removeCourse(folderId: string) {
  commit({ ...state, courses: state.courses.filter((c) => c.folderId !== folderId) });
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

export function addNote(fileId: string, t: number, text: string) {
  const note: Note = { id: crypto.randomUUID(), t, text, at: Date.now() };
  const list = [...(state.notes[fileId] || []), note].sort((a, b) => a.t - b.t);
  commit({ ...state, notes: { ...state.notes, [fileId]: list } });
}

export function deleteNote(fileId: string, noteId: string) {
  const list = (state.notes[fileId] || []).filter((n) => n.id !== noteId);
  const notes = { ...state.notes };
  if (list.length) notes[fileId] = list; else delete notes[fileId];
  commit({ ...state, notes, deletedNotes: { ...state.deletedNotes, [noteId]: Date.now() } });
}
