# ⚓ Hải Chiến Tọa Độ

Game lớp học môn Toán để giáo viên chiếu lên màn hình: trả lời đúng câu hỏi để được **nã pháo vào các điểm có tọa độ nguyên trên mặt phẳng Oxy**, tìm và đánh chìm hạm đội đang ẩn nấp.
Chạy hoàn toàn trên trình duyệt — không cần tài khoản, không cần cơ sở dữ liệu, không cần Internet khi mở bằng file.

## Cách chơi

- **Cả lớp:** cả lớp cùng săn "hạm đội bí ẩn". Trả lời sai thì hạm đội địch phản công, tàu mẹ mất 1 giáp.
- **2 đội đối kháng:** mỗi đội có vùng biển riêng, lần lượt trả lời và bắn vào vùng biển đối thủ. Trả lời sai thì đội kia được **cướp lượt**; cướp sai thì đối thủ được bắn 1 phát.
- Trả lời đúng được bắn (mặc định 2 phát). Học sinh **đọc tọa độ** điểm muốn bắn, ví dụ $(2; -3)$, giáo viên bấm vào điểm đó hoặc gõ tọa độ.
- Tàu nằm trên các điểm nguyên, theo hàng ngang hoặc dọc, không chạm nhau. Bắn trúng được thêm 1 phát.
- **Radar:** soi vùng 3×3 để biết có bao nhiêu ô tàu (không mất phát bắn).
- Bản đồ chọn được: x, y từ −3…3, −4…4 hoặc −5…5.

## Câu hỏi

- 3 dạng theo cấu trúc đề 2025: trắc nghiệm A–D, Đúng/Sai (mỗi ý a, b, c, d là một lượt), trả lời ngắn (giáo viên xem đáp án rồi chấm).
- Công thức Toán hiển thị bằng KaTeX (`$...$`, `$$...$$`).
- **Nhập đề từ file Word (.docx):** công thức MathType / Equation 3.0 / công thức Word được chuyển sang LaTeX ngay trên máy; đáp án đúng nhận từ chữ **gạch chân** hoặc **tô đỏ**; giữ lời giải và hình ảnh.

## Cách dùng nhanh

1. Mở `index.html` bằng Chrome hoặc Edge.
2. Bấm **✎ Câu hỏi** → **📄 Nhập file Word (.docx)** hoặc tự gõ câu hỏi → **Lưu**.
3. Chọn **Cả lớp / 2 đội** và kích thước bản đồ → **Ra khơi!** Nhấn `F` để chiếu toàn màn hình.

Phím tắt: `A`–`D` hoặc `1`–`4` trả lời · Đúng/Sai: `1`/`2` · Trả lời ngắn: `Enter` xem đáp án, `1` đúng, `2` sai ·
ngắm bắn: bấm vào điểm hoặc `←↑→↓` rồi `Enter` · `R` radar · `Space` tiếp tục · `M` tắt tiếng.

> Câu hỏi, ảnh và cài đặt được lưu **trong trình duyệt của máy đang dùng** (localStorage + IndexedDB), không gửi lên máy chủ nào.

## Cấu trúc thư mục

```
index.html              # game (giao diện + luật chơi)
favicon.svg
lib/qbank.js            # ngân hàng câu hỏi, khung soạn đề, âm thanh, hiệu ứng
lib/mtef2tex.js         # đọc công thức MathType / Equation 3.0 -> LaTeX
lib/docx-import.js      # đọc đề Word (.docx)
lib/jszip.min.js        # giải nén .docx
lib/cfb.min.js          # đọc đối tượng OLE (MathType) trong .docx
katex/                  # KaTeX + phông chữ (chạy offline)
licenses/               # giấy phép các thư viện
vercel.json             # cấu hình Vercel
```

Không có bước build — đây là trang web tĩnh.

## Đưa lên GitHub

**GitHub Desktop:** File → Add local repository → chọn thư mục này → *create a repository* → đặt tên `hai-chien-toa-do` → Commit → **Publish repository**.

**Dòng lệnh** (tạo trước repo trống `hai-chien-toa-do` trên github.com, thay `TEN-TAI-KHOAN`):

```powershell
git init
git add .
git commit -m "Hải Chiến Tọa Độ - bản đầu tiên"
git branch -M main
git remote add origin https://github.com/TEN-TAI-KHOAN/hai-chien-toa-do.git
git push -u origin main
```

`.gitignore` đã chặn các file `.docx`, `.pdf`, `.xlsx` để đề thi không vô tình bị đưa lên GitHub công khai.

## Deploy lên Vercel

1. [vercel.com](https://vercel.com) → **Add New… → Project** → chọn repo `hai-chien-toa-do` → **Import**.
2. **Framework Preset:** `Other` · **Build Command / Output Directory / Install Command:** để trống.
3. **Deploy** → được địa chỉ dạng `https://hai-chien-toa-do.vercel.app`. Mỗi lần `git push` lên `main`, Vercel tự cập nhật.

## Ghi chú

- File `.doc` (Word 97–2003) chưa đọc được: mở bằng Word rồi *Lưu thành* `.docx`.
- Hình vẽ dạng WMF/EMF (không phải công thức) không hiển thị được trên trình duyệt và sẽ bị bỏ qua khi nhập.
- Thông tin thư viện bên thứ ba: xem `THIRD_PARTY_NOTICES.md`.
