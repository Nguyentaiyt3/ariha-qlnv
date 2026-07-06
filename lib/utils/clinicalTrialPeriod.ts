function stripDiacritics(str: string): string {
  return str.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d");
}

const ROMAN_QUARTER: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4 };
const QUARTER_START_MONTH = [-1, 0, 3, 6, 9]; // index 1-4 -> month (0-indexed); index 0 unused

/**
 * Dữ liệu startPeriod/endPeriod/firstEnrollmentDate thực tế không thống nhất định dạng — có thể là
 * "M/YYYY", "Quý N/YYYY" (số hoặc số La Mã, có/không dấu, viết tắt "Q"), "DD/MM/YYYY",
 * chỉ năm, có tiền tố "Dự kiến"/"Tháng", hoặc câu tự do có chứa ngày (vd "Đã ngừng thu tuyển ngày 23/8/2025").
 * Parser này thử lần lượt từ chặt chẽ nhất đến "cứu vãn" ngày nhúng trong câu.
 */
export function parseTrialPeriod(raw?: string): Date | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 1. Ngày đầy đủ (3 phần số) — ưu tiên DD/MM/YYYY, fallback MM/DD/YYYY nếu DD/MM không hợp lệ
  let m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const a = parseInt(m[1], 10), b = parseInt(m[2], 10), year = parseInt(m[3], 10);
    if (b >= 1 && b <= 12 && a >= 1 && a <= 31) return new Date(year, b - 1, a);
    if (a >= 1 && a <= 12 && b >= 1 && b <= 31) return new Date(year, a - 1, b);
  }

  // Chuẩn hoá + bỏ tiền tố quen thuộc cho các bước còn lại
  let s = stripDiacritics(trimmed).toLowerCase().trim();
  s = s.replace(/^du\s+kien\s+/, "");
  s = s.replace(/^thang\s+/, "");

  // 2. Định dạng quý: "Quý IV/2023", "Q4/2024", "Quý 3/2024 (ghi chú)"...
  m = s.match(/^q[a-z]*\s*([ivx]+|\d)\s*\/\s*(\d{4})/);
  if (m) {
    const qRaw = m[1];
    const quarter = /^\d+$/.test(qRaw) ? parseInt(qRaw, 10) : ROMAN_QUARTER[qRaw];
    const year = parseInt(m[2], 10);
    if (quarter >= 1 && quarter <= 4) return new Date(year, QUARTER_START_MONTH[quarter], 1);
  }

  // 3. M/YYYY
  m = s.match(/^(\d{1,2})\/(\d{4})/);
  if (m) {
    const month = parseInt(m[1], 10);
    const year = parseInt(m[2], 10);
    if (month >= 1 && month <= 12) return new Date(year, month - 1, 1);
  }

  // 4. Chỉ có năm
  m = s.match(/^(\d{4})/);
  if (m) return new Date(parseInt(m[1], 10), 0, 1);

  // 5. Cứu vãn: tìm ngày DD/MM/YYYY nhúng trong câu tự do
  m = trimmed.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const day = parseInt(m[1], 10), month = parseInt(m[2], 10), year = parseInt(m[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return new Date(year, month - 1, day);
  }

  return null;
}
