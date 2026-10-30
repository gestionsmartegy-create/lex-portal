import { NextResponse, type NextRequest } from "next/server";
import { getSessionRole, getUser } from "@/server/auth/session";
import { hitRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";
import { readContractDocx } from "@/server/services/contract-workflow";

const notFound = () =>
  new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * Copie Word d'un contrat validé (ADR 0039) : personnel de l'équipe seulement (le service vérifie
 * l'accès au dossier d'abord), générée à la demande, journalisée « contract.docx_downloaded ».
 * Même 404 pour « n'existe pas » et « pas autorisé ».
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ contractId: string }> }) {
  const role = await getSessionRole();
  if (role !== "staff" && role !== "firm_admin") return notFound();
  const user = await getUser();
  if (!user || !(await hitRateLimit(`download:user:${user.id}`, RATE_LIMITS.documentDownloadByUser)))
    return new NextResponse("Too many requests", {
      status: 429,
      headers: { "Cache-Control": "no-store", "Retry-After": "600" },
    });
  const { contractId } = await params;
  let file: Awaited<ReturnType<typeof readContractDocx>> = null;
  try {
    file = await readContractDocx(contractId);
  } catch {
    return notFound();
  }
  if (!file) return notFound();
  return new NextResponse(new Uint8Array(file.body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="contrat-${contractId.slice(0, 8)}-v${file.version}.docx"`,
      "Content-Length": String(file.body.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
