/**
 * scripts/encrypt-id-numbers.mjs
 *
 * Mã hoá các giá trị idNumber (CCCD) đang lưu dạng plaintext trong collection "users" sang
 * AES-256-GCM (khớp định dạng lib/mongodb/fieldCrypto.ts dùng trong app). Idempotent — bỏ qua
 * các bản ghi đã có prefix "enc:v1:" (đã mã hoá từ trước), chạy lại nhiều lần vẫn an toàn.
 *
 * Cách chạy:
 *   1. Đảm bảo .env.local có MONGODB_URI và FIELD_ENCRYPTION_KEY (tạo bằng: openssl rand -base64 32)
 *   2. node scripts/encrypt-id-numbers.mjs
 */

import { MongoClient } from "mongodb";
import crypto from "crypto";
import { readFileSync, existsSync } from "fs";

function loadEnvLocal() {
  if (process.env.MONGODB_URI && process.env.FIELD_ENCRYPTION_KEY) return;
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
const FIELD_ENCRYPTION_KEY = process.env.FIELD_ENCRYPTION_KEY;

if (!MONGODB_URI) {
  console.error("❌ Không tìm thấy MONGODB_URI (kiểm tra .env.local)");
  process.exit(1);
}
if (!FIELD_ENCRYPTION_KEY) {
  console.error("❌ Không tìm thấy FIELD_ENCRYPTION_KEY (kiểm tra .env.local). Tạo bằng: openssl rand -base64 32");
  process.exit(1);
}

const ENC_PREFIX = "enc:v1:";

function getKey() {
  const key = Buffer.from(FIELD_ENCRYPTION_KEY, "base64");
  if (key.length !== 32) {
    console.error("❌ FIELD_ENCRYPTION_KEY không hợp lệ — cần chuỗi base64 mã hoá đúng 32 byte");
    process.exit(1);
  }
  return key;
}

function encryptField(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

async function main() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db();
  const col = db.collection("users");

  const users = await col
    .find({ idNumber: { $type: "string", $ne: "" } })
    .project({ idNumber: 1 })
    .toArray();

  const toEncrypt = users.filter((u) => !u.idNumber.startsWith(ENC_PREFIX));

  console.log(`Tổng số user có idNumber: ${users.length}`);
  console.log(`Đã mã hoá sẵn (bỏ qua): ${users.length - toEncrypt.length}`);
  console.log(`Cần mã hoá: ${toEncrypt.length}`);

  let done = 0;
  for (const u of toEncrypt) {
    const encrypted = encryptField(u.idNumber);
    await col.updateOne({ _id: u._id }, { $set: { idNumber: encrypted } });
    done++;
  }

  console.log(`✓ Đã mã hoá xong ${done} bản ghi.`);
  await client.close();
}

main().catch((err) => {
  console.error("❌ Lỗi migrate:", err);
  process.exit(1);
});
