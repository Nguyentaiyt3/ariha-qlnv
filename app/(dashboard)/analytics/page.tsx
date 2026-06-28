"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from "recharts";
import { BarChart3, FileSpreadsheet, FileText, TrendingUp, CheckCircle, AlertTriangle, X, ChevronRight, MousePointerClick } from "lucide-react";
import { useTaskStore } from "@/stores/useTaskStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { hasPermission } from "@/lib/rbac/permissions";
import { isOverdue } from "@/lib/utils";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { toast } from "sonner";
import type { Task } from "@/types";

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

      return {
        month, "Hoàn thành": done, "Quá hạn": overdue, "Tổng": inPeriod.length,
        _startMs: start.getTime(), _endMs: end.getTime(),
      };
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
      status,
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
        fullDept: dept,
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

  // ── Drill-down: click any chart/KPI to see the underlying tasks ──
  const [drill, setDrill] = useState<{ title: string; tasks: Task[] } | null>(null);

  const openDrillStatus = (entry: { status?: string } | null) => {
    if (!entry?.status) return;
    setDrill({
      title: `Trạng thái: ${STATUS_LABELS[entry.status] ?? entry.status}`,
      tasks: tasks.filter((t) => t.status === entry.status),
    });
  };
  const openDrillDept = (payload: { fullDept?: string } | null) => {
    if (!payload?.fullDept) return;
    setDrill({
      title: `Phòng ban: ${payload.fullDept}`,
      tasks: tasks.filter((t) => (t.department ?? "Khác") === payload.fullDept),
    });
  };
  const openDrillMonth = (label?: string) => {
    const entry = trendData.find((d) => d.month === label);
    if (!entry) return;
    setDrill({
      title: `Tháng ${label}`,
      tasks: tasks.filter(
        (t) => t.deadlineBase &&
          new Date(t.deadlineBase).getTime() >= entry._startMs &&
          new Date(t.deadlineBase).getTime() <= entry._endMs,
      ),
    });
  };
  const openDrillKpi = (kind: "total" | "done" | "overdue" | "risk") => {
    const map: Record<typeof kind, { title: string; tasks: Task[] }> = {
      total:   { title: "Tất cả nhiệm vụ", tasks },
      done:    { title: "Nhiệm vụ hoàn thành", tasks: tasks.filter((t) => t.status === "done") },
      overdue: { title: "Nhiệm vụ quá hạn", tasks: tasks.filter((t) => isOverdue(t.deadlineBase) && t.status !== "done") },
      risk:    { title: "Nhiệm vụ rủi ro", tasks: tasks.filter((t) => t.riskFlag) },
    };
    setDrill(map[kind]);
  };

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

      {/* Hint */}
      <p className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] mb-3">
        <MousePointerClick className="w-3.5 h-3.5" />
        Nhấn vào thẻ chỉ số hoặc bất kỳ phần nào của biểu đồ để xem danh sách nhiệm vụ chi tiết.
      </p>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {([
          { kind: "total" as const,   label: "Tổng nhiệm vụ", value: summary.total, icon: <BarChart3 className="w-5 h-5" />, color: "text-blue-600 bg-blue-50" },
          { kind: "done" as const,    label: "Hoàn thành", value: `${summary.done} (${summary.rate}%)`, icon: <CheckCircle className="w-5 h-5" />, color: "text-green-600 bg-green-50" },
          { kind: "overdue" as const, label: "Quá hạn", value: summary.overdue, icon: <AlertTriangle className="w-5 h-5" />, color: "text-red-600 bg-red-50" },
          { kind: "risk" as const,    label: "Rủi ro", value: summary.risk, icon: <TrendingUp className="w-5 h-5" />, color: "text-amber-600 bg-amber-50" },
        ]).map((item) => (
          <button
            key={item.label}
            onClick={() => openDrillKpi(item.kind)}
            className="text-left bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer"
          >
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${item.color}`}>
              {item.icon}
            </div>
            <p className="text-xl font-bold text-[var(--foreground)]">{item.value}</p>
            <p className="text-xs text-[var(--muted-foreground)]">{item.label}</p>
          </button>
        ))}
      </div>

      {/* Charts */}
      <div ref={chartRef} className="space-y-5">
        {/* Trend */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
          <h3 className="font-semibold text-[var(--foreground)] mb-4">Xu hướng hoàn thành theo tháng</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart
              data={trendData}
              onClick={(s) => openDrillMonth((s as { activeLabel?: string })?.activeLabel)}
              style={{ cursor: "pointer" }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="Hoàn thành" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="Quá hạn" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6 }} />
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
                  onClick={(d) => openDrillStatus(d as { status?: string })}
                  style={{ cursor: "pointer" }}
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
                <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.4 }} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Hoàn thành" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} onClick={(d) => openDrillDept(d as { fullDept?: string })} style={{ cursor: "pointer" }} />
                <Bar dataKey="Còn lại" stackId="a" fill="#e2e8f0" radius={[0, 4, 4, 0]} onClick={(d) => openDrillDept(d as { fullDept?: string })} style={{ cursor: "pointer" }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Drill-down slide-over — links each task to its source detail page */}
      {drill && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setDrill(null)} />
          <div className="fixed right-0 top-0 h-full w-full max-w-md bg-[var(--card)] border-l border-[var(--border)] z-50 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <div className="min-w-0">
                <h3 className="font-semibold text-[var(--foreground)] truncate">{drill.title}</h3>
                <p className="text-xs text-[var(--muted-foreground)]">{drill.tasks.length} nhiệm vụ</p>
              </div>
              <button onClick={() => setDrill(null)} className="p-1.5 hover:bg-[var(--muted)] rounded-lg flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {drill.tasks.length === 0 && (
                <p className="text-center text-sm text-[var(--muted-foreground)] py-10">Không có nhiệm vụ nào.</p>
              )}
              {drill.tasks.map((t) => (
                <Link
                  key={t.id}
                  href={`/tasks/${t.id}`}
                  onClick={() => setDrill(null)}
                  className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border)] hover:border-blue-400 hover:bg-[var(--muted)] transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--foreground)] truncate">{t.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{
                          background: (STATUS_COLORS[t.status] ?? "#94a3b8") + "22",
                          color: STATUS_COLORS[t.status] ?? "#64748b",
                        }}
                      >
                        {STATUS_LABELS[t.status] ?? t.status}
                      </span>
                      <span className="text-[10px] text-[var(--muted-foreground)]">{t.progress}%</span>
                      {t.department && (
                        <span className="text-[10px] text-[var(--muted-foreground)] truncate">· {t.department}</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[var(--muted-foreground)] flex-shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
