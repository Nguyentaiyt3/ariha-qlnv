/**
 * scripts/clear-firestore.mjs
 *
 * XÓA TOÀN BỘ DỮ LIỆU FIRESTORE — KHÔNG THỂ HOÀN TÁC
 *
 * Cách chạy:
 *   1. Đặt service account key vào: scripts/serviceAccountKey.json
 *      (Tải từ Firebase Console → Project Settings → Service accounts → Generate new private key)
 *   2. npm install firebase-admin   (nếu chưa có)
 *   3. node scripts/clear-firestore.mjs
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { createInterface } from "readline";

// ── Danh sách tất cả top-level collections cần xóa ──────────────────────────
const COLLECTIONS_TO_DELETE = [
  "tasks",
  "users",
  "advanceRequests",
  "reimbursementRequests",
  "workNodes",
  "notifications",
  "channels",
  "requests",
  "documents",
  "folders",
  "announcements",
  "workflows",
  "financialConfig",
  "milestoneConfig",
  "kpiFrameworks",
  "evaluations",
  "calendarEvents",
  "emailLogs",
  "requestTemplates",
];

// ── Khởi tạo Firebase Admin ──────────────────────────────────────────────────
let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync("scripts/serviceAccountKey.json", "utf8"));
} catch {
  console.error("\n❌ Không tìm thấy scripts/serviceAccountKey.json");
  console.error("   Tải từ: Firebase Console → Project Settings → Service accounts → Generate new private key\n");
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ── Hàm xóa đệ quy (bao gồm subcollections) ─────────────────────────────────
async function deleteCollection(collectionPath, batchSize = 400) {
  const collRef = db.collection(collectionPath);
  let deleted = 0;

  while (true) {
    const snap = await collRef.limit(batchSize).get();
    if (snap.empty) break;

    // Xóa subcollections của mỗi document
    for (const docSnap of snap.docs) {
      const subCollections = await docSnap.ref.listCollections();
      for (const sub of subCollections) {
        await deleteCollection(sub.path, batchSize);
      }
    }

    // Batch delete documents
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();

    deleted += snap.size;
    process.stdout.write(`\r  ${collectionPath}: đã xóa ${deleted} documents...`);
  }

  if (deleted > 0) console.log(`\r  ✓ ${collectionPath}: xóa ${deleted} documents`);
  else console.log(`  - ${collectionPath}: trống`);
}

// ── Xác nhận trước khi xóa ───────────────────────────────────────────────────
const rl = createInterface({ input: process.stdin, output: process.stdout });

console.log("\n⚠️  CẢNH BÁO: Thao tác này sẽ XÓA VĨNH VIỄN toàn bộ dữ liệu Firestore.");
console.log(`   Project: ${serviceAccount.project_id}`);
console.log(`   Collections: ${COLLECTIONS_TO_DELETE.join(", ")}\n`);

rl.question('   Nhập "XOA TAT CA" để xác nhận: ', async (answer) => {
  rl.close();
  if (answer.trim() !== "XOA TAT CA") {
    console.log("\n✋ Đã hủy. Không có dữ liệu nào bị xóa.\n");
    process.exit(0);
  }

  console.log("\n🗑️  Bắt đầu xóa dữ liệu...\n");
  const start = Date.now();

  for (const col of COLLECTIONS_TO_DELETE) {
    await deleteCollection(col);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n✅ Hoàn tất. Đã xóa sạch dữ liệu trong ${elapsed}s.\n`);
  process.exit(0);
});
