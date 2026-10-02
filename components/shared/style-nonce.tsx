"use client";

import { useEffect } from "react";
import { setNonce } from "get-nonce";

/**
 * Fenêtres et menus Radix injectent un <style> (verrouillage du défilement). On leur donne
 * le nonce du DOCUMENT, lu sur les scripts de Next.js : après une navigation côté client,
 * la CSP reste celle du premier chargement (ADR 0012). Aucun 'unsafe-inline'.
 */
export function StyleNonce() {
  useEffect(() => {
    const nonce = document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce;
    if (nonce) setNonce(nonce);
  }, []);
  return null;
}
