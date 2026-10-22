import { useEffect, useRef, useState } from "react";
import { addNote, addStudy, getState, saveProgress } from "../store";
import { loadSub } from "../subs";
import { fmtTime } from "../util";

type Props = {
  fileId: string;
  size: number; // byte, để tính bitrate thật của file gốc
  subs?: { id: string; name: string }[];
  startAt?: number; // mở link có ?t=: bắt đầu ở giây này thay vì chỗ đang xem dở
  seekTo: { t: number; n: number } | null;
  onTime: (t: number) => void;
  onEnded: () => void;
};

const SPEED_KEY = "learnhub.speed";
const SUBS_KEY = "learnhub.subs";
const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

/** Hẹn giờ tập trung phát sự kiện này khi hết phiên học để dừng video. */
export const PAUSE_EVENT = "learnhub:pause";

export default function Player({ fileId, size, subs, startAt, seekTo, onTime, onEnded }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const lastSave = useRef(0);
  const studied = useRef({ sec: 0, tick: 0 }); // giây học thật (đồng hồ ngoài), chưa ghi vào store
  const [resumeFrom, setResumeFrom] = useState(0);
  const [error, setError] = useState("");
  const [info, setInfo] = useState<{ w: number; h: number; dur: number } | null>(null);
  const [rate, setRate] = useState(1);
  const [toast, setToast] = useState("");
  const [tracks, setTracks] = useState<{ label: string; url: string }[]>([]);
  const [subsOn, setSubsOn] = useState(() => { try { return localStorage.getItem(SUBS_KEY) !== "off"; } catch { return true; } });
  const src = import.meta.env.BASE_URL + "stream/" + fileId;

  const save = (done?: boolean) => {
    const v = ref.current;
    if (!v || !v.duration) return;
    saveProgress(fileId, v.currentTime, v.duration, done);
    lastSave.current = Date.now();
  };

  const flushStudy = () => {
    const s = studied.current;
    if (s.sec >= 1) { addStudy(s.sec); s.sec = 0; }
  };

  useEffect(() => {
    const v = ref.current;
    return () => { if (v && v.currentTime > 1) save(); flushStudy(); }; // lưu khi chuyển bài
  }, [fileId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (seekTo && ref.current) { ref.current.currentTime = seekTo.t; void ref.current.play(); }
  }, [seekTo]);

  // Phụ đề: tải về, đổi sang VTT rồi gắn vào <track> bằng blob URL.
  useEffect(() => {
    if (!subs?.length) { setTracks([]); return; }
    let alive = true;
    const urls: string[] = [];
    Promise.all(subs.map(async (s) => {
      const url = URL.createObjectURL(new Blob([await loadSub(s.id)], { type: "text/vtt" }));
      urls.push(url);
      return { label: s.name.replace(/\.(srt|vtt)$/i, ""), url };
    }))
      .then((t) => { if (alive) setTracks(t); })
      .catch(() => { if (alive) setToast("Không tải được phụ đề"); });
    return () => { alive = false; urls.forEach(URL.revokeObjectURL); };
  }, [fileId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const tt = ref.current?.textTracks;
    if (tt) for (let i = 0; i < tt.length; i++) tt[i].mode = subsOn && i === 0 ? "showing" : "hidden";
  }, [subsOn, tracks]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    const pause = () => ref.current?.pause();
    window.addEventListener(PAUSE_EVENT, pause);
    return () => window.removeEventListener(PAUSE_EVENT, pause);
  }, []);

  const skip = (d: number) => { const v = ref.current; if (v) v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + d)); };
  const setSpeed = (r: number) => { if (ref.current) ref.current.playbackRate = r; };
  const bookmark = () => {
    const v = ref.current;
    if (!v) return;
    addNote(fileId, v.currentTime, "", true);
    setToast("Đã đánh dấu " + fmtTime(v.currentTime));
  };
  const pip = () => {
    const v = ref.current;
    if (!v || !document.pictureInPictureEnabled) return;
    if (document.pictureInPictureElement) void document.exitPictureInPicture();
    else v.requestPictureInPicture().catch(() => setToast("Trình duyệt không cho bật cửa sổ nổi"));
  };
  const toggleSubs = () => {
    setSubsOn((on) => {
      try { localStorage.setItem(SUBS_KEY, on ? "off" : "on"); } catch { /* bỏ qua */ }
      return !on;
    });
  };

  // Phím tắt giống YouTube, trừ khi đang gõ ghi chú.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable]") || e.ctrlKey || e.metaKey || e.altKey) return;
      const v = ref.current;
      if (!v) return;
      const i = SPEEDS.indexOf(v.playbackRate);
      const actions: Record<string, () => void> = {
        k: () => (v.paused ? void v.play() : v.pause()),
        " ": () => (v.paused ? void v.play() : v.pause()),
        j: () => skip(-10), l: () => skip(10),
        ArrowLeft: () => skip(-5), ArrowRight: () => skip(5),
        f: () => (document.fullscreenElement ? void document.exitFullscreen() : void v.requestFullscreen?.()),
        "[": () => setSpeed(SPEEDS[Math.max(0, (i < 0 ? 1 : i) - 1)]),
        "]": () => setSpeed(SPEEDS[Math.min(SPEEDS.length - 1, (i < 0 ? 1 : i) + 1)]),
        b: bookmark,
        p: pip,
        c: toggleSubs,
      };
      const fn = actions[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (fn) { e.preventDefault(); fn(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fileId]); // eslint-disable-line react-hooks/exhaustive-deps

  const onLoaded = () => {
    const v = ref.current!;
    setInfo({ w: v.videoWidth, h: v.videoHeight, dur: v.duration });
    try { v.playbackRate = Number(localStorage.getItem(SPEED_KEY)) || 1; } catch { /* dùng tốc độ mặc định */ }
    if (startAt !== undefined && startAt < v.duration) {
      v.currentTime = startAt;
      return;
    }
    const p = getState().progress[fileId];
    // Xem tiếp từ chỗ dừng, trừ khi đã gần hết video.
    if (p && p.pos > 5 && p.pos < v.duration - 15) {
      v.currentTime = p.pos - 3;
      setResumeFrom(p.pos);
    }
  };

  const onError = () => {
    const code = ref.current?.error?.code;
    setError(code === 4
      ? "Không phát được video này. Có thể phiên đăng nhập đã hết hạn, hoặc chủ thư mục đã tắt quyền tải xuống."
      : "Mất kết nối khi tải video. Kiểm tra mạng rồi bấm Thử lại.");
  };

  const retry = () => {
    const v = ref.current;
    if (!v) return;
    const t = v.currentTime;
    setError("");
    v.load();
    v.addEventListener("loadedmetadata", () => { v.currentTime = t; void v.play(); }, { once: true });
  };

  // Đếm thời gian học theo đồng hồ thật (xem 2× trong 5 phút vẫn là 5 phút học).
  const onTimeUpdate = (v: HTMLVideoElement) => {
    const now = performance.now();
    const s = studied.current;
    const gap = (now - s.tick) / 1000;
    if (!v.paused && s.tick && gap > 0 && gap < 3) s.sec += gap;
    s.tick = now;
    if (s.sec >= 30) flushStudy();
    onTime(v.currentTime);
    if (Date.now() - lastSave.current > 10000) save();
  };

  const mbps = info && size && info.dur ? (size * 8) / info.dur / 1e6 : 0;

  return (
    <div className="player-wrap">
    <div className="player">
      <video
        ref={ref}
        src={src}
        controls
        autoPlay
        preload="metadata"
        playsInline
        onLoadedMetadata={onLoaded}
        onTimeUpdate={(e) => onTimeUpdate(e.currentTarget)}
        onPlay={() => { studied.current.tick = performance.now(); }}
        onPause={() => { save(); flushStudy(); studied.current.tick = 0; }}
        onEnded={() => { save(true); flushStudy(); onEnded(); }}
        onRateChange={(e) => {
          const r = e.currentTarget.playbackRate;
          setRate(r);
          try { localStorage.setItem(SPEED_KEY, String(r)); } catch { /* bỏ qua */ }
        }}
        onError={onError}
      >
        {tracks.map((t, i) => <track key={t.url} kind="subtitles" label={t.label} src={t.url} srcLang="vi" default={i === 0 && subsOn} />)}
      </video>
      {resumeFrom > 0 && !error && (
        <div className="resume">
          Đang xem tiếp từ {fmtTime(resumeFrom)}
          <button className="btn ghost small" onClick={() => { if (ref.current) ref.current.currentTime = 0; setResumeFrom(0); }}>Xem từ đầu</button>
          <button className="btn ghost small" aria-label="Ẩn thông báo" onClick={() => setResumeFrom(0)}>✕</button>
        </div>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
      {error && (
        <div className="player-error" role="alert">
          <p>{error}</p>
          <button className="btn primary small" onClick={retry}>Thử lại</button>
        </div>
      )}
    </div>
    <div className="player-bar">
      <div className="row">
        <button className="btn ghost small" onClick={() => skip(-10)} title="Phím J">−10s</button>
        <button className="btn ghost small" onClick={() => skip(10)} title="Phím L">+10s</button>
        <div className="seg" role="group" aria-label="Tốc độ phát">
          {SPEEDS.map((r) => (
            <button key={r} className={rate === r ? "on" : ""} onClick={() => setSpeed(r)}>{r}×</button>
          ))}
        </div>
        <button className="btn ghost small" onClick={bookmark} title="Phím B">🔖 Đánh dấu</button>
        {document.pictureInPictureEnabled && <button className="btn ghost small" onClick={pip} title="Phím P">Cửa sổ nổi</button>}
        {tracks.length > 0 && (
          <button className={"btn small " + (subsOn ? "primary" : "ghost")} onClick={toggleSubs} title="Phím C" aria-pressed={subsOn}>Phụ đề</button>
        )}
      </div>
      {info && (
        <span className={"quality" + (info.h && info.h < 720 ? " low" : "")} title="Đây là file gốc trên Drive, không có bản nào nét hơn">
          {info.h}p · {info.w}×{info.h}{mbps ? ` · ${mbps.toFixed(1)} Mbps` : ""} · bản gốc
        </span>
      )}
    </div>
    <p className="muted small keys">Phím tắt: K hoặc Space phát/dừng · J/L tua 10 giây · ←/→ tua 5 giây · [ ] đổi tốc độ · B đánh dấu · P cửa sổ nổi · C phụ đề · F toàn màn hình</p>
    </div>
  );
}
