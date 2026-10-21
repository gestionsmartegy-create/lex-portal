/** État lisible d'un contrat pour le client (ADR 0035) : à accepter, à signer dans Clio, accepté. */
export function clientContractState(c: {
  status: "sent" | "signed" | "declined";
  signing_mode: "clio" | "portal";
}) {
  if (c.status === "signed") return "accepted" as const;
  if (c.status === "declined") return "declined" as const;
  return c.signing_mode === "portal" ? ("toAccept" as const) : ("toSignClio" as const);
}
