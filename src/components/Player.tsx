import { useEffect, useRef, useState } from "react";
import { getState, saveProgress } from "../store";
import { fmtTime } from "../util";

type Props = {
  fileId: string;
  seekTo: { t: number; n: number } | null;
  onTime: (t: number) => void;
  onEnded: () => void;
};

const SPEED_KEY = "learnhub.speed";

export default function Player({ fileId, seekTo, onTime, onEnded }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const lastSave = useRef(0);
  const [resumeFrom, setResumeFrom] = useState(0);
  const [error, setError] = useState("");
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

  const onLoaded = () => {
    const v = ref.current!;
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

  return (
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
        onRateChange={(e) => { try { localStorage.setItem(SPEED_KEY, String(e.currentTarget.playbackRate)); } catch { /* bỏ qua */ } }}
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
  );
}
