// learnhub service worker: phát video Google Drive ngay trong <video>.
//
// <video> không gửi được header Authorization, nên trang trỏ src tới
// "<base>stream/<fileId>". Service worker chặn request đó, gắn access token
// của Google rồi lấy đúng đoạn byte (Range) từ Drive API. Nhờ vậy video là
// file gốc, tua được, và trang đọc được currentTime để nhớ vị trí đang xem.

const DRIVE = "https://www.googleapis.com/drive/v3/files/";
let token = null;
const meta = new Map(); // fileId -> { size, type }

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "token") token = e.data.token;
});

// Service worker có thể bị trình duyệt tắt rồi khởi động lại, làm mất token
// trong bộ nhớ. Khi đó hỏi lại trang đang mở.
async function askToken(clientId) {
  const clients = clientId
    ? [await self.clients.get(clientId)]
    : await self.clients.matchAll({ type: "window" });
  for (const client of clients) {
    if (!client) continue;
    const t = await new Promise((resolve) => {
      const ch = new MessageChannel();
      const timer = setTimeout(() => resolve(null), 20000);
      ch.port1.onmessage = (ev) => { clearTimeout(timer); resolve(ev.data); };
      client.postMessage({ type: "need-token" }, [ch.port2]);
    });
    if (t) { token = t; return t; }
  }
  return null;
}

async function driveFetch(clientId, url, headers = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!token) await askToken(clientId);
    if (!token) return new Response("Chưa đăng nhập Google", { status: 401 });
    const res = await fetch(url, { headers: { ...headers, Authorization: "Bearer " + token } });
    if (res.status !== 401) return res;
    token = null; // token hết hạn: xin token mới rồi thử lại một lần
  }
  return new Response("Token Google không hợp lệ", { status: 401 });
}

async function stream(event, fileId) {
  let m = meta.get(fileId);
  if (!m) {
    const r = await driveFetch(event.clientId, DRIVE + fileId + "?fields=size,mimeType&supportsAllDrives=true");
    if (!r.ok) return new Response(null, { status: r.status });
    const j = await r.json();
    m = { size: Number(j.size), type: j.mimeType || "video/mp4" };
    meta.set(fileId, m);
  }

  // Tự tính Content-Range từ kích thước file, không phụ thuộc vào việc
  // Drive có cho JavaScript đọc header Content-Range qua CORS hay không.
  const range = event.request.headers.get("range");
  let start = 0;
  let end = m.size - 1;
  if (range) {
    const r = /bytes=(\d*)-(\d*)/.exec(range);
    if (r) {
      if (r[1] === "" && r[2]) start = Math.max(0, m.size - Number(r[2]));
      else {
        start = Number(r[1] || 0);
        if (r[2]) end = Math.min(Number(r[2]), m.size - 1);
      }
    }
  }
  if (start >= m.size) {
    return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + m.size } });
  }

  const res = await driveFetch(
    event.clientId,
    DRIVE + fileId + "?alt=media&supportsAllDrives=true",
    { Range: "bytes=" + start + "-" + end },
  );
  if (!res.ok) return new Response(null, { status: res.status });

  const headers = new Headers({
    "Content-Type": m.type,
    "Accept-Ranges": "bytes",
    "Content-Length": String(end - start + 1),
  });
  if (range) headers.set("Content-Range", "bytes " + start + "-" + end + "/" + m.size);
  return new Response(res.body, { status: range ? 206 : 200, headers });
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const prefix = new URL(self.registration.scope).pathname + "stream/";
  if (url.origin === self.location.origin && url.pathname.startsWith(prefix)) {
    event.respondWith(stream(event, url.pathname.slice(prefix.length)));
  }
});
