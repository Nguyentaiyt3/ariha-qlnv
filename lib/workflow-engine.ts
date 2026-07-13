/**
 * Workflow Engine — logic thuần (không phụ thuộc React/DB) cho quy trình DAG.
 *
 * Dùng chung bởi:
 *  - CreateTaskModal: chuyển quy trình mẫu (nodes + edges) → TaskStep[] có phụ thuộc.
 *  - StepsTab: tính đầu vào sẵn sàng / đầu ra / đánh giá 3T theo thời gian thực.
 *
 * Nguyên tắc: mỗi node trong quy trình mẫu trở thành một TaskStep; edges trở thành
 * quan hệ `dependsOn` giữa các bước, tạo nên chuỗi liền mạch (đầu ra bước trước =
 * đầu vào bước sau).
 */
import type {
  TaskStep, WorkflowNode, WorkflowEdge, WorkflowStep, Proof,
} from "@/types";
import { generateId } from "@/lib/utils";

// ─── Hoàn thành ───────────────────────────────────────────────

/** Một bước coi như xong khi status="completed" HOẶC tiến độ đạt 100. */
export function isStepDone(s: Pick<TaskStep, "status" | "progress">): boolean {
  return s.status === "completed" || (s.progress ?? 0) >= 100;
}

// ─── Sắp xếp topo (Kahn) ──────────────────────────────────────

/**
 * Heuristic: nếu phần lớn cạnh nội bộ đi ngược chiều vị trí visual
 * (source nằm BÊN PHẢI / BÊN DƯỚI target theo trục chính), quy trình đã
 * được vẽ ngược — đổi chiều tất cả cạnh nội bộ để khớp thứ tự thực thi.
 *
 * Trả về edges đã chuẩn hóa (cạnh ngoại (ext::) giữ nguyên).
 */
