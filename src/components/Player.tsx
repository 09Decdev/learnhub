import { useEffect, useRef, useState } from "react";
import { getState, saveProgress } from "../store";
import { fmtTime } from "../util";

type Props = {
  fileId: string;
  size: number; // byte, để tính bitrate thật của file gốc
  seekTo: { t: number; n: number } | null;
  onTime: (t: number) => void;
  onEnded: () => void;
};

const SPEED_KEY = "learnhub.speed";
const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

export default function Player({ fileId, size, seekTo, onTime, onEnded }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const lastSave = useRef(0);
  const [resumeFrom, setResumeFrom] = useState(0);
  const [error, setError] = useState("");
  const [info, setInfo] = useState<{ w: number; h: number; dur: number } | null>(null);
  const [rate, setRate] = useState(1);
  const src = import.meta.env.BASE_URL + "stream/" + fileId;

  const save = (done?: boolean) => {
    const v = ref.current;
    if (!v || !v.duration) return;
    saveProgress(fileId, v.currentTime, v.duration, done);
    lastSave.current = Date.now();
  };

  useEffect(() => {
    const v = ref.current;
    return () => { if (v && v.currentTime > 1) save(); }; // lưu khi chuyển bài
  }, [fileId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (seekTo && ref.current) { ref.current.currentTime = seekTo.t; void ref.current.play(); }
  }, [seekTo]);

  const skip = (d: number) => { const v = ref.current; if (v) v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + d)); };
  const setSpeed = (r: number) => { if (ref.current) ref.current.playbackRate = r; };

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
      };
      const fn = actions[e.key];
      if (fn) { e.preventDefault(); fn(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onLoaded = () => {
    const v = ref.current!;
    setInfo({ w: v.videoWidth, h: v.videoHeight, dur: v.duration });
    try { v.playbackRate = Number(localStorage.getItem(SPEED_KEY)) || 1; } catch { /* dùng tốc độ mặc định */ }
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
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          onTime(t);
          if (Date.now() - lastSave.current > 10000) save();
        }}
        onPause={() => save()}
        onEnded={() => { save(true); onEnded(); }}
        onRateChange={(e) => {
          const r = e.currentTarget.playbackRate;
          setRate(r);
          try { localStorage.setItem(SPEED_KEY, String(r)); } catch { /* bỏ qua */ }
        }}
        onError={onError}
      />
      {resumeFrom > 0 && !error && (
        <div className="resume">
          Đang xem tiếp từ {fmtTime(resumeFrom)}
          <button className="btn ghost small" onClick={() => { if (ref.current) ref.current.currentTime = 0; setResumeFrom(0); }}>Xem từ đầu</button>
          <button className="btn ghost small" aria-label="Ẩn thông báo" onClick={() => setResumeFrom(0)}>✕</button>
        </div>
      )}
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
      </div>
      {info && (
        <span className={"quality" + (info.h && info.h < 720 ? " low" : "")} title="Đây là file gốc trên Drive, không có bản nào nét hơn">
          {info.h}p · {info.w}×{info.h}{mbps ? ` · ${mbps.toFixed(1)} Mbps` : ""} · bản gốc
        </span>
      )}
    </div>
    <p className="muted small keys">Phím tắt: K hoặc Space phát/dừng · J/L tua 10 giây · ←/→ tua 5 giây · [ ] đổi tốc độ · F toàn màn hình</p>
    </div>
  );
}
