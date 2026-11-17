import { adminOrResponse } from "@/lib/admin-auth";
import { renderReportPdf } from "@/lib/pdf/report-pdf";

/** Download the saved report as a PDF (no submitted photos), to email to the user. */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/submissions/[id]/pdf">) {
  const admin = await adminOrResponse();
  if (admin instanceof Response) return admin;

  const { id } = await ctx.params;
  try {
    const result = await renderReportPdf(id);
    if (!result) return Response.json({ error: "Save the report before exporting it." }, { status: 404 });
    return new Response(new Uint8Array(result.pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${result.fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("export report pdf", e);
    return Response.json({ error: "Couldn't build the PDF. Try again." }, { status: 500 });
  }
}
