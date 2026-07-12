import { NextResponse } from "next/server";
import type { ZodType } from "zod";

/**
 * Parse + validate request body JSON theo schema zod. Dùng ở các route API quan trọng
 * (finance, users, clinical-trials) để chặn dữ liệu sai kiểu/thiếu field trước khi chạm DB,
 * thay vì để lỗi runtime mơ hồ hoặc âm thầm lưu dữ liệu rác.
 */
export async function parseBody<T>(
  req: Request,
  schema: ZodType<T>
): Promise<{ data: T } | { error: NextResponse }> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { error: NextResponse.json({ error: "Body JSON không hợp lệ" }, { status: 400 }) };
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    return {
      error: NextResponse.json(
        { error: "Dữ liệu không hợp lệ", details: result.error.flatten() },
        { status: 400 }
      ),
    };
  }
  return { data: result.data };
}
