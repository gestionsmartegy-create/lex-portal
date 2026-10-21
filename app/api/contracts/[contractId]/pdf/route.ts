import { NextResponse, type NextRequest } from "next/server";
import { getSessionRole, getUser } from "@/server/auth/session";
import { hitRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";
import { getContract } from "@/server/services/contracts";
import { assertStaffMatterAccess } from "@/server/services/matter-tracking";
import { readContractPdf } from "@/server/services/contract-workflow";

const notFound = () =>
  new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * PDF officiel d'un contrat (ADR 0036), EN FLUX depuis la base : session vérifiée, accès au dossier
 * vérifié d'abord pour le personnel, puis la base décide (équipe, ou client destinataire d'un contrat
 * envoyé) et journalise « contract.pdf_downloaded ». Même 404 pour « n'existe pas » et « pas autorisé ».
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ contractId: string }> }) {
  const role = await getSessionRole();
  if (!role) return notFound();
  const user = await getUser();
  if (!user || !(await hitRateLimit(`download:user:${user.id}`, RATE_LIMITS.documentDownloadByUser)))
    return new NextResponse("Too many requests", {
      status: 429,
      headers: { "Cache-Control": "no-store", "Retry-After": "600" },
    });
  const { contractId } = await params;
  let file: Awaited<ReturnType<typeof readContractPdf>> = null;
  try {
    if (role === "staff" || role === "firm_admin") {
      const loaded = await getContract(contractId);
      if (!loaded) return notFound();
      if (loaded.contract.matter && !(await assertStaffMatterAccess(loaded.contract.matter.id)))
        return notFound();
    }
    file = await readContractPdf(contractId);
  } catch {
    return notFound();
  }
  if (!file) return notFound();
  const name = `contrat-${contractId.slice(0, 8)}-v${file.version}.pdf`;
  return new NextResponse(new Uint8Array(file.body), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Content-Length": String(file.body.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
