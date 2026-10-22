import { allLessons, cachedTree, remainingSeconds } from "../course";
import { labFor } from "../data/labMaps";
import { downloadNotes } from "../exportNotes";
import { pace, streaks } from "../plan";
import { dayKey, getState, labKey, setGoal, startOfDay, studyByDay, useStore, type Course, type State } from "../store";
import { fmtMinutes } from "../util";

const WEEKS = 26;
const DAY = 86400_000;
const fmtDate = (t: number) => new Date(t).toLocaleDateString("vi-VN", { day: "numeric", month: "numeric", year: "numeric" });
const toInput = (t: number) => dayKey(t);
const fromInput = (v: string) => new Date(v + "T23:59:59").getTime();

/** Lịch học 26 tuần gần nhất, kiểu ô vuông của GitHub. */
function Heatmap({ byDay }: { byDay: Record<string, number> }) {
  const today = startOfDay(Date.now());
  // Bắt đầu từ thứ Hai của tuần cách đây 25 tuần.
  const dow = (new Date(today).getDay() + 6) % 7;
  const first = today - (dow + (WEEKS - 1) * 7) * DAY;
  const cells = [];
  for (let t = first; t <= today; t += DAY) {
    const sec = byDay[dayKey(t)] || 0;
    const lvl = sec < 60 ? 0 : sec < 15 * 60 ? 1 : sec < 30 * 60 ? 2 : sec < 60 * 60 ? 3 : 4;
    cells.push(<span key={t} className={"cell l" + lvl} title={`${fmtDate(t)}: ${sec < 60 ? "không học" : fmtMinutes(sec)}`} />);
  }
  return (
    <div className="heatmap-wrap">
      <div className="heatmap" role="img" aria-label={`Lịch học ${WEEKS} tuần gần nhất`}>{cells}</div>
      <div className="heat-legend muted small" aria-hidden="true">
        Ít <span className="cell l0" /><span className="cell l1" /><span className="cell l2" /><span className="cell l3" /><span className="cell l4" /> Nhiều
      </div>
    </div>
  );
}

function CourseStats({ course, s, perDay }: { course: Course; s: State; perDay: number }) {
  const tree = cachedTree(course.folderId);
  if (!tree) return (
    <article className="stat-course">
      <h3>{course.name}</h3>
      <p className="muted small">Mở khoá học một lần để learnhub đọc danh sách bài.</p>
    </article>
  );
  const videos = allLessons(tree).filter((l) => l.kind === "video");
  const done = videos.filter((v) => s.progress[v.id]?.done).length;
  const left = remainingSeconds(videos, s.progress);
  const labPaths = [...new Set(videos.map((v) => labFor(course.labMap, v.chapter.name, v.name)?.path).filter(Boolean) as string[])];
  const labsDone = labPaths.filter((p) => s.labs[labKey(course.folderId, p)]?.done).length;
  const goal = s.goals[course.folderId]?.end || 0;
  const daysLeft = goal ? Math.max(1, Math.ceil((goal - Date.now()) / DAY)) : 0;
  const need = goal ? left / daysLeft : 0;
  const eta = perDay > 0 ? Date.now() + (left / perDay) * DAY : 0;

  return (
    <article className="stat-course">
      <div className="row between">
        <h3>{course.name}</h3>
        <button className="btn ghost small" onClick={() => downloadNotes(course, tree, getState())}>Xuất ghi chú .md</button>
      </div>
      <div className="stat-grid">
        <div><span className="stat-num">{done}/{videos.length}</span><span className="stat-label">video đã xem</span></div>
        {labPaths.length > 0 && <div><span className="stat-num">{labsDone}/{labPaths.length}</span><span className="stat-label">lab đã tự làm</span></div>}
        <div><span className="stat-num">{fmtMinutes(left)}</span><span className="stat-label">video còn lại</span></div>
        <div>
          <span className="stat-num">{left <= 0 ? "Xong 🎉" : eta ? fmtDate(eta) : "—"}</span>
          <span className="stat-label">{left <= 0 ? "" : eta ? "dự kiến xong, theo tốc độ 14 ngày qua" : "chưa đủ dữ liệu để dự đoán"}</span>
        </div>
      </div>

      <div className="goal row">
        <label htmlFor={"goal-" + course.folderId}>Muốn học xong trước ngày</label>
        <input
          id={"goal-" + course.folderId}
          type="date"
          value={goal ? toInput(goal) : ""}
          min={toInput(Date.now())}
          onChange={(e) => setGoal(course.folderId, e.target.value ? fromInput(e.target.value) : null)}
        />
        {!goal && (
          <button className="btn ghost small" onClick={() => setGoal(course.folderId, Date.now() + 16 * 7 * DAY)}>Đặt 16 tuần</button>
        )}
        {goal > 0 && left > 0 && (
          <span className={"small " + (perDay >= need ? "ok" : "warn")}>
            Cần khoảng {fmtMinutes(need)} video mỗi ngày · bạn đang học {fmtMinutes(perDay)}/ngày
            {perDay >= need ? " · kịp tiến độ" : " · đang chậm"}
          </span>
        )}
      </div>

      <table className="chapter-table">
        <thead><tr><th>Chương</th><th>Video</th><th>Còn lại</th></tr></thead>
        <tbody>
          {tree.chapters.map((ch) => {
            const vids = ch.lessons.filter((l) => l.kind === "video");
            if (!vids.length) return null;
            const d = vids.filter((v) => s.progress[v.id]?.done).length;
            return (
              <tr key={ch.id} className={d === vids.length ? "full" : ""}>
                <td>{ch.name}</td>
                <td><span className="meter mini"><span style={{ width: (d / vids.length) * 100 + "%" }} /></span> {d}/{vids.length}</td>
                <td>{d === vids.length ? "✓" : fmtMinutes(remainingSeconds(vids, s.progress))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </article>
  );
}

export default function Stats() {
  const s = useStore((x) => x);
  const byDay = studyByDay(s);
  const { current, longest } = streaks(byDay);
  const total = Object.values(byDay).reduce((a, b) => a + b, 0);
  const week = Array.from({ length: 7 }, (_, i) => byDay[dayKey(Date.now() - i * DAY)] || 0).reduce((a, b) => a + b, 0);
  const perDay = pace(byDay);

  return (
    <main className="page">
      <h1>Thống kê học tập</h1>
      <div className="stat-grid">
        <div><span className="stat-num">{current} 🔥</span><span className="stat-label">ngày học liên tiếp</span></div>
        <div><span className="stat-num">{longest}</span><span className="stat-label">chuỗi dài nhất</span></div>
        <div><span className="stat-num">{fmtMinutes(week)}</span><span className="stat-label">7 ngày qua</span></div>
        <div><span className="stat-num">{fmtMinutes(total)}</span><span className="stat-label">tổng thời gian học</span></div>
      </div>
      <Heatmap byDay={byDay} />
      <p className="muted small">Một ngày được tính là "có học" khi xem video ít nhất 1 phút. Thời gian tính theo đồng hồ thật, xem ở tốc độ 2× thì 10 phút video là 5 phút học.</p>
      {s.courses.map((c) => <CourseStats key={c.folderId} course={c} s={s} perDay={perDay} />)}
    </main>
  );
}
