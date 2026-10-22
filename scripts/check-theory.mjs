// Kiểm tra file lý thuyết: node scripts/check-theory.mjs 05
import { readFileSync } from "node:fs";
const nn = (process.argv[2] || "").padStart(2, "0");
const videos = JSON.parse(readFileSync(new URL("./videos.json", import.meta.url)))[nn];
const md = readFileSync(new URL(`../src/content/devops-aws/${nn}.md`, import.meta.url), "utf8");
const errors = [];
if (!md.startsWith(`# Chương ${nn} · `)) errors.push(`Dòng đầu phải là "# Chương ${nn} · ..."`);
const owner = new Map();
for (const line of md.split("\n")) {
  if (!line.startsWith("## ")) continue;
  const m = /\{(\d{3})(?:-(\d{3}))?\}\s*$/.exec(line);
  if (!m) { errors.push(`Thiếu dải video: ${line}`); continue; }
  const a = +m[1], b = +(m[2] ?? m[1]);
  if (a > b) errors.push(`Dải ngược: ${line}`);
  for (let v = a; v <= b; v++) {
    if (owner.has(v)) errors.push(`Video ${v} nằm trong 2 phần: "${owner.get(v)}" và "${line}"`);
    owner.set(v, line);
  }
}
for (const v of videos || []) if (!owner.has(v)) errors.push(`Video ${String(v).padStart(3, "0")} chưa thuộc phần nào`);
const open = (md.match(/<details>/g) || []).length, close = (md.match(/<\/details>/g) || []).length;
if (open !== close) errors.push(`<details> mở ${open} nhưng đóng ${close}`);
const fences = (md.match(/^```/gm) || []).length;
if (fences % 2) errors.push("Số dấu ``` lẻ: có code block chưa đóng");
if (!videos) errors.push(`Không có danh sách video cho chương ${nn}`);
console.log(errors.length ? errors.join("\n") : `OK chương ${nn}: ${owner.size} video, ${md.split("\n").length} dòng`);
process.exit(errors.length ? 1 : 0);
