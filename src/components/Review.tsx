import { useMemo, useState } from "react";
import { html, type Card } from "../content";
import { cardVideo, dueCards, NEW_PER_DAY, useCards } from "../plan";
import { getState, gradeCard, INTERVALS, useStore } from "../store";
import { cleanName, lessonHash } from "../util";

// Ôn tập ngắt quãng: bài tập trong lý thuyết thành thẻ hỏi–đáp.
// Thẻ chỉ xuất hiện sau khi bạn đã xem video của phần đó.
export default function Review() {
  const cards = useCards();
  const reviews = useStore((s) => s.reviews);
  useStore((s) => s.progress);
  const [shown, setShown] = useState(false);
  // Giữ thứ tự hàng đợi trong một phiên ôn, không xáo lại sau mỗi lần chấm.
  const [skipped, setSkipped] = useState<string[]>([]);

  const queue = useMemo(() => {
    if (!cards) return null;
    const d = dueCards(cards, getState());
    return { ...d, list: [...d.due, ...d.fresh].filter((c) => !skipped.includes(c.id)) };
  }, [cards, reviews, skipped]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!queue) return <main className="page"><h1>Ôn tập</h1><p className="muted">Đang tải câu hỏi…</p></main>;

  const card = queue.list[0];
  const grade = (ok: boolean) => { gradeCard(card.id, ok); setShown(false); };
  const skip = () => { setSkipped((s) => [...s, card.id]); setShown(false); };

  return (
    <main className="page review">
      <div className="row between">
        <h1>Ôn tập</h1>
        <span className="muted small">
          Còn {queue.list.length} thẻ hôm nay · đã mở {queue.open}/{queue.total} thẻ
        </span>
      </div>

      {!card ? (
        <div className="empty-page">
          <p><strong>Hết thẻ cần ôn hôm nay.</strong></p>
          <p className="muted">
            {queue.open === 0
              ? "Thẻ ôn tập lấy từ bài tập trong phần Lý thuyết, và chỉ mở sau khi bạn xem xong video của phần đó. Học tiếp vài bài rồi quay lại nhé."
              : `Mỗi ngày có tối đa ${NEW_PER_DAY} thẻ mới. Thẻ đã ôn sẽ quay lại sau ${INTERVALS.join(", ")} ngày tuỳ bạn nhớ tốt tới đâu.`}
          </p>
          <a className="btn primary" href="#/">Về trang chủ</a>
        </div>
      ) : (
        <CardView key={card.id} card={card} shown={shown} onShow={() => setShown(true)} onGrade={grade} onSkip={skip} />
      )}
    </main>
  );
}

function CardView({ card, shown, onShow, onGrade, onSkip }: {
  card: Card; shown: boolean; onShow: () => void; onGrade: (ok: boolean) => void; onSkip: () => void;
}) {
  const front = useMemo(() => html(card.front), [card]);
  const back = useMemo(() => html(card.back), [card]);
  const r = getState().reviews[card.id];
  const src = cardVideo(card, getState());
  const nextBox = Math.min(r ? r.box + 1 : 1, INTERVALS.length - 1);

  return (
    <article className="flash">
      <div className="muted small">
        Chương {String(card.chapter).padStart(2, "0")} · {card.section.title}
        {r ? " · đang ôn" : " · thẻ mới"}
        {src && <> · <a href={lessonHash(src.courseId, src.video.id)}>xem lại video {cleanName(src.video.name)}</a></>}
      </div>
      <div className="md flash-front" dangerouslySetInnerHTML={{ __html: front }} />
      <p className="muted small">Tự trả lời trong đầu (hoặc ra giấy, hoặc làm luôn trên terminal) trước khi mở đáp án.</p>
      {!shown ? (
        <div className="row">
          <button className="btn primary" onClick={onShow} autoFocus>Hiện đáp án</button>
          <button className="btn ghost" onClick={onSkip}>Bỏ qua thẻ này</button>
        </div>
      ) : (
        <>
          <div className="md flash-back" dangerouslySetInnerHTML={{ __html: back }} />
          <div className="row">
            <button className="btn danger" onClick={() => onGrade(false)}>Chưa nhớ · ôn lại sau 1 ngày</button>
            <button className="btn primary" onClick={() => onGrade(true)} autoFocus>Nhớ rồi · ôn lại sau {INTERVALS[nextBox]} ngày</button>
          </div>
        </>
      )}
    </article>
  );
}
