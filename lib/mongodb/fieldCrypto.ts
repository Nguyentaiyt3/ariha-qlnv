import crypto from "crypto";

/**
 * Mã hoá field nhạy cảm (CCCD/idNumber) ở tầng ứng dụng trước khi lưu DB — bảo vệ dữ liệu này
 * ngay cả khi ai đó có quyền đọc trực tiếp database (backup rò rỉ, truy cập trái phép vào Atlas...).
 * Dùng AES-256-GCM (authenticated encryption — vừa mã hoá vừa chống giả mạo dữ liệu).
 *
 * Áp dụng thủ công ở tầng hàm getUser/saveUser (KHÔNG dùng Mongoose schema getter/setter) vì
 * codebase dùng .lean() ở rất nhiều nơi để tăng tốc — .lean() bỏ qua hoàn toàn getter/setter của
 * Mongoose, nên mã hoá kiểu đó sẽ để lộ ciphertext ở các chỗ dùng .lean().
 */

const ENC_PREFIX = "enc:v1:";

function getKey(): Buffer {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "Thiếu biến môi trường FIELD_ENCRYPTION_KEY — cần thiết để mã hoá dữ liệu nhạy cảm (CCCD...). " +
      "Tạo bằng lệnh: openssl rand -base64 32"
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("FIELD_ENCRYPTION_KEY không hợp lệ — cần chuỗi base64 mã hoá đúng 32 byte (dùng: openssl rand -base64 32)");
  }
  return key;
}

/** Mã hoá 1 giá trị string. Trả về chuỗi dạng "enc:v1:<iv>:<authTag>:<ciphertext>" (base64). */
export function encryptField(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12); // GCM chuẩn dùng IV 12 byte
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

/**
 * Giải mã 1 giá trị đã mã hoá bởi encryptField. Nếu giá trị KHÔNG có prefix "enc:v1:" (dữ liệu cũ
 * từ trước khi bật mã hoá, hoặc migration chưa chạy), trả về nguyên văn — tương thích ngược, không
 * làm gãy dữ liệu cũ.
 */
export function decryptField(value: string): string {
  if (!value.startsWith(ENC_PREFIX)) return value;
  const key = getKey();
  const [ivB64, authTagB64, ciphertextB64] = value.slice(ENC_PREFIX.length).split(":");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(ENC_PREFIX);
}
