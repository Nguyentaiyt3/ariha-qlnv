"use client";

import { useEffect, useState } from "react";

interface UnitCatalogEntry {
  name: string;
  abbr?: string;
}

let cachedCatalog: UnitCatalogEntry[] | null = null;
let inflight: Promise<UnitCatalogEntry[]> | null = null;

async function fetchCatalog(): Promise<UnitCatalogEntry[]> {
  if (cachedCatalog) return cachedCatalog;
  if (!inflight) {
    inflight = fetch("/api/units")
      .then((r) => r.json())
      .then((d) => {
        cachedCatalog = Array.isArray(d.catalog) ? d.catalog : [];
        return cachedCatalog!;
      })
      .catch(() => {
        cachedCatalog = [];
        return cachedCatalog;
      });
  }
  return inflight;
}

/**
 * Đơn vị/phòng ban của nhân viên được lưu dưới dạng tên đầy đủ (string tự do, không phải id),
 * nên tra viết tắt phải khớp theo tên trong danh mục đơn vị (`/api/units`). Nếu không khớp
 * (đơn vị tự nhập, chưa có trong danh mục) hoặc danh mục chưa có `abbr`, trả về tên đầy đủ.
 */
export function unitAbbr(name: string | undefined | null, catalog: UnitCatalogEntry[]): string {
  if (!name) return "—";
  const match = catalog.find((u) => u.name.trim().toLowerCase() === name.trim().toLowerCase());
  return match?.abbr?.trim() || name;
}

/**
 * Trả về hàm `abbr(tênĐơnVị)` — dùng ở mọi nơi hiển thị đơn vị của nhân viên trên giao diện,
 * để hiển thị tên viết tắt thay vì tên đầy đủ. Danh mục đơn vị được cache dùng chung toàn app
 * (chỉ fetch 1 lần / phiên trang), nên gọi hook này thoải mái ở nhiều component.
 */
export function useUnitAbbr() {
  const [catalog, setCatalog] = useState<UnitCatalogEntry[]>(cachedCatalog ?? []);

  useEffect(() => {
    let alive = true;
    fetchCatalog().then((c) => {
      if (alive) setCatalog(c);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (name?: string | null) => unitAbbr(name, catalog);
}
