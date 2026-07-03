/**
 * scripts/import-clinical-trials.mjs
 *
 * Nhập 41+ thử nghiệm lâm sàng từ file Excel gốc của Viện ARiHA / BV Thống Nhất
 * vào collection MongoDB "clinicalTrials". Idempotent — chạy lại sẽ upsert theo `code`.
 *
 * Nguồn dữ liệu chính: sheet "Thông tin mẫu thu tuyển các nc" (căn cột chuẩn, tin cậy).
 * Bổ sung thời gian bắt đầu/kết thúc + lý do chưa triển khai từ sheet "Dashboard"
 * (lưu ý: header của sheet Dashboard bị lệch nhãn so với dữ liệu thực — script
 * này đọc theo VỊ TRÍ cột đã xác minh thủ công, không theo nhãn header).
 *
 * Cách chạy:
 *   node scripts/import-clinical-trials.mjs "<đường dẫn file .xlsx>" [creatorUserId]
 */

import { MongoClient } from "mongodb";
import { readFileSync, existsSync } from "fs";
import XLSX from "xlsx";

// ── Load MONGODB_URI từ .env.local (không phụ thuộc dotenv) ────────────────
function loadEnvLocal() {
  if (process.env.MONGODB_URI) return;
  const path = ".env.local";
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const line of content.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadEnvLocal();

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("❌ Không tìm thấy MONGODB_URI (kiểm tra .env.local)");
  process.exit(1);
}

const xlsxPath = process.argv[2];
if (!xlsxPath || !existsSync(xlsxPath)) {
  console.error("❌ Cần truyền đường dẫn file Excel hợp lệ làm tham số đầu tiên");
  process.exit(1);
}
const creatorId = process.argv[3] || "system-import";

// ── Status mapping (khớp chính xác 10 giá trị thực tế trong sheet) ─────────
const STATUS_MAP = {
  "Đang khảo sát tính khả thi":                                      "feasibility",
  "Chờ chấp thuận của Bộ Y tế":                                       "awaiting_moh",
  "Đã họp HĐĐĐ Quốc gia nhưng chưa có quyết định phê duyệt":          "national_ethics_met",
  "Đã thông qua LEC":                                                 "lec_approved",
  "Đang chạy, chờ thu tuyển bệnh nhân":                               "running_pre_enroll",
  "Đang chạy, đã thu tuyển được bệnh nhân":                           "running_enrolled",
  "Đã kết thúc thu tuyển":                                            "running_enrolled",
  "Đã kết thúc":                                                      "completed",
  "Kết thúc do không có hiệu quả":                                    "terminated_no_efficacy",
  "Không thực hiện được do không đủ điều kiện tuyển bệnh":            "not_feasible",
};

function mapStatus(raw) {
  const s = String(raw ?? "").trim();
  return STATUS_MAP[s] ?? "feasibility";
}

