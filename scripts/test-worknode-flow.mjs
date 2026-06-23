/**
 * scripts/test-worknode-flow.mjs
 *
 * Test toàn bộ luồng WorkNode governance (3T):
 *   Node A (không có prerequisite)
 *   Node B (prerequisite = Node A → bắt đầu bị LOCKED)
 *
 * Flow:
 *   1. Tạo Node A                     → status: pending
 *   2. Tạo Node B (prereq = A)        → status: locked
 *   3. Bắt đầu Node A                 → status: in_progress
 *   4. Tick checklist Node A           → progress auto-calc
 *   5. Thêm output attachment Node A   → Đầu ra
 *   6. Nhập actualCost Node A          → T3 auto-calc
 *   7. Nộp nghiệm thu Node A           → status: review
 *   8. Phê duyệt Node A (pass, 4★)     → status: completed, T1+T3 tính, trigger unlock B
 *   9. Kiểm tra Node B                 → status phải là: pending
 *
 * Cách chạy: node scripts/test-worknode-flow.mjs
 */

const BASE = "http://localhost:3000";
const ROOT_TASK_ID = "test-task-" + Date.now(); // fake taskId cho test
const FAKE_USER = { id: "user-test-01", name: "Test User" };
const APPROVER  = { id: "approver-01",  name: "Approver" };

// ─── Helpers ─────────────────────────────────────────────────────────────────

const c = {
  reset:  "\x1b[0m",
  green:  "\x1b[32m",
  red:    "\x1b[31m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
};

let passed = 0;
let failed = 0;

function log(step, msg) {
  console.log(`\n${c.cyan}${c.bold}[${step}]${c.reset} ${msg}`);
}

function ok(label, actual, expected) {
  if (actual === expected) {
    console.log(`  ${c.green}✓${c.reset} ${label}: ${c.bold}${actual}${c.reset}`);
    passed++;
  } else {
    console.log(`  ${c.red}✗${c.reset} ${label}: got ${c.bold}${actual}${c.reset}, expected ${c.bold}${expected}${c.reset}`);
    failed++;
  }
}

