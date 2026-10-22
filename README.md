# learnhub

Web học riêng cho các khoá học có video lưu trên Google Drive.

- Đăng nhập Google, dán link thư mục khoá học: mỗi thư mục con là một chương, mỗi video là một bài.
- Video được phát ngay trong trang, giữ nguyên file gốc (không nén lại), tua và đổi tốc độ được.
- Nhớ chính xác giây đang xem, đánh dấu đã xem xong, ghi chú theo mốc thời gian.
- Gắn từng video với thư mục lab trong repo thực hành (xem `src/data/labMaps.ts`).
- Không có máy chủ, không có database: tiến độ và ghi chú lưu trong `appDataFolder` trên Google Drive của chính người học.
- **Hôm nay học gì**: trang chủ chỉ ra bài đang xem dở, bài tiếp theo, lab đi kèm và thời gian còn lại của chương.
- **Thống kê**: lịch học 26 tuần, chuỗi ngày học liên tiếp, dự đoán ngày học xong, đặt mục tiêu (ví dụ 16 tuần).
- **Ôn tập ngắt quãng** (`#/review`): bài tập trong phần lý thuyết thành thẻ hỏi–đáp, mở sau khi xem xong video của phần đó, ôn lại sau 1, 3, 7, 14, 30 ngày.
- **Tìm kiếm** (phím `/`): tên bài, ghi chú, lý thuyết, phụ đề; gõ không dấu vẫn tìm được.
- **Checklist lab**: đánh dấu đã tự làm lab, sidebar hiện chấm đặc cho lab đã xong.
- **Đánh dấu nhanh** (phím `B`), **xuất ghi chú ra Markdown** với link mở lại đúng giây (`#/c/<khoá>/<video>?t=123`).
- **Chế độ tập trung** với hẹn giờ 25 phút, hết giờ tự dừng video.
- **Phụ đề**: file `.srt`/`.vtt` cùng tên với video được gắn tự động (phím `C`). **Cửa sổ nổi** (phím `P`).
- **Cài như app** (PWA), mở được vỏ app khi mất mạng; giao diện sáng/tối chọn tay hoặc theo máy.

## Cách hoạt động

```
Trình duyệt ──► learnhub (React, file tĩnh)
   │  <video src="/stream/<fileId>">
   ▼
Service Worker (public/sw.js) ── gắn token Google + header Range ──► Drive API (alt=media)
```

Thẻ `<video>` không tự gửi được header `Authorization`, nên service worker đứng giữa,
gắn access token và tính `Content-Range` để trình phát tua được.

## Chạy ở máy

1. Tạo OAuth Client (Web application) trong Google Cloud → Google Auth Platform.
   Thêm `http://localhost:5173` vào *Authorized JavaScript origins*, thêm email của bạn vào *Test users*.
   Scope: `drive.readonly`, `drive.appdata`.
2. `cp .env.example .env.local` rồi điền `VITE_GOOGLE_CLIENT_ID`.
3. `npm install` rồi `npm run dev`, mở http://localhost:5173

## Build cho GitHub Pages

```
BASE_PATH=/learnhub/ npm run build
```

Nhớ thêm `https://<user>.github.io` vào *Authorized JavaScript origins*.
