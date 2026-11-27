import { describe, expect, it, vi } from "vitest";
import { OpenAiDraftingGateway } from "@/server/providers/ai/client";
import { AiError, type AiAssistInput } from "@/server/providers/ai/gateway";

// Valeur factice (aucun secret) : les tests n'appellent jamais OpenAI.
const KEY = "sk-test-0000000000000000000000";
const MODEL = "gpt-test";

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });

const chat = (content: string | null, extra: Record<string, unknown> = {}) =>
  json({ choices: [{ message: { content, ...extra }, finish_reason: "stop" }] });

type Call = { url: string; auth: string | null; body: Record<string, unknown> };

/** Faux OpenAI : répond par le handler et garde la trace des appels. */
function fakeFetch(handler: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: input.toString(),
      auth: new Headers(init?.headers).get("authorization"),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    return handler();
  }) as typeof fetch;
  return { impl, calls };
}

const input: AiAssistInput = {
  kind: "rephrase",
  language: "fr",
  sectionTitle: "Honoraires",
  text: "Le [masqué] paiera les honoraires de [client_name].",
  instruction: "Plus court",
};

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error instanceof AiError ? error.code : "OTHER";
  }
  return "NONE";
}

describe("OpenAiDraftingGateway.assist", () => {
  it("envoie le texte masqué au bon point d'accès, avec store: false, et renvoie la proposition", async () => {
    const { impl, calls } = fakeFetch(() => chat("  Proposition reformulée.  "));
    const gateway = new OpenAiDraftingGateway(KEY, MODEL, impl);
    expect(gateway.isMock).toBe(false);
    await expect(gateway.assist(input)).resolves.toBe("Proposition reformulée.");
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(call?.auth).toBe(`Bearer ${KEY}`);
    expect(call?.body.model).toBe(MODEL);
    expect(call?.body.store).toBe(false);
    const prompt = JSON.stringify(call?.body.messages);
    expect(prompt).toContain("[client_name]");
    expect(prompt).toContain("Plus court");
  });

  it("traduit vers l'autre langue que celle du contrat", async () => {
    const { impl, calls } = fakeFetch(() => chat("Fees"));
    await new OpenAiDraftingGateway(KEY, MODEL, impl).assist({ ...input, kind: "translate" });
    expect(JSON.stringify(calls[0]?.body.messages)).toContain("Langue de la réponse : anglais");
  });

  it.each([
    [429, "RATE_LIMITED"],
    [503, "RATE_LIMITED"],
    [401, "UNAVAILABLE"],
    [400, "UNAVAILABLE"],
    [500, "UNAVAILABLE"],
  ])("HTTP %i → %s", async (status, code) => {
    const { impl } = fakeFetch(() => json({ error: { message: "détail OpenAI" } }, { status }));
    expect(await codeOf(new OpenAiDraftingGateway(KEY, MODEL, impl).assist(input))).toBe(code);
  });

  it("journal de diagnostic : statut et code d'erreur OpenAI, jamais le message ni la clé", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { impl } = fakeFetch(() =>
      json(
        {
          error: {
            message: "Incorrect API key provided: sk-...",
            type: "invalid_request_error",
            code: "invalid_api_key",
          },
        },
        { status: 401 },
      ),
    );
    await codeOf(new OpenAiDraftingGateway(KEY, MODEL, impl).assist(input));
    const line = String(log.mock.calls.at(-1)?.[0]);
    expect(JSON.parse(line)).toEqual({
      event: "openai_request_failed",
      status: 401,
      code: "invalid_api_key",
    });
    expect(line).not.toContain("Incorrect");
    expect(line).not.toContain(KEY);
    log.mockRestore();
  });

  it("journal de diagnostic : code inconnu, illisible ou réponse coupée", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const last = () => JSON.parse(String(log.mock.calls.at(-1)?.[0])) as { status: number; code: string };
    const run = async (handler: () => Response) =>
      codeOf(new OpenAiDraftingGateway(KEY, MODEL, fakeFetch(handler).impl).assist(input));
    await run(() => json({ error: { code: "bad code with spaces <script>" } }, { status: 400 }));
    expect(last()).toEqual(expect.objectContaining({ status: 400, code: "unknown" }));
    await run(() => json({ error: { code: "sk-proj-abc123def456" } }, { status: 401 }));
    expect(last()).toEqual(expect.objectContaining({ status: 401, code: "unknown" }));
    await run(() => new Response("pas du JSON", { status: 404 }));
    expect(last()).toEqual(expect.objectContaining({ status: 404, code: "unknown" }));
    await run(() => json({ error: { type: "model_not_found" } }, { status: 404 }));
    expect(last().code).toBe("model_not_found");
    await run(() => json({ choices: [{ message: { content: "Coupé" }, finish_reason: "length" }] }));
    expect(last()).toEqual(expect.objectContaining({ status: 200, code: "length" }));
    log.mockRestore();
  });

  it("refuse une réponse mal formée, vide, coupée ou un refus du modèle", async () => {
    const cases = [
      () => json({ unexpected: true }),
      () => chat(""),
      () => chat(null, { refusal: "Je ne peux pas." }),
      () => json({ choices: [{ message: { content: "Texte coupé" }, finish_reason: "length" }] }),
      () => new Response("pas du JSON", { status: 200 }),
    ];
    for (const handler of cases) {
      const { impl } = fakeFetch(handler);
      expect(await codeOf(new OpenAiDraftingGateway(KEY, MODEL, impl).assist(input))).toBe("UPSTREAM");
    }
  });

  it("une panne réseau devient UPSTREAM, sans exposer la clé", async () => {
    const impl = (async () => {
      throw new TypeError(`fetch failed ${KEY}`);
    }) as typeof fetch;
    const error = await new OpenAiDraftingGateway(KEY, MODEL, impl).assist(input).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiError);
    expect(String((error as AiError).message)).not.toContain(KEY);
  });

  it("n'écrit ni la clé ni le texte dans les journaux", async () => {
    const spies = [vi.spyOn(console, "log"), vi.spyOn(console, "error"), vi.spyOn(console, "warn")];
    const { impl } = fakeFetch(() => json({}, { status: 500 }));
    await codeOf(new OpenAiDraftingGateway(KEY, MODEL, impl).assist(input));
    const logged = spies.flatMap((s) => s.mock.calls.flat().map(String)).join(" ");
    expect(logged).not.toContain(KEY);
    expect(logged).not.toContain("honoraires");
    spies.forEach((s) => s.mockRestore());
  });
});

