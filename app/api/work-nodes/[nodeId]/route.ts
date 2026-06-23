/**
 * GET   /api/work-nodes/[nodeId]  — Lấy chi tiết node
 * PATCH /api/work-nodes/[nodeId]  — Cập nhật checklist / actualCost / progress
 */
import { NextRequest, NextResponse } from "next/server";
import {
  getWorkNode,
  updateNodeChecklist,
  updateNodeCost,
} from "@/lib/firebase/workNodes";
import { updateDoc, doc } from "firebase/firestore";
import { getDb } from "@/lib/firebase/config";
import type { NodeChecklistItem } from "@/types";

type Params = { params: { nodeId: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const node = await getWorkNode(params.nodeId);
    if (!node) return NextResponse.json({ error: "Node không tồn tại." }, { status: 404 });
    return NextResponse.json({ node });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const body = await req.json() as {
      checklist?: NodeChecklistItem[];
      actualCost?: number;
      status?: "in_progress";   // Chỉ cho phép chuyển sang in_progress qua PATCH
      progress?: number;
      name?: string;
      description?: string;
      dueDate?: string;
      startDate?: string;
    };

    const node = await getWorkNode(params.nodeId);
    if (!node) return NextResponse.json({ error: "Node không tồn tại." }, { status: 404 });

    // Cập nhật checklist → tự tính progress
    if (body.checklist !== undefined) {
      await updateNodeChecklist(params.nodeId, body.checklist);
    }

    // Cập nhật chi phí thực tế → tự tính T3
    let t3Resources;
    if (body.actualCost !== undefined) {
      if (body.actualCost < 0) {
        return NextResponse.json({ error: "actualCost không được âm." }, { status: 400 });
      }
      const result = await updateNodeCost(params.nodeId, body.actualCost);
      t3Resources = result?.t3Resources;
    }

    // Chuyển trạng thái pending → in_progress (người thực hiện bắt đầu)
    if (body.status === "in_progress") {
      if (!["pending", "rejected"].includes(node.status)) {
        return NextResponse.json(
          { error: `Không thể bắt đầu node đang ở trạng thái "${node.status}".` },
          { status: 409 }
        );
      }
      await updateDoc(doc(getDb(), "workNodes", params.nodeId), {
        status: "in_progress",
        updatedAt: new Date().toISOString(),
      });
    }

    // Cập nhật các trường meta
    const metaUpdates: Record<string, unknown> = {};
    if (body.name) metaUpdates.name = body.name;
    if (body.description !== undefined) metaUpdates.description = body.description;
    if (body.dueDate) {
      if (isNaN(Date.parse(body.dueDate))) {
        return NextResponse.json({ error: "dueDate không hợp lệ." }, { status: 400 });
      }
      metaUpdates.dueDate = body.dueDate;
    }
    if (body.startDate) {
      if (isNaN(Date.parse(body.startDate))) {
        return NextResponse.json({ error: "startDate không hợp lệ." }, { status: 400 });
      }
      metaUpdates.startDate = body.startDate;
    }
    if (Object.keys(metaUpdates).length > 0) {
      metaUpdates.updatedAt = new Date().toISOString();
      await updateDoc(doc(getDb(), "workNodes", params.nodeId), metaUpdates);
    }

    const updated = await getWorkNode(params.nodeId);
    return NextResponse.json({
      node: updated,
      ...(t3Resources ? { t3Resources } : {}),
      message: "Cập nhật thành công.",
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
