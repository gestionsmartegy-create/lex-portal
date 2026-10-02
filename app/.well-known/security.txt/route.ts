import { buildSecurityTxt } from "@/lib/security-txt";
import { serverEnv } from "@/server/env";

// Recalculé à chaque requête : le champ Expires reste toujours dans le futur.
export const dynamic = "force-dynamic";

export function GET() {
  return new Response(buildSecurityTxt(serverEnv().APP_BASE_URL), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" },
  });
}
