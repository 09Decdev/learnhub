import { useEffect, useState } from "react";
import { readText } from "../google";

// Các file "Nên đọc.txt", "CHÚ Ý ....html" của khoá học: hiển thị ngay trong trang.
// HTML được đặt trong iframe sandbox không cho chạy script.
export default function DocView({ fileId, name }: { fileId: string; name: string }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setText(null); setError("");
    readText(fileId).then(setText).catch((e) => setError(e.message));
  }, [fileId]);

  if (error) return <p className="error" role="alert">{error}</p>;
  if (text === null) return <p className="muted pad">Đang tải tài liệu…</p>;
  if (/\.html?$/i.test(name)) {
    return <iframe className="doc-frame" sandbox="" title={name} srcDoc={`<meta charset="utf-8"><style>body{font:15px/1.6 system-ui,sans-serif;padding:16px;max-width:70ch}</style>${text}`} />;
  }
  return <pre className="doc-text">{text}</pre>;
}
