import "server-only";
import { serverEnv } from "@/server/env";
import { ClioManageClient } from "./clio/client";
import type { ClioManageGateway } from "./clio/gateway";
import { MockClioManageGateway } from "./clio/mock";
import type { DocumentStore } from "./sharepoint/gateway";
import { VaultTokenStore } from "./tokens/vault-store";
import { MockDocumentStore } from "./sharepoint/mock";
import type { OutlookCalendarGateway } from "./outlook/gateway";
import { MockOutlookCalendarGateway } from "./outlook/mock";
import type { AiDraftingGateway } from "./ai/gateway";
import { MockAiDraftingGateway } from "./ai/mock";

/**
 * Choix des implémentations (AGENTS.md §8) : INTEGRATION_MODE_<FOURNISSEUR>=mock|live,
 * « mock » par défaut. Une implémentation « live » absente fait ÉCHOUER le démarrage
 * de la fonctionnalité plutôt que de retomber silencieusement sur des données fictives.
 */
let documentStore: DocumentStore | undefined;

export function getDocumentStore(): DocumentStore {
  if (!documentStore) {
    if (serverEnv().INTEGRATION_MODE_SHAREPOINT === "live")
      throw new Error("SharePointDocumentStore non disponible avant la Phase 3 (ADR 0004).");
    documentStore = new MockDocumentStore();
  }
  return documentStore;
}

/** Clio Manage, région CA : client réel (mode live) ou faux Clio (mock, données fictives). */
export function getClioGateway(): ClioManageGateway {
  return serverEnv().INTEGRATION_MODE_CLIO === "live"
    ? new ClioManageClient(getClioTokenStore())
    : new MockClioManageGateway();
}

/**
 * Dépôt de documents dans Clio (ADR 0038) : écriture réelle seulement si Clio ET le dépôt sont en « live »
 * (accord du cabinet requis) ; sinon le simulateur, sans aucun envoi.
 */
export function getClioDocumentsGateway(): ClioManageGateway {
  const env = serverEnv();
  return env.INTEGRATION_MODE_CLIO === "live" && env.INTEGRATION_MODE_CLIO_DOCUMENTS === "live"
    ? new ClioManageClient(getClioTokenStore())
    : new MockClioManageGateway();
}

export function getClioTokenStore() {
  return new VaultTokenStore("clio_manage", "ca");
}

/**
 * Agendas Outlook du personnel (lot 4, ADR 0031) : simulateur seulement. L'implémentation Microsoft Graph
 * attend l'enregistrement de l'application par le cabinet (docs/outlook-integration.md) : « live » échoue.
 */
let outlook: OutlookCalendarGateway | undefined;

export function getOutlookGateway(): OutlookCalendarGateway {
  if (serverEnv().INTEGRATION_MODE_OUTLOOK === "live")
    throw new Error(
      "OutlookCalendarGateway réel non disponible avant l'accès Microsoft du cabinet (ADR 0031).",
    );
  outlook ??= new MockOutlookCalendarGateway();
  return outlook;
}

/**
 * Assistant de rédaction des contrats (ADR 0032) : simulateur seulement. OpenAI attend les décisions du
 * cabinet (données envoyées, conservation zéro, plafond de coût, Loi 25) : « live » échoue.
 */
let ai: AiDraftingGateway | undefined;

export function getAiGateway(): AiDraftingGateway {
  if (serverEnv().INTEGRATION_MODE_AI === "live")
    throw new Error("Assistant OpenAI non disponible avant les décisions du cabinet (ADR 0032).");
  ai ??= new MockAiDraftingGateway();
  return ai;
}
