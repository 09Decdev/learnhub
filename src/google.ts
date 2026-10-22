// Đăng nhập Google (Google Identity Services) và các lệnh gọi Drive API.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
const SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly", // đọc thư mục khoá học, phát video
  "https://www.googleapis.com/auth/drive.appdata",  // lưu tiến độ + ghi chú vào vùng ẩn của app
].join(" ");
const TOKEN_KEY = "learnhub.token";
const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";

type Token = { value: string; exp: number };
type Waiter = { resolve: (t: string) => void; reject: (e: Error) => void };

declare global {
  interface Window { google?: any }
}

let tokenClient: any = null;
let token: Token | null = readSavedToken();
let waiters: Waiter[] = [];
const listeners = new Set<(signedIn: boolean) => void>();

function readSavedToken(): Token | null {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) || "null") as Token | null;
    return t && t.exp > Date.now() ? t : null;
  } catch {
    return null;
  }
}

function setToken(t: Token | null) {
  token = t;
  try {
    if (t) localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage bị chặn: vẫn chạy, chỉ phải đăng nhập lại khi tải lại trang */ }
  navigator.serviceWorker?.controller?.postMessage({ type: "token", token: t?.value ?? null });
  listeners.forEach((fn) => fn(!!t));
}

export function onAuthChange(fn: (signedIn: boolean) => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function isSignedIn() {
  return !!token && token.exp > Date.now();
}

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Không tải được thư viện đăng nhập Google"));
    document.head.append(s);
  });
}

export async function initAuth() {
  if (!CLIENT_ID) throw new Error("Thiếu VITE_GOOGLE_CLIENT_ID trong file .env.local");
  await loadGis();
  const finish = (fn: (w: Waiter) => void) => { const ws = waiters; waiters = []; ws.forEach(fn); };
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: (resp: any) => {
      if (resp.error) return finish((w) => w.reject(new Error(resp.error_description || resp.error)));
      // Trừ 60 giây để đổi token trước khi Google thật sự hết hạn.
      setToken({ value: resp.access_token, exp: Date.now() + (Number(resp.expires_in) - 60) * 1000 });
      finish((w) => w.resolve(resp.access_token));
    },
    error_callback: (err: any) =>
      finish((w) => w.reject(new Error(err?.type === "popup_closed" ? "Bạn đã đóng cửa sổ đăng nhập" : "Đăng nhập Google thất bại"))),
  });
  if (token) setToken(token); // gửi token đã lưu cho service worker
}

/** Mở cửa sổ đăng nhập Google. Gọi từ một cú click để trình duyệt không chặn popup. */
export function signIn(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!tokenClient) return reject(new Error("Đăng nhập Google chưa sẵn sàng"));
    waiters.push({ resolve, reject });
    tokenClient.requestAccessToken({ prompt: isSignedIn() ? "" : undefined });
  });
}

export function signOut() {
  if (token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(token.value, () => {});
  setToken(null);
}

export class NeedLogin extends Error {
  constructor() { super("Phiên đăng nhập Google đã hết hạn. Bấm “Đăng nhập lại” để tiếp tục."); }
}

export async function getToken(): Promise<string> {
  if (isSignedIn()) return token!.value;
  setToken(null);
  throw new NeedLogin();
}

async function api(url: string, init: RequestInit = {}): Promise<Response> {
  const t = await getToken();
  const res = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: "Bearer " + t } });
  if (res.status === 401) { setToken(null); throw new NeedLogin(); }
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).error?.message || msg; } catch { /* body không phải JSON */ }
    throw new Error(`Google Drive báo lỗi ${res.status}: ${msg}`);
  }
  return res;
}

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  videoMediaMetadata?: { durationMillis?: string };
};

export const FOLDER = "application/vnd.google-apps.folder";

export async function listChildren(folderId: string): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken = "";
  do {
    const q = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, size, videoMediaMetadata(durationMillis))",
      pageSize: "1000",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) q.set("pageToken", pageToken);
    const j = await (await api(`${DRIVE}/files?${q}`)).json();
    out.push(...j.files);
    pageToken = j.nextPageToken || "";
  } while (pageToken);
  return out.sort((a, b) => a.name.localeCompare(b.name, "vi", { numeric: true }));
}

export async function getFile(id: string): Promise<DriveFile> {
  const q = new URLSearchParams({ fields: "id, name, mimeType", supportsAllDrives: "true" });
  return (await api(`${DRIVE}/files/${id}?${q}`)).json();
}

export async function readText(id: string): Promise<string> {
  return (await api(`${DRIVE}/files/${id}?alt=media&supportsAllDrives=true`)).text();
}

// ---- Dữ liệu riêng của app trong appDataFolder (người khác không thấy được) ----

const STATE_NAME = "learnhub-state.json";
let stateFileId: string | null = null;

export async function readAppState<T>(): Promise<T | null> {
  const q = new URLSearchParams({ spaces: "appDataFolder", q: `name = '${STATE_NAME}'`, fields: "files(id)" });
  const j = await (await api(`${DRIVE}/files?${q}`)).json();
  stateFileId = j.files[0]?.id ?? null;
  if (!stateFileId) return null;
  return (await api(`${DRIVE}/files/${stateFileId}?alt=media`)).json();
}

// Trình duyệt chỉ cho request keepalive mang tối đa 64 KB.
const KEEPALIVE_LIMIT = 60_000;

/** keepalive: để lần lưu cuối vẫn đi tiếp khi tab đang đóng. */
export async function writeAppState(data: unknown, opts: { keepalive?: boolean } = {}) {
  const body = JSON.stringify(data);
  if (stateFileId) {
    await api(`${UPLOAD}/files/${stateFileId}?uploadType=media`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: !!opts.keepalive && new Blob([body]).size < KEEPALIVE_LIMIT,
    });
    return;
  }
  const boundary = "learnhub" + Math.random().toString(36).slice(2);
  const multipart =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name: STATE_NAME, parents: ["appDataFolder"] }) +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
  const res = await api(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body: multipart,
  });
  stateFileId = (await res.json()).id;
}

/** Lấy ID thư mục từ link Drive hoặc ID dán trực tiếp. */
export function parseFolderId(input: string): string | null {
  const s = input.trim();
  const m = /\/folders\/([\w-]{10,})/.exec(s) || /[?&]id=([\w-]{10,})/.exec(s);
  if (m) return m[1];
  return /^[\w-]{10,}$/.test(s) ? s : null;
}
