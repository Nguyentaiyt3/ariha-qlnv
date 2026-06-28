import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { verifyToken } from "@/lib/mongodb/auth";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  if (!token || !await verifyToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Dữ liệu nhập ────────────────────────────────────
  const rows: (string | number)[][] = [
    // Row 1 — headers
    ["Tên đầy đủ (*)", "Tên viết tắt", "Cấp đơn vị (*)", "Tên đơn vị cha"],
    // Row 2 — hints (italic in sheet)
    [
      "Tên đơn vị đầy đủ, bắt buộc",
      "VD: K.NTM, P.KHTH — tùy chọn",
      "2 = Khoa/Phòng/TT/Viện     3 = Đơn vị con thuộc TT/Viện",
      "Chỉ điền khi Cấp = 3. Phải khớp Tên đầy đủ của đơn vị cấp 2.",
    ],
    // Row 3+ — sample data
    ["Khoa Nội tim mạch",          "K.NTM",    2, ""],
    ["Khoa Ngoại tổng hợp",        "K.NTH",    2, ""],
    ["Trung tâm Tim mạch",         "TT.TM",    2, ""],
    ["Phòng Siêu âm tim",          "P.SAT",    3, "Trung tâm Tim mạch"],
    ["Phòng Thông tim can thiệp",  "P.TTCT",   3, "Trung tâm Tim mạch"],
    ["Phòng Kế hoạch tổng hợp",   "P.KHTH",   2, ""],
    ["Phòng Tổ chức cán bộ",      "P.TCCB",   2, ""],
    ["Phòng Tài chính kế toán",   "P.TCKT",   2, ""],
    ["Viện Y học lâm sàng",        "V.YHLS",   2, ""],
    ["Bộ môn Nội khoa",           "BM.NK",    3, "Viện Y học lâm sàng"],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Column widths
  ws["!cols"] = [
    { wch: 42 },
    { wch: 16 },
    { wch: 38 },
    { wch: 44 },
  ];

  // Freeze first 2 rows
  ws["!freeze"] = { xSplit: 0, ySplit: 2 };

  XLSX.utils.book_append_sheet(wb, ws, "Danh sách đơn vị");

  // ── Sheet 2: Hướng dẫn ───────────────────────────────────────
  const guide = XLSX.utils.aoa_to_sheet([
    ["HƯỚNG DẪN NHẬP DANH SÁCH ĐƠN VỊ"],
    [""],
    ["Cột", "Mô tả", "Bắt buộc"],
    ["A — Tên đầy đủ",    "Tên đơn vị đầy đủ, không trùng lặp",                         "Có"],
    ["B — Tên viết tắt",  "Ký hiệu ngắn để hiển thị trong bảng (VD: K.NTM)",             "Không"],
    ["C — Cấp đơn vị",    "Nhập số 2 hoặc 3. Cấp 2 = Khoa/Phòng/TT/Viện. Cấp 3 = Đơn vị con.",  "Có"],
    ["D — Tên đơn vị cha","Tên đầy đủ của đơn vị cấp 2 cha (chỉ dùng khi Cấp = 3)",    "Chỉ khi Cấp=3"],
    [""],
    ["Lưu ý:"],
    ["- Dòng 1 (tiêu đề) và dòng 2 (chú thích) sẽ bị bỏ qua khi import."],
    ["- Dữ liệu bắt đầu từ dòng 3."],
    ["- Đơn vị trùng tên (không phân biệt hoa/thường) sẽ bị bỏ qua."],
    ["- Đơn vị cấp 3 cần có đơn vị cấp 2 cha tương ứng đã tồn tại hoặc cùng được nhập trong file."],
  ]);
  guide["!cols"] = [{ wch: 22 }, { wch: 60 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, guide, "Hướng dẫn");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  // new Uint8Array(buf) copies data into a fresh ArrayBuffer → assignable to BodyInit
  const bytes = new Uint8Array(buf);

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="mau_danh_sach_don_vi.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
