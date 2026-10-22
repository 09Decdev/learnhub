import { useEffect, useState } from "react";
import { PAUSE_EVENT } from "./Player";

// Hẹn giờ Pomodoro: 25 phút học, 5 phút nghỉ. Hết giờ học thì dừng video.
const WORK = 25 * 60;
const BREAK = 5 * 60;

export default function FocusTimer() {
  const [phase, setPhase] = useState<"idle" | "work" | "break">("idle");
  const [endAt, setEndAt] = useState(0);
  const [, tick] = useState(0);

  useEffect(() => {
    if (phase === "idle") return;
    const id = setInterval(() => {
      tick((n) => n + 1);
      if (Date.now() < endAt) return;
      if (phase === "work") {
        window.dispatchEvent(new Event(PAUSE_EVENT));
        setPhase("break");
        setEndAt(Date.now() + BREAK * 1000);
        notify("Hết 25 phút học. Nghỉ 5 phút: đứng dậy, uống nước, nhắc lại trong đầu điều vừa học.");
      } else {
        setPhase("idle");
        notify("Hết giờ nghỉ. Bấm Bắt đầu để học tiếp.");
      }
    }, 1000);
    return () => clearInterval(id);
  }, [phase, endAt]);

  const start = () => {
    // Xin quyền thông báo ngay lúc bấm (trình duyệt chặn nếu xin ngoài cú click).
    try { if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission(); } catch { /* bỏ qua */ }
    setPhase("work");
    setEndAt(Date.now() + WORK * 1000);
  };
  const left = Math.max(0, Math.round((endAt - Date.now()) / 1000));
  const mm = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;

  if (phase === "idle") return <button className="btn ghost small" onClick={start}>▶ Bắt đầu 25 phút</button>;
  return (
    <span className={"focus-timer " + phase} role="timer" aria-live="off">
      {phase === "work" ? "Học" : "Nghỉ"} {mm}
      <button className="btn ghost small" onClick={() => setPhase("idle")} aria-label="Dừng hẹn giờ">✕</button>
    </span>
  );
}

function notify(text: string) {
  try {
    if ("Notification" in window && Notification.permission === "granted") new Notification("learnhub", { body: text });
  } catch { /* trình duyệt không hỗ trợ thông báo */ }
  document.title = text.split(".")[0] + " · learnhub";
  setTimeout(() => { document.title = "learnhub"; }, 15000);
}
