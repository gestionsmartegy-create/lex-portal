"use client";

import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

/**
 * Erreur dans le layout racine (ADR 0011) : next-intl et la charte ne sont plus
 * disponibles, d'où un rendu minimal, bilingue, lu directement dans messages/*.json.
 * Jamais le message technique : seulement l'empreinte `digest`.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  const ref = error.digest ?? "—";
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", color: "#0d1b3e", margin: 0 }}>
        <main
          id="main"
          style={{ maxWidth: 560, margin: "15vh auto", padding: "0 16px", textAlign: "center" }}
        >
          {[en, fr].map((m, i) => (
            <section key={i} lang={i === 0 ? "en" : "fr"} style={{ marginBottom: 32 }}>
              <h1 style={{ fontSize: 24 }}>{m.errors.unexpected.title}</h1>
              <p>{m.errors.unexpected.body}</p>
              <p style={{ fontFamily: "monospace", fontSize: 12 }}>
                {m.errors.unexpected.reference.replace("{digest}", ref)}
              </p>
            </section>
          ))}
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              background: "#0d1b3e",
              color: "#fff",
              border: 0,
              padding: "12px 24px",
              cursor: "pointer",
            }}
          >
            {en.errors.unexpected.retry} / {fr.errors.unexpected.retry}
          </button>
        </main>
      </body>
    </html>
  );
}