export function normalizeEdgeDirection(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowEdge[] {
  const ids = new Set(nodes.map((n) => n.id));
  const internal = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  if (internal.length === 0) return edges;

  // Chọn trục có phân tán lớn nhất (ngang hoặc dọc)
  const xVals = nodes.map((n) => n.position?.x ?? 0);
  const yVals = nodes.map((n) => n.position?.y ?? 0);
  const xRange = Math.max(...xVals) - Math.min(...xVals);
  const yRange = Math.max(...yVals) - Math.min(...yVals);
  const pos = new Map(nodes.map((n) => [
    n.id,
    xRange >= yRange ? (n.position?.x ?? 0) : (n.position?.y ?? 0),
  ]));

  // Đếm cạnh đi ngược chiều (source có vị trí lớn hơn target)
  const backwardCount = internal.filter(
    (e) => (pos.get(e.source) ?? 0) > (pos.get(e.target) ?? 0),
  ).length;

  if (backwardCount <= internal.length / 2) return edges; // đã đúng chiều

  // Lật tất cả cạnh nội bộ
  return edges.map((e) =>
    ids.has(e.source) && ids.has(e.target)
      ? { ...e, source: e.target, target: e.source }
      : e,
  );
}

/**
 * Chỉ mũi tên liền ("Phải hoàn thành trước", `required: true`) mới là ràng buộc thứ tự thật.
 * Mũi tên đứt (`required: false`/không đặt) là đường "quay lại làm lại" khi không đạt yêu cầu —
 * không chặn thứ tự thực thi, không tính vào đồ thị phụ thuộc.
 */
function requiredEdgesOnly(edges: WorkflowEdge[]): WorkflowEdge[] {
  return edges.filter((e) => e.required === true);
}

/**
 * Sắp xếp các node theo thứ tự phụ thuộc (node nguồn trước node đích).
 * Tự phát hiện quy trình vẽ ngược và chuẩn hóa chiều cạnh trước khi sort.
 * Bỏ qua các cạnh tới node ngoài (target dạng "ext::..."). Nếu có chu trình,
 * phần còn lại được nối vào cuối để không mất node nào.
 */
export function topoSortNodeIds(nodes: WorkflowNode[], edges: WorkflowEdge[]): string[] {
  const normalizedEdges = requiredEdgesOnly(normalizeEdgeDirection(nodes, edges));

  // Ưu tiên sắp theo số thứ tự (order) tăng dần — node chưa gán order rơi xuống dưới, sắp theo
  // vị trí trên sơ đồ (trái→phải, trên→dưới) rồi theo index gốc để ổn định.
  const sorted = nodes
    .map((n, i) => ({ n, i }))
    .sort((a, b) => {
      const oa = a.n.order, ob = b.n.order;
      if (oa != null && ob != null) return oa - ob;
      if (oa != null) return -1;
      if (ob != null) return 1;
      const dx = (a.n.position?.x ?? 0) - (b.n.position?.x ?? 0);
      if (dx !== 0) return dx;
      const dy = (a.n.position?.y ?? 0) - (b.n.position?.y ?? 0);
      if (dy !== 0) return dy;
      return a.i - b.i;
    })
    .map(({ n }) => n);
  const priority = new Map(sorted.map((n, i) => [n.id, i]));

  const ids = new Set(sorted.map((n) => n.id));
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  ids.forEach((id) => { indeg.set(id, 0); adj.set(id, []); });

  for (const e of normalizedEdges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    adj.get(e.source)!.push(e.target);
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const n of sorted) if ((indeg.get(n.id) ?? 0) === 0) queue.push(n.id);

  const order: string[] = [];
  while (queue.length) {
    // Trong số các node đang sẵn sàng (indegree=0) cùng lúc, luôn chọn node có order/vị trí ưu
    // tiên thấp nhất trước — đảm bảo số thứ tự người dùng đặt được tôn trọng tối đa.
    queue.sort((a, b) => (priority.get(a) ?? 0) - (priority.get(b) ?? 0));
    const id = queue.shift()!;
    order.push(id);
    for (const next of adj.get(id) ?? []) {
      indeg.set(next, (indeg.get(next) ?? 0) - 1);
      if ((indeg.get(next) ?? 0) === 0) queue.push(next);
    }
  }

  // node còn sót (do chu trình) — nối vào cuối theo thứ tự ưu tiên
  if (order.length < nodes.length) {
    const seen = new Set(order);
    for (const n of sorted) if (!seen.has(n.id)) order.push(n.id);
  }
  return order;
}

/** Map nodeId → id các node tiền nhiệm (đầu vào trực tiếp) — chỉ tính mũi tên liền (bắt buộc). */
export function buildDependsOnMap(nodes: WorkflowNode[], edges: WorkflowEdge[]): Map<string, string[]> {
  const normalizedEdges = requiredEdgesOnly(normalizeEdgeDirection(nodes, edges));
  const ids = new Set(nodes.map((n) => n.id));
  const deps = new Map<string, string[]>();
  ids.forEach((id) => deps.set(id, []));
  for (const e of normalizedEdges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    deps.get(e.target)!.push(e.source);
  }
  return deps;
}

// ─── Quy trình mẫu → các bước nhiệm vụ ────────────────────────

export interface NodesToStepsOptions {
  /** nodeId → userId người được gán lúc tạo task (template để trống theo vai trò). */
  assigneeByNode?: Record<string, string>;
  /** Đơn vị KPI mặc định nếu node không khai báo. */
  defaultKpiUnit?: string;
}

/**
 * Chuyển quy trình mẫu dạng đồ thị (nodes + edges) → TaskStep[] với `dependsOn`.
 * Giữ nguyên id node làm id bước để edges dịch thẳng thành phụ thuộc.
 */
export function nodesToTaskSteps(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  opts: NodesToStepsOptions = {},
): TaskStep[] {
  const { assigneeByNode = {}, defaultKpiUnit = "điểm" } = opts;
  const order = topoSortNodeIds(nodes, edges);
  const depMap = buildDependsOnMap(nodes, edges);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  return order.map((nodeId) => {
    const n = byId.get(nodeId)!;
    // Đệ quy xử lý childNodes → childSteps
    const childSteps = n.childNodes?.length
      ? nodesToTaskSteps(n.childNodes, n.childEdges ?? [], opts)
      : undefined;
    const childEdges = n.childNodes?.length ? (n.childEdges ?? []) : undefined;
    return {
      id: n.id, // giữ id node để dependsOn khớp
      name: n.name,
      description: n.description,
      assigneeId: assigneeByNode[n.id] ?? n.assigneeId ?? "",
      status: "pending",
      progress: 0,
      kpiTarget: n.kpiTarget ?? 0,
      kpiCurrent: 0,
      kpiUnit: n.kpiUnit ?? defaultKpiUnit,
      proofs: [],
      deadline: n.deadline,
      dependsOn: depMap.get(n.id) ?? [],
      roleRequired: n.roleRequired,
      department: n.department,
      position: n.position,
      expectedOutput: n.output,
      ...(childSteps ? { childSteps, childEdges } : {}),
    } satisfies TaskStep;
  });
}

/**
 * Tương thích ngược: quy trình mẫu chỉ có danh sách phẳng `steps` (chưa vẽ sơ đồ).
 * Tạo chuỗi tuyến tính — mỗi bước phụ thuộc bước liền trước.
 */
export function linearStepsToTaskSteps(
  steps: WorkflowStep[],
  opts: NodesToStepsOptions = {},
): TaskStep[] {
  const { defaultKpiUnit = "điểm" } = opts;
  const sorted = [...steps].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const ids = sorted.map(() => generateId("step"));
  return sorted.map((ws, i) => ({
    id: ids[i],
    name: ws.name,
    description: ws.description,
    assigneeId: "",
    status: "pending",
    progress: 0,
    kpiTarget: 0,
    kpiCurrent: 0,
    kpiUnit: defaultKpiUnit,
    proofs: [],
    durationDays: ws.durationDays,
    dependsOn: i > 0 ? [ids[i - 1]] : [],
  } satisfies TaskStep));
}

// ─── Đầu vào / đầu ra theo thời gian thực ─────────────────────

export interface InputState {
  ready: boolean;
  /** số bước tiền nhiệm đã hoàn thành / tổng. */
  doneCount: number;
  totalCount: number;
  /** tên các bước tiền nhiệm chưa xong (để hiển thị). */
  pendingNames: string[];
}

/**
 * Đầu vào của một bước = trạng thái hoàn thành của tất cả bước tiền nhiệm.
 * Bước không có tiền nhiệm → luôn sẵn sàng.
 */
export function computeInputState(step: TaskStep, allSteps: TaskStep[]): InputState {
  const deps = step.dependsOn ?? [];
  if (deps.length === 0) {
    return { ready: true, doneCount: 0, totalCount: 0, pendingNames: [] };
  }
  const byId = new Map(allSteps.map((s) => [s.id, s]));
  const preds = deps.map((id) => byId.get(id)).filter((s): s is TaskStep => !!s);
  const doneCount = preds.filter(isStepDone).length;
  const pendingNames = preds.filter((s) => !isStepDone(s)).map((s) => s.name);
  return {
    ready: doneCount === preds.length && preds.length > 0,
    doneCount,
    totalCount: preds.length,
    pendingNames,
  };
}

export interface OutputState {
  /** đã có kết quả đầu ra hợp lệ (hoàn thành + có minh chứng). */
  delivered: boolean;
  hasProof: boolean;
  text: string;
}

/** Đầu ra của bước suy từ tiến độ + minh chứng. */
export function computeOutputState(step: TaskStep): OutputState {
  const hasProof = (step.proofs?.length ?? 0) > 0;
  const done = isStepDone(step);
  const delivered = done && hasProof;
  const text = step.outputSummary?.trim()
    ? step.outputSummary.trim()
    : delivered
    ? "Đã hoàn thành, có minh chứng"
    : done
    ? "Hoàn thành nhưng thiếu minh chứng"
    : `Đang thực hiện (${step.progress ?? 0}%)`;
  return { delivered, hasProof, text };
}

// ─── Đánh giá 3T theo bước ────────────────────────────────────

export type StepEval3T = "tot" | "trung_binh" | "te";

/** số ngày còn lại tới deadline (âm = đã trễ). null nếu không có deadline. */
export function daysRemaining(deadline?: string, now: Date = new Date()): number | null {
  if (!deadline) return null;
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return null;
  const ms = d.getTime() - new Date(now.toDateString()).getTime();
  return Math.floor(ms / 86_400_000);
}

/**
 * Gợi ý đánh giá 3T cho một bước dựa trên tiến độ + đúng hạn + minh chứng.
 * Trả về null khi bước đang thực hiện và chưa đủ dữ kiện để kết luận.
 */
export function computeStepEval3T(step: TaskStep, now: Date = new Date()): StepEval3T | null {
  const done = isStepDone(step);
  const hasProof = (step.proofs?.length ?? 0) > 0;
  const left = daysRemaining(step.deadline, now);
  const onTime = left === null || left >= 0;

  if (done) {
    if (hasProof && onTime) return "tot";
    if (!hasProof || !onTime) return "trung_binh";
  }
  // chưa xong mà đã trễ hạn → kém
  if (!done && left !== null && left < 0) return "te";
  // đang thực hiện, đúng tiến độ → chưa kết luận
  return null;
}

export const STEP_EVAL_LABEL: Record<StepEval3T, string> = {
  tot: "Tốt",
  trung_binh: "Trung bình",
  te: "Kém",
};

// ─── Tổng hợp tiến độ nhiệm vụ ────────────────────────────────

/** Tiến độ tổng = trung bình tiến độ các bước. */
export function rollupProgress(steps: TaskStep[]): number {
  if (!steps.length) return 0;
  return Math.round(steps.reduce((sum, s) => sum + (s.progress ?? 0), 0) / steps.length);
}

/**
 * Tiến độ hiệu dụng của một bước: nếu có childSteps thì rollup từ con,
 * ngược lại trả về progress của chính bước đó.
 */
export function rollupStepProgress(step: TaskStep): number {
  if (step.childSteps?.length) {
    return rollupProgress(step.childSteps);
  }
  return step.progress ?? 0;
}

/**
 * Cập nhật đệ quy progress của một bước theo id trong cây steps.
 * Trả về mảng steps mới (immutable).
 */
export function updateStepById(steps: TaskStep[], stepId: string, patch: Partial<TaskStep>): TaskStep[] {
  return steps.map((s) => {
    if (s.id === stepId) return { ...s, ...patch };
    if (s.childSteps?.length) {
      return { ...s, childSteps: updateStepById(s.childSteps, stepId, patch) };
    }
    return s;
  });
}

/** Tìm một bước theo id trong cây steps (bao gồm childSteps đệ quy). */
export function findStepById(steps: TaskStep[], stepId: string): TaskStep | undefined {
  for (const s of steps) {
    if (s.id === stepId) return s;
    if (s.childSteps?.length) {
      const found = findStepById(s.childSteps, stepId);
      if (found) return found;
    }
  }
  return undefined;
}
