import "server-only";
import { serverEnv } from "@/server/env";
import { ClioManageClient } from "./clio/client";
import type { ClioManageGateway } from "./clio/gateway";
import { MockClioManageGateway } from "./clio/mock";
import type { DocumentStore } from "./sharepoint/gateway";
import { VaultTokenStore } from "./tokens/vault-store";
import { MockDocumentStore } from "./sharepoint/mock";

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

export function getClioTokenStore() {
  return new VaultTokenStore("clio_manage", "ca");
}
