"use client";

import { useMemo, useRef, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Sector,
} from "recharts";
import { BarChart3, Download, FileSpreadsheet, FileText, TrendingUp, Users, CheckCircle, AlertTriangle } from "lucide-react";
import { useTaskStore } from "@/stores/useTaskStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { hasPermission } from "@/lib/rbac/permissions";
import { isOverdue } from "@/lib/utils";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { toast } from "sonner";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

const STATUS_COLORS: Record<string, string> = {
  todo: "#94a3b8",
  in_progress: "#3b82f6",
  review: "#f59e0b",
  done: "#10b981",
  cancelled: "#ef4444",
};

const STATUS_LABELS: Record<string, string> = {
  todo: "Chờ làm",
  in_progress: "Đang làm",
  review: "Chờ duyệt",
  done: "Hoàn thành",
  cancelled: "Đã hủy",
};

type Period = "3months" | "6months" | "12months";

export default function AnalyticsPage() {
  const { currentUser } = useAuthStore();
  const { tasks, users } = useTaskStore();
  const [period, setPeriod] = useState<Period>("3months");
  const [exportLoading, setExportLoading] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

  const canExport = currentUser ? hasPermission(currentUser.role, "report:export") : false;

  const periodMonths = period === "3months" ? 3 : period === "6months" ? 6 : 12;

  // Month-by-month completion trend
  const trendData = useMemo(() => {
    return Array.from({ length: periodMonths }, (_, i) => {
      const date = subMonths(new Date(), periodMonths - 1 - i);
      const start = startOfMonth(date);
      const end = endOfMonth(date);
      const month = format(date, "MM/yy");

      const inPeriod = tasks.filter(
        (t) => t.deadlineBase && new Date(t.deadlineBase) >= start && new Date(t.deadlineBase) <= end,
      );
      const done = inPeriod.filter((t) => t.status === "done").length;
      const overdue = inPeriod.filter((t) => isOverdue(t.deadlineBase) && t.status !== "done").length;

      return { month, "Hoàn thành": done, "Quá hạn": overdue, "Tổng": inPeriod.length };
    });
  }, [tasks, periodMonths]);

  // Status distribution
  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    tasks.forEach((t) => {
      counts[t.status] = (counts[t.status] ?? 0) + 1;
    });
    return Object.entries(counts).map(([status, count]) => ({
      name: STATUS_LABELS[status] ?? status,
      value: count,
      color: STATUS_COLORS[status] ?? "#94a3b8",
    }));
  }, [tasks]);

  // Department performance
  const deptData = useMemo(() => {
    const depts: Record<string, { done: number; total: number }> = {};
    tasks.forEach((t) => {
      const dept = t.department ?? "Khác";
      if (!depts[dept]) depts[dept] = { done: 0, total: 0 };
      depts[dept].total++;
      if (t.status === "done") depts[dept].done++;
    });
    return Object.entries(depts)
      .map(([dept, { done, total }]) => ({
        dept: dept.length > 10 ? dept.slice(0, 10) + "..." : dept,
        "Hoàn thành": done,
        "Còn lại": total - done,
        rate: total > 0 ? Math.round((done / total) * 100) : 0,
      }))
      .sort((a, b) => b.rate - a.rate);
  }, [tasks]);

  // Summary KPIs
  const summary = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "done").length;
    const overdue = tasks.filter((t) => isOverdue(t.deadlineBase) && t.status !== "done").length;
    const risk = tasks.filter((t) => t.riskFlag).length;
    const rate = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, overdue, risk, rate };
  }, [tasks]);

  const exportExcel = async () => {
    setExportLoading(true);
    try {
      const { utils, writeFile } = await import("xlsx");
      const ws = utils.json_to_sheet(
        tasks.map((t) => ({
          ID: t.id,
          "Tên nhiệm vụ": t.name,
          "Trạng thái": STATUS_LABELS[t.status] ?? t.status,
          "Tiến độ (%)": t.progress,
          "Deadline": t.deadlineBase ?? "",
          "Phòng ban": t.department ?? "",
          "Ưu tiên": t.priority,
          "Rủi ro": t.riskFlag ? "Có" : "Không",
        })),
      );
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, "Nhiệm vụ");
      writeFile(wb, `ariha-report-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
      toast.success("Đã xuất Excel");
    } catch {
      toast.error("Xuất Excel thất bại");
    } finally {
      setExportLoading(false);
    }
  };

  const exportPDF = async () => {
    setExportLoading(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const { default: html2canvas } = await import("html2canvas");
      if (!chartRef.current) return;
      const canvas = await html2canvas(chartRef.current, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "landscape", format: "a4" });
      const w = pdf.internal.pageSize.getWidth();
      const h = (canvas.height / canvas.width) * w;
      pdf.text(`ARiHA WorkHub — Báo cáo phân tích (${format(new Date(), "dd/MM/yyyy")})`, 14, 10);
      pdf.addImage(imgData, "PNG", 0, 20, w, h);
      pdf.save(`ariha-analytics-${format(new Date(), "yyyy-MM-dd")}.pdf`);
      toast.success("Đã xuất PDF");
    } catch {
      toast.error("Xuất PDF thất bại");
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <div className="px-4 py-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-[var(--foreground)] flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-blue-500" />
          Phân tích & Báo cáo
        </h1>
        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="3months">3 tháng</option>
            <option value="6months">6 tháng</option>
            <option value="12months">12 tháng</option>
          </select>
          {canExport && (
            <>
              <button
                onClick={exportExcel}
                disabled={exportLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--card)] text-green-600 hover:bg-green-50 transition-colors"
              >
                <FileSpreadsheet className="w-4 h-4" /> Excel
              </button>
              <button
                onClick={exportPDF}
                disabled={exportLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--card)] text-red-600 hover:bg-red-50 transition-colors"
              >
                <FileText className="w-4 h-4" /> PDF
              </button>
            </>
          )}
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Tổng nhiệm vụ", value: summary.total, icon: <BarChart3 className="w-5 h-5" />, color: "text-blue-600 bg-blue-50" },
          { label: "Hoàn thành", value: `${summary.done} (${summary.rate}%)`, icon: <CheckCircle className="w-5 h-5" />, color: "text-green-600 bg-green-50" },
          { label: "Quá hạn", value: summary.overdue, icon: <AlertTriangle className="w-5 h-5" />, color: "text-red-600 bg-red-50" },
          { label: "Rủi ro", value: summary.risk, icon: <TrendingUp className="w-5 h-5" />, color: "text-amber-600 bg-amber-50" },
        ].map((item) => (
          <div key={item.label} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${item.color}`}>
              {item.icon}
            </div>
            <p className="text-xl font-bold text-[var(--foreground)]">{item.value}</p>
            <p className="text-xs text-[var(--muted-foreground)]">{item.label}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div ref={chartRef} className="space-y-5">
        {/* Trend */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
          <h3 className="font-semibold text-[var(--foreground)] mb-4">Xu hướng hoàn thành theo tháng</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
              <YAxis tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="Hoàn thành" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Quá hạn" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Tổng" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Status pie */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
            <h3 className="font-semibold text-[var(--foreground)] mb-4">Phân bổ trạng thái</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={75}
                  label={({ name, percent }) => `${name} ${Math.round((percent ?? 0) * 100)}%`}
                  labelLine={false}
                >
                  {statusData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => [`${v} nhiệm vụ`]} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Department bar */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
            <h3 className="font-semibold text-[var(--foreground)] mb-4">Hiệu suất theo phòng ban</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={deptData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <YAxis type="category" dataKey="dept" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={70} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Hoàn thành" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Còn lại" stackId="a" fill="#e2e8f0" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
