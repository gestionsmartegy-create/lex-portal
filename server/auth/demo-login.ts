import "server-only";
import { serverEnv } from "@/server/env";

/**
 * Connexion de démonstration du personnel (comptes *.test, mot de passe) : en développement,
 * ou sur le serveur de TEST si STAFF_DEMO_LOGIN=enabled (ADR 0016). Double verrou : la base
 * n'accorde des droits par mot de passe qu'aux domaines `allow_password` (seed de démonstration
 * seulement), et l'action refuse toute adresse hors *.test.
 */
export function staffDemoLoginEnabled(env = serverEnv()): boolean {
  return env.NODE_ENV === "development" || env.STAFF_DEMO_LOGIN === "enabled";
}