describe("OpenAiDraftingGateway.generateTemplate", () => {
  const templateInput = {
    language: "en" as const,
    domain: "immigration",
    description: "Mandat de résidence",
  };

  it("demande une sortie structurée et renvoie les sections validées", async () => {
    const sections = [
      { title: "Parties", text: "Between the Firm and the Client." },
      { title: "Fees", text: "Fees are set out in Schedule A." },
    ];
    const { impl, calls } = fakeFetch(() => chat(JSON.stringify({ sections })));
    const result = await new OpenAiDraftingGateway(KEY, MODEL, impl).generateTemplate(templateInput);
    expect(result.sections).toEqual(sections);
    const format = calls[0]?.body.response_format as { type: string; json_schema: { strict: boolean } };
    expect(format.type).toBe("json_schema");
    expect(format.json_schema.strict).toBe(true);
  });

  it("refuse un JSON invalide ou un gabarit sans section", async () => {
    for (const content of ["pas du JSON", JSON.stringify({ sections: [] }), JSON.stringify({ other: 1 })]) {
      const { impl } = fakeFetch(() => chat(content));
      expect(await codeOf(new OpenAiDraftingGateway(KEY, MODEL, impl).generateTemplate(templateInput))).toBe(
        "UPSTREAM",
      );
    }
  });
});