function num(v) {
  if (v === "" || v === undefined || v === null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function str(v) {
  const s = String(v ?? "").trim();
  return s === "" ? undefined : s;
}

function bool(v) {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "true") return true;
  if (s === "false") return false;
  return undefined;
}

/** "3/2024-4/2031" / "N/A-2022" / "2025-" → { start, end } — dấu "-" đầu tiên luôn phân tách 2 mốc. */
function splitPeriod(raw) {
  const s = str(raw);
  if (!s) return { start: undefined, end: undefined };
  const i = s.indexOf("-");
  if (i === -1) return { start: s, end: undefined };
  return { start: str(s.slice(0, i)), end: str(s.slice(i + 1)) };
}

function generateId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

async function main() {
  const wb = XLSX.readFile(xlsxPath);

  // ── Sheet nguồn chính: "Thông tin mẫu thu tuyển các nc" ──────────────────
  const enrollSheetName = wb.SheetNames.find((n) => n.startsWith("Thông tin mẫu"));
  if (!enrollSheetName) throw new Error("Không tìm thấy sheet 'Thông tin mẫu thu tuyển các nc'");
  const enrollRows = XLSX.utils.sheet_to_json(wb.Sheets[enrollSheetName], { header: 1, defval: "" });

  // ── Sheet Dashboard: chỉ dùng để bổ sung thời gian + lý do (theo vị trí cột đã xác minh) ──
  const dashRows = XLSX.utils.sheet_to_json(wb.Sheets["Dashboard"], { header: 1, defval: "" });
  let dashHeaderIdx = -1;
  for (let i = 0; i < dashRows.length; i++) {
    if (dashRows[i].some((c) => String(c).includes("Tên nghiên cứu"))) { dashHeaderIdx = i; break; }
  }
  const dashByCode = new Map();
  if (dashHeaderIdx >= 0) {
    for (let i = dashHeaderIdx + 1; i < dashRows.length; i++) {
      const row = dashRows[i];
      const code = str(row[1]);       // col1 = mã nghiên cứu (thực tế, header ghi sai nhãn)
      if (!code) continue;
      const { start, end } = splitPeriod(row[6]);
      dashByCode.set(code, {
        startPeriod: start,
        endPeriod: end,
        statusReason: str(row[9]),    // col9 = lý do chưa triển khai (đúng vị trí)
      });
    }
  }

  // ── Build documents từ sheet enrollment (nguồn tin cậy, căn cột đúng) ────
  const now = new Date().toISOString();
  const docs = [];
  for (let i = 1; i < enrollRows.length; i++) {
    const row = enrollRows[i];
    const abbreviation = str(row[1]);
    const code = str(row[2]);
    const title = str(row[0]);
    if (!abbreviation && !title) continue; // dòng trống

    const dashExtra = dashByCode.get(code) ?? {};

    const cra = { name: str(row[10]), phone: str(row[11]), email: str(row[12]) };
    const crc = { name: str(row[14]), phone: str(row[15]), email: str(row[16]) };

    const enrollment = {
      targetTotal:           num(row[17]),
      targetSite:             num(row[18]),
      totalEnrolledAllSites:  num(row[19]),
      enrolledAtSite:         num(row[20]),
      icfSigned:              num(row[22]),
      randomized:             num(row[23]),
      screenFailed:           num(row[24]),
      discontinuedDeath:      num(row[25]),
      discontinuedDrugOnly:   num(row[26]),
      onTreatment:            num(row[27]),
      lostToFollowUp:         num(row[28]),
      completedTreatment:     num(row[29]),
      aeCount:                num(row[30]),
      saeCount:               num(row[31]),
    };
    // Loại bỏ key undefined để tránh ghi rác vào Mongo
    Object.keys(enrollment).forEach((k) => enrollment[k] === undefined && delete enrollment[k]);

    const doc = {
      _id: generateId("trial"),
      code: code ?? abbreviation ?? generateId("code"),
      title: title ?? abbreviation,
      abbreviation,
      principalInvestigatorName: str(row[3]),
      sponsor: str(row[5]),
      cro: str(row[9]),
      smo: str(row[13]),
      cra: (cra.name || cra.phone || cra.email) ? cra : undefined,
      crc: (crc.name || crc.phone || crc.email) ? crc : undefined,
      status: mapStatus(row[4]),
      statusReason: dashExtra.statusReason,
      startPeriod: dashExtra.startPeriod,
      endPeriod: dashExtra.endPeriod,
      firstEnrollmentDate: str(row[21]),
      competitiveEnrollment: bool(row[6]),
      deploymentDecisionNo: str(row[32]),
      enrollment: Object.keys(enrollment).length ? enrollment : undefined,
      documents: [],
      payments: [],
      createdBy: creatorId,
      createdByName: "Nhập liệu từ Excel",
      createdAt: now,
      updatedAt: now,
    };
    Object.keys(doc).forEach((k) => doc[k] === undefined && delete doc[k]);
    docs.push(doc);
  }

  console.log(`📋 Đã phân tích ${docs.length} thử nghiệm lâm sàng từ Excel.\n`);

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db();
  const col = db.collection("clinicalTrials");

  let created = 0, updated = 0;
  for (const doc of docs) {
    const { _id, ...fields } = doc;
    const existing = await col.findOne({ code: doc.code });
    if (existing) {
      await col.updateOne({ _id: existing._id }, { $set: { ...fields, updatedAt: now } });
      updated++;
      console.log(`  ↻ cập nhật: ${doc.abbreviation || doc.code}`);
    } else {
      await col.insertOne(doc);
      created++;
      console.log(`  + mới: ${doc.abbreviation || doc.code}`);
    }
  }

  console.log(`\n✅ Hoàn tất — tạo mới ${created}, cập nhật ${updated} (tổng ${docs.length}).`);
  await client.close();
}

main().catch((err) => {
  console.error("❌ Import thất bại:", err);
  process.exit(1);
});
