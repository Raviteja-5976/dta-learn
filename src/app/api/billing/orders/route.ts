import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { createCourseOrder } from "@/lib/billing/service";
import { HttpError, assertSameOrigin, handle, readJson } from "@/lib/http";

/** Create a Razorpay Order for a course and return the Checkout options. */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const viewer = await getViewer();
    if (!viewer) throw new HttpError(401, "Sign in required");
    const { courseId } = await readJson(request, z.object({ courseId: z.uuid() }));
    return Response.json(await createCourseOrder(viewer, courseId));
  });
}
