import { NextResponse, type NextRequest } from "next/server";
import { getSessionRole } from "@/server/auth/session";
import { openDocumentForDownload } from "@/server/services/document";

const notFound = () =>
  new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * Téléchargement d'un document EN FLUX (AGENTS.md §7-8) : session et accès vérifiés
 * par le service, journal document.downloaded, aucun lien SharePoint ni Graph exposé.
 * Même 404 pour « n'existe pas » et « pas autorisé » (AGENTS.md §2.9).
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ documentId: string }> }) {
  if (!(await getSessionRole())) return notFound();
  const { documentId } = await params;
  let file: Awaited<ReturnType<typeof openDocumentForDownload>> = null;
  try {
    file = await openDocumentForDownload(documentId);
  } catch {
    return notFound(); // notFound() d'assertMatterAccess ou erreur du dépôt : réponse identique
  }
  if (!file) return notFound();
  const ascii = file.fileName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return new NextResponse(file.body, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...(file.size ? { "Content-Length": String(file.size) } : {}),
    },
  });
}
