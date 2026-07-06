import type { CostItem, ClinicalTrialPayment, HandoverDistribution } from "@/types";

export function calculateCostItemAmount(
  item: CostItem,
  totalAmount: number
): number {
  if (item.amount !== undefined && item.amount > 0) {
    return item.amount;
  }
  if (item.percentage !== undefined && item.percentage > 0) {
    return (totalAmount * item.percentage) / 100;
  }
  return 0;
}

export function validateCostItems(items: CostItem[], totalAmount: number): {
  valid: boolean;
  error?: string;
} {
  if (!items || items.length === 0) {
    return { valid: false, error: "Phải có ít nhất 1 khoản chi phí" };
  }

  let totalPercentage = 0;
  let totalFixed = 0;
  let hasPercentage = false;
  let hasFixed = false;

  for (const item of items) {
    if (!item.name || !item.name.trim()) {
      return { valid: false, error: "Tên khoản chi không được để trống" };
    }

    if (item.percentage && item.percentage > 0) {
      totalPercentage += item.percentage;
      hasPercentage = true;
    }

    if (item.amount && item.amount > 0) {
      totalFixed += item.amount;
      hasFixed = true;
    }

    if ((!item.percentage || item.percentage <= 0) && (!item.amount || item.amount <= 0)) {
      return { valid: false, error: `${item.name}: Phải nhập % hoặc số tiền` };
    }
  }

  // Mixed percentage and fixed amounts
  if (hasPercentage && hasFixed) {
    return {
      valid: false,
      error: "Không thể trộn lẫn % và số tiền cố định",
    };
  }

  // Percentage validation
  if (hasPercentage && Math.abs(totalPercentage - 100) > 0.01) {
    return {
      valid: false,
      error: `Tổng % phải = 100% (hiện tại: ${totalPercentage.toFixed(1)}%)`,
    };
  }

  // Fixed amount validation
  if (hasFixed && totalFixed > totalAmount * 1.01) {
    return {
      valid: false,
      error: `Tổng chi phí (${totalFixed}) không được vượt quá số tiền thanh toán (${totalAmount})`,
    };
  }

  return { valid: true };
}

export function calculateCostItemDistribution(
  items: CostItem[],
  totalAmount: number
): Record<string, number> {
  const distribution: Record<string, number> = {};

  for (const item of items) {
    distribution[item.id] = calculateCostItemAmount(item, totalAmount);
  }

  return distribution;
}

/** Suy ra danh sách bàn giao cho từng đơn vị từ các khoản chi đã chọn (handoverSelection) */
export function deriveHandoverDistributions(
  payment: Pick<ClinicalTrialPayment, "costItems" | "handoverSelection" | "totalAmount">
): HandoverDistribution[] {
  const selectedIds = payment.handoverSelection?.selectedCostItemIds;
  const items = payment.costItems || [];
  const filtered =
    selectedIds && selectedIds.length > 0
      ? items.filter((i) => selectedIds.includes(i.id))
      : items;

  return filtered.map((item) => ({
    costItemId: item.id,
    unit: item.unit || item.name,
    amount: calculateCostItemAmount(item, payment.totalAmount || 0),
    status: "pending" as const,
  }));
}
