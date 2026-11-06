# enterprise-admin-ui

[English](README.md) · **Tiếng Việt** · [简体中文](README.zh-CN.md)

**UI chuẩn doanh nghiệp cho các ứng dụng nằm sau màn hình đăng nhập.** Agent Skill này dạy các AI coding agent (Claude Code, Codex, Cursor, Antigravity, Copilot và các agent khác) xây màn hình quản lý theo cách phần mềm doanh nghiệp lâu năm vẫn làm: bảng dày thông tin nhưng dễ đọc; đủ mọi trạng thái; lưu không bao giờ làm mất dữ liệu đang nhập; và không còn kiểu "template AI".

![Cùng một prompt do Codex CLI và Claude Code dựng, không có và có skill, kèm điểm audit và checklist](docs/img/demo.gif)

![Giấy phép: MIT](https://img.shields.io/badge/license-MIT-blue) ![Tài liệu tham khảo: 17](https://img.shields.io/badge/references-17-blue) ![Quy tắc audit: 22](https://img.shields.io/badge/audit%20rules-22-blue) ![Phiên bản 0.5.8](https://img.shields.io/badge/version-0.5.8-blue)

## Cài đặt

```bash
npx skills add vietIT2002/enterprise-admin-ui
```

CLI `skills` tự phát hiện các agent có trên máy và cài skill vào đúng thư mục. Trên Windows, thêm `--copy` để CLI chép file thay vì tạo symlink.

<details>
<summary><b>Cài thủ công (mọi agent)</b></summary>

Chép thư mục `skills/enterprise-admin-ui` vào thư mục trong dự án hoặc thư mục người dùng của bạn. Hãy chép thay vì tạo symlink, vì symlink không ổn định trên Windows.

| Agent | Thư mục trong dự án | Thư mục người dùng |
|---|---|---|
| Claude Code | `.claude/skills/` | `~/.claude/skills/` |
| Codex | `.agents/skills/` | `~/.agents/skills/` |
| Cursor | `.agents/skills/` hoặc `.cursor/skills/` | `~/.agents/skills/` hoặc `~/.cursor/skills/` |
| GitHub Copilot | `.github/skills/` hoặc `.agents/skills/` | `~/.copilot/skills/` |
| Antigravity | `.agents/skills/` | `~/.gemini/config/skills/` |
| Kiro | `.kiro/skills/` | `~/.kiro/skills/` |

</details>

<details>
<summary><b>Plugin và các trình cài đặt khác</b></summary>

Plugin marketplace của Claude Code:

```text
/plugin marketplace add vietIT2002/enterprise-admin-ui
/plugin install enterprise-admin-ui@enterprise-admin-ui
```

GitHub CLI 2.90 trở lên (`gh skill` đang ở bản public preview). Mặc định lệnh này cài cho GitHub Copilot; với các agent khác, thêm `--agent claude-code`, `--agent cursor`, v.v.:

```bash
gh skill install vietIT2002/enterprise-admin-ui enterprise-admin-ui
```

Kiro: import từ GitHub bằng URL của thư mục skill `https://github.com/vietIT2002/enterprise-admin-ui/tree/main/skills/enterprise-admin-ui`.

Chưa được kiểm thử trọn vẹn từ đầu đến cuối (các manifest được viết theo định dạng đã công bố):

```bash
agy plugin install https://github.com/vietIT2002/enterprise-admin-ui
codex plugin marketplace add vietIT2002/enterprise-admin-ui
```

</details>

<details>
<summary><b>Quy tắc luôn bật (AGENTS.md, Cursor, Copilot)</b></summary>

Skill chỉ được nạp khi agent thấy cần dùng. Để các quy tắc cốt lõi có mặt trong mọi phiên làm việc, dán một snippet đã tạo sẵn vào dự án:

| File | Dán vào |
|---|---|
| [`adapters/AGENTS.snippet.md`](adapters/AGENTS.snippet.md) | `AGENTS.md` hoặc `CLAUDE.md` |
| [`adapters/cursor/enterprise-admin-ui.mdc`](adapters/cursor/enterprise-admin-ui.mdc) | `.cursor/rules/` (file này dùng `alwaysApply: true`) |
| [`adapters/copilot-instructions.snippet.md`](adapters/copilot-instructions.snippet.md) | `.github/copilot-instructions.md` |

</details>

Để dùng, chỉ cần yêu cầu một màn hình quản lý ("làm trang đơn hàng cho ERP của chúng tôi"), hoặc bảo agent dùng skill enterprise-admin-ui. Trong Claude Code, bạn cũng có thể gõ `/enterprise-admin-ui`, hoặc `/enterprise-admin-ui:enterprise-admin-ui` nếu skill được cài dưới dạng plugin.

## Phạm vi

Skill dành cho các màn hình nằm sau màn hình đăng nhập:
- trang quản trị và công cụ back-office;
- back-office ERP, CRM, HRM, kế toán, kho và POS;
- công cụ nội bộ và màn hình ứng dụng B2B SaaS.

Skill không dành cho landing page hay website marketing. Với những trang đó, hãy dùng một skill về thẩm mỹ như `frontend-design`.

Nếu dự án đã có design system hoặc thư viện component tùy biến, skill giữ nguyên component và token của bạn, chỉ áp dụng các quy tắc về bố cục, trạng thái và hành vi.

## Bên trong có gì

```
skills/enterprise-admin-ui/
├─ SKILL.md            248 dòng: quy trình, công thức trang, trạng thái, lưu, bảng, nền tảng, Review mode
├─ references/         17 file, chỉ nạp khi tác vụ cần
├─ scripts/audit.js    audit chạy trên trình duyệt, không cần thư viện ngoài, 22 quy tắc, điểm 0–100
└─ assets/
   ├─ tokens.css           token tương thích shadcn, sáng và tối, Tailwind v4 @theme
   └─ DESIGN.template.md   file ghi quyết định riêng của từng dự án (định dạng design.md của Google)
```

**Công thức trang:** danh sách, chi tiết bản ghi, form tạo/sửa, dashboard, cài đặt, wizard và nhập CSV, cùng với vai trò, phân quyền và phê duyệt. Mỗi công thức nêu màn hình gồm những gì, và theo thứ tự nào.

**Tài liệu tham khảo:**

| File | Nội dung |
|---|---|
| `tables.md` | mật độ, căn lề, sắp xếp, chọn hàng, phân trang, sửa trực tiếp trên bảng |
| `filters-search.md` | thanh bộ lọc, chip, view đã lưu, tìm kiếm, trạng thái trên URL |
| `forms.md` | bố cục, kiểm tra dữ liệu, cách lưu, dòng hàng, thay đổi chưa lưu |
| `feedback-states.md` | trạng thái trống, đang tải và lỗi, khi nào dùng toast hay banner, xác nhận, tác vụ chạy lâu |
| `permissions-audit.md` | vai trò, phê duyệt, lịch sử thay đổi, bộ từ vựng trạng thái |
| `navigation-layout.md` | khung ứng dụng, sidebar, header trang, breadcrumb, điều hướng trang cài đặt |
| `dashboards-charts.md` | dashboard vận hành, ô KPI, chọn loại biểu đồ |
| `tokens.md` | áp dụng token trong shadcn, Tailwind v3/v4 hoặc CSS thuần |
| `data-formatting.md` | số, tiền, ngày, múi giờ, giá trị trống, bộ quy ước vi-VN |
| `bulk-import-export.md` | chọn tất cả bản ghi khớp bộ lọc, lỗi một phần, nhập CSV, xuất dữ liệu |
| `accessibility.md` | checklist WCAG 2.2 AA cho màn hình quản trị |
| `anti-patterns.md` | 23 dấu hiệu "template AI", mỗi dấu hiệu kèm cách sửa và cách phát hiện |
| `react-shadcn.md` | TanStack Table, react-hook-form + zod, trạng thái trên URL, shadcn Sidebar |
| `reports-print.md` | báo cáo (kỳ, so sánh, tổng, xuất file) và chứng từ in (hoá đơn, phiếu lương) |
| `calendars.md` | lịch nghỉ phép, lịch ca, đặt lịch: ngày đầu tuần, thanh nhiều ngày, số người nghỉ, bàn phím |
| `boards.md` | bảng Kanban: cột và giới hạn, chuyển thẻ không cần kéo thả, chi tiết ở bảng bên |
| `trees.md` | cây và màn hình chia đôi: hệ thống tài khoản, sơ đồ tổ chức, danh mục |

**Review mode.** Yêu cầu agent "review màn hình này". Agent báo các vấn đề theo dạng `path:line — rule — fix`, nhóm theo cấp (`data`, `states`, `a11y`, `layout`, `tells`), và chỉ sửa code khi bạn yêu cầu.

**Audit.** Khi có trình duyệt, chèn `scripts/audit.js` vào trang và chạy `enterpriseAdminAudit({ pageType: 'list' })`. Script đo:
- cỡ chữ và thang cỡ chữ;
- độ bo góc;
- chiều cao hàng và hàng bị dồn thành nhiều dòng;
- căn lề cột số và chữ số đều độ rộng (tabular figures);
- bảng bị đẩy xuống dưới màn hình đầu tiên trên trang danh sách;
- tên của control và kích thước vùng bấm;
- độ tương phản của chữ;
- gradient, hiệu ứng kính và bóng đổ của card;
- nhãn VIẾT HOA TOÀN BỘ;
- icon emoji;
- số thao tác chính trong mỗi header;
- phần tử lẽ ra bị ẩn nhưng vẫn hiện vì class `flex` hoặc `grid`;
- thanh thao tác hoặc tiêu đề bảng `sticky` không bao giờ dính, vì khung `overflow` bọc ngoài dài ra theo nội dung thay vì tự cuộn;
- nhãn form nằm cạnh ô nhập thay vì ở trên, và ô email hoặc điện thoại thiếu `type="email"` hoặc `type="tel"`;
- email và số điện thoại hiển thị dạng chữ thường thay vì link `mailto:` và `tel:`.

## Kết quả

**Cách đo:**
- **Phiên bản:** đo ngày 2026-11-04 với v0.1.0 (8 file tham khảo). Các thay đổi của v0.5.0 được kiểm tra lại trên 3 trang mới (điểm audit trung vị 100, checklist 22/22) và trên 9 trang của vòng sửa lỗi, chứ không chạy lại toàn bộ bộ thử nghiệm.
- **Tạo trang:** cùng một model (Claude Sonnet 5.5) dựng cùng các màn hình từ cùng các đề bài, bằng tiếng Anh và tiếng Việt, một lần theo cách bình thường và một lần được yêu cầu đọc `SKILL.md` trước. Kết quả là HTML một file dùng Tailwind CDN.
- **Chấm điểm:**
  - các trang được chấm bằng audit của chính skill (`scripts/audit.js`) và một checklist nghiệm thu;
  - mỗi trang do một agent review đánh giá, và agent này biết trang thuộc nhóm nào. Một lượt chấm mù lại 12 trang khớp 97% số mục và cho cùng mức chênh lệch;
  - các lượt review checklist áp dụng cho lượt chạy 1–2 của mỗi đề bài.
- **Dữ liệu:** toàn bộ trang đã sinh, ảnh chụp, kết quả audit và review, cùng đề bài, prompt và công cụ, nằm ở [enterprise-admin-ui-benchmark](https://github.com/vietIT2002/enterprise-admin-ui-benchmark). Xem các trang đặt cạnh nhau trong [gallery](https://vietit2002.github.io/enterprise-admin-ui-benchmark/).

| | Không có skill | Có skill |
|---|---|---|
| Điểm trung vị trên audit của chính skill (mỗi bên 40 trang) | 82 | **100** |
| Trang có chữ tương phản thấp | 68% | **0%** |
| Trang có nhãn VIẾT HOA TOÀN BỘ | 73% | **0%** |
| Checklist nghiệm thu, 3 màn hình không dùng khi viết skill (mỗi bên 6 trang) | 35% | **72%** |
| Checklist nghiệm thu, thêm 3 màn hình mới, với v0.5.2 (mỗi bên 6 trang)† | 39% | **89%** |
| Checklist nghiệm thu, 8 màn hình chính (mỗi bên 16 lượt review)\* | 56% | 100% |

\* Các công thức trang của skill được viết từ chính những lỗi trên 8 màn hình này, nên dòng này cho kết quả cao hơn thực tế trên màn hình mới. Các dòng màn hình mới là con số công bằng hơn.

† Các màn hình này được viết sau khi có quy tắc v0.5.2. 4 trong 27 mục checklist kiểm tra trực tiếp các quy tắc đó (5/8 → 8/8); 23 mục còn lại tăng từ 35% lên 87%.

![Dashboard vận hành không có và có skill](docs/img/before-after-07-ops-dashboard.png)

![Form hóa đơn không có và có skill](docs/img/before-after-03-invoice-form.png)

**Tự kích hoạt** (Claude Code, Sonnet 5.5, 2026-11-05): khi không được gọi tên, skill tự nạp ở 20/20 prompt màn hình quản lý (10 EN, 10 VI) và 0/10 prompt landing page.

**Môi trường khác** (2026-11-05, cùng 3 màn hình mới, mỗi bên 1 trang mỗi màn hình):
- Codex CLI (`gpt-6.1-sol`): checklist 33% → **96%**, điểm audit trung vị 62 → **100**.
- Ứng dụng Next.js 16 + shadcn/ui (Sonnet 5.5): checklist 44% → **93%**.

**Chưa đo:** Cursor và Copilot, và việc skill có tự nạp ở các agent ngoài Claude Code hay không.

## So sánh với các skill khác

Dựa trên repository của từng skill, tính đến ngày 2026-11-04.

| Skill | Trọng tâm | Quy trình cho màn hình quản lý |
|---|---|---|
| `anthropics/skills` · `frontend-design` | Thẩm mỹ khác biệt, "chấp nhận rủi ro thẩm mỹ" | Không phải mục tiêu của nó |
| `nextlevelbuilder/ui-ux-pro-max` | Danh mục phong cách và loại sản phẩm | Ít (một dòng về thao tác hàng loạt) |
| `Leonxlnx/taste-skill` | Định hướng nghệ thuật, màn hình ứng dụng, một bảng "dấu hiệu" (tells) | Một phần |
| `pbakaus/impeccable` | Bộ dò lỗi thiết kế (62 quy tắc), chế độ "Operate" cho màn hình ứng dụng | Một phần (thiếu audit log và phân trang) |
| **enterprise-admin-ui** | Màn hình nghiệp vụ, cố ý không hào nhoáng | Danh sách, bộ lọc, thao tác hàng loạt, form có dòng hàng, phân quyền, lịch sử thay đổi, phê duyệt, nhập dữ liệu, định dạng theo locale, đủ mọi trạng thái |

Các skill này dùng kết hợp được với nhau. Dùng một skill thẩm mỹ cho website marketing và skill này cho ứng dụng sau màn hình đăng nhập.

## Câu hỏi thường gặp

**Skill có xung đột với design system của tôi không?** Không. Design system hoặc thư viện component tùy biến của dự án luôn được ưu tiên; khi đó skill chỉ áp dụng các quy tắc về bố cục, trạng thái và hành vi. File `DESIGN.md` trong dự án ghi lại màu nhấn, mật độ và bộ từ vựng trạng thái của bạn, và skill đọc file này trước tiên.

**Skill tốn bao nhiêu token?** `SKILL.md` dài 248 dòng (khoảng 20 KB, tầm 5k token). Các file tham khảo chỉ được nạp khi tác vụ cần, ví dụ `tables.md` khi làm bảng.

**Skill có hỗ trợ tiếng Việt và các locale khác không?** Có. Việc định dạng đi qua `Intl` với locale của dự án. `data-formatting.md` có sẵn bộ quy ước vi-VN:
- `1.250.000 ₫`;
- `dd/MM/yyyy HH:mm`;
- `Asia/Ho_Chi_Minh`;
- tìm kiếm không phân biệt dấu.

**Cập nhật thế nào?** Tùy vào cách bạn đã cài:
- `npx skills add`: chạy lại lệnh này.
- `gh skill`: chạy `gh skill update`.
- Plugin: skill được cập nhật khi phiên bản plugin thay đổi.
- Chép thủ công: chép lại thư mục.

Xem [CHANGELOG.md](CHANGELOG.md).

**Không dùng React thì có được không?** Được. Các quy tắc không phụ thuộc stack, còn ví dụ dùng React, Tailwind và shadcn/ui. HTML một file dùng Tailwind CDN cũng được hỗ trợ.

## Giấy phép

[MIT](LICENSE)