function info(label, value) {
  console.log(`  ${c.dim}→${c.reset} ${label}: ${c.yellow}${JSON.stringify(value)}${c.reset}`);
}

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json();
  if (!res.ok && !json.error?.includes("Bắt buộc")) {
    // Lỗi không mong đợi
    throw new Error(`${method} ${path} → ${res.status}: ${json.error}`);
  }
  return { status: res.status, data: json };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n${c.bold}══ WorkNode Flow Test ══${c.reset}`);
  console.log(`${c.dim}rootTaskId: ${ROOT_TASK_ID}${c.reset}\n`);

  // ── 1. Tạo Node A ──────────────────────────────────────────────────────────
  log("1", "Tạo Node A (không có prerequisite)");
  const { data: d1 } = await api("POST", "/api/work-nodes", {
    rootTaskId:    ROOT_TASK_ID,
    name:          "Node A — Chuẩn bị tài liệu",
    description:   "Thu thập và tổng hợp toàn bộ hồ sơ",
    assigneeId:    FAKE_USER.id,
    assigneeName:  FAKE_USER.name,
    dueDate:       new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 ngày tới
    budget:        5000000,
    inputResources: [
      { id: "r1", type: "text",   label: "Hướng dẫn", content: "Xem tài liệu nội bộ ARiHA-SOP-01" },
      { id: "r2", type: "link",   label: "Biểu mẫu",  content: "https://drive.google.com/example" },
      { id: "r3", type: "budget", label: "Ngân sách",  content: "5,000,000 VNĐ", amount: 5000000 },
    ],
    checklist: [
      { label: "Thu thập hồ sơ gốc" },
      { label: "Scan và số hóa" },
      { label: "Upload lên hệ thống" },
    ],
    prerequisites:    [],
    prerequisiteMode: "ALL",
    createdBy:     FAKE_USER.id,
    createdByName: FAKE_USER.name,
  });
  const nodeA = d1.node;
  ok("status Node A", nodeA.status, "pending");
  ok("depth",         nodeA.depth, 1);
  ok("checklist items", nodeA.checklist.length, 3);
  ok("budget",        nodeA.budget, 5000000);
  info("nodeA.id", nodeA.id);

  // ── 2. Tạo Node B (prerequisite = Node A) ──────────────────────────────────
  log("2", "Tạo Node B (prerequisite = Node A → phải bị LOCKED)");
  const { data: d2 } = await api("POST", "/api/work-nodes", {
    rootTaskId:    ROOT_TASK_ID,
    name:          "Node B — Trình ký duyệt",
    assigneeId:    FAKE_USER.id,
    assigneeName:  FAKE_USER.name,
    dueDate:       new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    budget:        1000000,
    prerequisites:    [nodeA.id],
    prerequisiteMode: "ALL",
    checklist: [
      { label: "In bộ hồ sơ" },
      { label: "Trình ký Ban Giám đốc" },
    ],
    createdBy:     FAKE_USER.id,
    createdByName: FAKE_USER.name,
  });
  const nodeB = d2.node;
  ok("status Node B", nodeB.status, "locked");
  ok("prerequisites length", nodeB.prerequisites.length, 1);
  info("nodeB.id", nodeB.id);

  // ── 3. Bắt đầu Node A ──────────────────────────────────────────────────────
  log("3", "Bắt đầu Node A (pending → in_progress)");
  const { data: d3 } = await api("PATCH", `/api/work-nodes/${nodeA.id}`, {
    status: "in_progress",
  });
  ok("status Node A", d3.node.status, "in_progress");

  // ── 4. Tick checklist ──────────────────────────────────────────────────────
  log("4", "Tick 2/3 checklist items → progress auto-calc");
  const checklist = nodeA.checklist.map((c, i) => ({
    ...c,
    completed: i < 2,
    completedAt: i < 2 ? new Date().toISOString() : undefined,
  }));
  const { data: d4 } = await api("PATCH", `/api/work-nodes/${nodeA.id}`, { checklist });
  ok("progress (2/3 = 66%)", d4.node.progress, 67);

  // ── 5. Thử nộp nghiệm thu KHI CHƯA CÓ output → phải báo lỗi 422 ──────────
  log("5", "Thử nộp nghiệm thu khi Output rỗng → phải bị từ chối (422)");
  const { status: s5, data: d5 } = await api("POST", `/api/work-nodes/${nodeA.id}/submit`);
  ok("HTTP status", s5, 422);
  info("error message", d5.error);

  // ── 6. Thêm Output Attachment ─────────────────────────────────────────────
  log("6", "Thêm đầu ra (Output Attachment) cho Node A");
  const { data: d6 } = await api("POST", `/api/work-nodes/${nodeA.id}/attachments`, {
    type:          "link",
    name:          "Hồ sơ hoàn chỉnh — Google Drive",
    content:       "https://drive.google.com/file/example-final",
    uploadedBy:    FAKE_USER.id,
    uploadedByName: FAKE_USER.name,
  });
  ok("attachment type", d6.attachment.type, "link");
  info("attachment.id", d6.attachment.id);

  // ── 7. Nhập actualCost → T3 auto-calc ─────────────────────────────────────
  log("7", "Nhập chi phí thực tế 4,200,000 VNĐ → T3 auto-calc");
  const { data: d7 } = await api("PATCH", `/api/work-nodes/${nodeA.id}`, {
    actualCost: 4200000,
  });
  ok("T3 status",       d7.node.t3Resources?.status, "under_budget");
  ok("T3 variance",     d7.node.t3Resources?.variance, -800000);
  ok("T3 variancePct",  d7.node.t3Resources?.variancePct, -16);
  info("T3", d7.node.t3Resources);

  // ── 8. Nộp nghiệm thu (đã có output) ──────────────────────────────────────
  log("8", "Nộp nghiệm thu Node A (đã có output) → status: review");
  const { data: d8 } = await api("POST", `/api/work-nodes/${nodeA.id}/submit`);
  ok("message", d8.status, "review");

  // ── 9. Phê duyệt (pass, 4★) → T1 tính + trigger unlock Node B ─────────────
  log("9", "Phê duyệt Node A (pass, 4★) → completed + trigger unlock Node B");
  const { data: d9 } = await api("POST", `/api/work-nodes/${nodeA.id}/evaluate`, {
    verdict:       "pass",
    rating:        4,
    evaluatorId:   APPROVER.id,
    evaluatorName: APPROVER.name,
    note:          "Hồ sơ đầy đủ, đúng yêu cầu.",
  });
  ok("status Node A",    d9.node.status, "completed");
  ok("T1 status",        d9.node.t1Timeliness?.status, "on_time");
  ok("T2 rating",        d9.node.t2Quality?.rating, 4);
  ok("T2 verdict",       d9.node.t2Quality?.verdict, "pass");
  info("T1", d9.node.t1Timeliness);

  // ── 10. Kiểm tra Node B đã được unlock ────────────────────────────────────
  log("10", "Kiểm tra Node B → phải là pending (đã unlock)");
  // Chờ 1 giây để batch write hoàn tất
  await new Promise((r) => setTimeout(r, 1000));
  const { data: d10 } = await api("GET", `/api/work-nodes/${nodeB.id}`);
  ok("status Node B", d10.node.status, "pending");

  // ── Kết quả ──────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(50)}`);
  const total = passed + failed;
  if (failed === 0) {
    console.log(`${c.green}${c.bold}✓ PASSED ${passed}/${total} assertions${c.reset}\n`);
  } else {
    console.log(`${c.red}${c.bold}✗ FAILED ${failed}/${total} assertions${c.reset}\n`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(`\n${c.red}${c.bold}UNEXPECTED ERROR:${c.reset}`, err.message);
  process.exit(1);
});
