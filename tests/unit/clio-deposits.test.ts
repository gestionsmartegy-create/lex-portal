import { beforeEach, describe, expect, it, vi } from "vitest";

// Dépôt immédiat du contrat validé dans Clio (ADR 0045) : planifié après la réponse, jamais bloquant.
const scheduled: (() => Promise<void>)[] = [];
vi.mock("next/server", () => ({ after: (fn: () => Promise<void>) => void scheduled.push(fn) }));
const rpc = vi.fn();
const serverRpc = vi.fn();
const upload = vi.fn();
let isMock = false;
vi.mock("@/server/auth/session", () => ({ getSessionRole: vi.fn(async () => "staff") }));
vi.mock("@/server/db/server-client", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ rpc: serverRpc })),
}));
vi.mock("@/server/db/service-client", () => ({ createSupabaseServiceClient: vi.fn(() => ({ rpc })) }));
vi.mock("@/server/providers", () => ({
  getClioDocumentsGateway: () => ({ isMock, uploadDocument: upload }),
}));

const { depositInBackground, retryDeposit } = await import("@/server/services/clio-deposits");
const DEPOSIT = "5b0c1d2e-3f40-4a5b-8c6d-7e8f9a0b1c2d";

beforeEach(() => {
  scheduled.length = 0;
  rpc.mockReset();
  serverRpc.mockReset();
  upload.mockReset();
  isMock = false;
});

describe("dépôt Clio en arrière-plan", () => {
  it("ne fait rien tout de suite : le dépôt part après la réponse", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          id: DEPOSIT,
          clio_matter_id: "123",
          previous_document_id: null,
          file_name: "c.pdf",
          pdf_base64: "JVBERg==",
        },
      ],
      error: null,
    });
    upload.mockResolvedValue(987);
    depositInBackground();
    expect(rpc).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
    await scheduled[0]!();
    expect(rpc).toHaveBeenCalledWith("contract_deposit_claim", { p_limit: 5 });
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({ matterId: 123, contentType: "application/pdf" }),
    );
    expect(rpc).toHaveBeenCalledWith(
      "contract_deposit_result",
      expect.objectContaining({ p_ok: true, p_external_id: "987" }),
    );
  });

  it("simulateur (accord du cabinet absent) : aucune réservation ni dépôt", async () => {
    isMock = true;
    depositInBackground();
    await scheduled[0]!();
    expect(rpc).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("une erreur inattendue est journalisée sans remonter", async () => {
    rpc.mockRejectedValue(new Error("boom"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    depositInBackground();
    await expect(scheduled[0]!()).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("contract_deposits_failed"));
    log.mockRestore();
  });

  it("« Réessayer » réussi relance le dépôt aussitôt ; refusé, rien n'est planifié", async () => {
    serverRpc.mockResolvedValueOnce({ error: null });
    expect(await retryDeposit(DEPOSIT)).toEqual({ ok: true });
    expect(scheduled).toHaveLength(1);
    serverRpc.mockResolvedValueOnce({ error: { code: "P0002" } });
    expect(await retryDeposit(DEPOSIT)).toEqual({ ok: false });
    expect(scheduled).toHaveLength(1);
  });
});
