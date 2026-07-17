"use client";

import { useEffect, useState } from "react";
import { getNckhReviewCriteria } from "@/lib/firebase/firestore";
import { DEFAULT_NCKH_REVIEW_CRITERIA } from "@/lib/research";
import type { NckhReviewCriteriaConfig } from "@/types";

/**
 * Bộ tiêu chí chấm điểm phản biện NCKH (GĐ1/GĐ2) — Admin cấu hình được ở Cài đặt hệ thống. Trả về
 * mặc định (DEFAULT_NCKH_REVIEW_CRITERIA) trong lúc tải, rồi cập nhật khi có cấu hình thật từ DB.
 */
export function useNckhReviewCriteria(): NckhReviewCriteriaConfig {
  const [config, setConfig] = useState<NckhReviewCriteriaConfig>(DEFAULT_NCKH_REVIEW_CRITERIA);
  useEffect(() => {
    getNckhReviewCriteria().then(c => { if (c) setConfig(c); }).catch(() => {});
  }, []);
  return config;
}
