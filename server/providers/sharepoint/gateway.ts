import "server-only";

/**
 * Dépôt documentaire (docs/class-diagram.md, DocumentStore ; ADR 0004).
 * Le contenu passe TOUJOURS en flux par le serveur : jamais d'URL SharePoint ni de
 * downloadUrl Graph vers le navigateur (AGENTS.md §8).
 */
export type DocumentLocation = { driveId: string | null; itemId: string | null };

export type DocumentContent = { body: ReadableStream<Uint8Array>; contentType: string; size?: number };

export interface DocumentStore {
  openContent(
    location: DocumentLocation,
    meta: { displayName: string; mimeType: string | null },
  ): Promise<DocumentContent>;
}
