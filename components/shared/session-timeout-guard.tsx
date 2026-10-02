"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertDialog } from "radix-ui";
import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  formatCountdown,
  HEARTBEAT_INTERVAL_MS,
  idlePhase,
  SESSION_CHANNEL,
  TIMEOUT_REASON,
} from "@/lib/session-timeout";

type Props = {
  locale: string;
  area: "portal" | "admin";
  keepAlive: () => Promise<{ status: "active" | "expired" }>;
  idleLogout: (formData: FormData) => Promise<void>;
  logout: (formData: FormData) => Promise<void>;
};

type ChannelMessage = { type: "activity"; at: number } | { type: "signed-out" };

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "touchstart"] as const;

/**
 * Déconnexion après 30 min d'inactivité (ADR 0012) — commodité côté navigateur.
 * La décision qui fait foi est prise par le serveur (public.touch_session).
 * - activité partagée entre onglets (BroadcastChannel) ;
 * - signal au serveur au plus une fois par minute ;
 * - à 28 min : fenêtre d'alerte avec compte à rebours de 2 min ; seul un clic la ferme ;
 * - à 30 min : déconnexion de cet appareil, journalisée, et des autres onglets.
 * Le nonce CSP de la fenêtre Radix est fourni par <StyleNonce /> (même gabarit).
 */
export function SessionTimeoutGuard({ locale, area, keepAlive, idleLogout, logout }: Props) {
  const t = useTranslations("auth.session");
  const router = useRouter();
  // Initialisés au montage (useEffect) : Date.now() est interdit pendant le rendu.
  const lastActivity = useRef(0);
  const lastHeartbeat = useRef(0);
  const warningOpen = useRef(false);
  const ended = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const idleForm = useRef<HTMLFormElement>(null);
  const stayButton = useRef<HTMLButtonElement>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [announce, setAnnounce] = useState("");

  const loginPath = `/${locale}/${area === "admin" ? "staff/login" : "login"}?reason=${TIMEOUT_REASON}`;

  const goToExpired = useCallback(() => {
    if (ended.current) return;
    ended.current = true;
    const params = new URLSearchParams({ locale, ...(area === "admin" ? { area: "admin" } : {}) });
    // Route Handler (pas une page) : navigation complète requise pour qu'il pose ses cookies.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/api/auth/session-expired?${params.toString()}`);
  }, [area, locale]);

  const heartbeat = useCallback(async () => {
    lastHeartbeat.current = Date.now();
    try {
      const { status } = await keepAlive();
      if (status === "expired") goToExpired();
    } catch {
      // Réseau indisponible : le prochain signal ou le serveur trancheront.
    }
  }, [goToExpired, keepAlive]);

  const recordActivity = useCallback(
    (at: number, broadcast: boolean) => {
      if (warningOpen.current || ended.current) return;
      lastActivity.current = Math.max(lastActivity.current, at);
      if (broadcast) channel.current?.postMessage({ type: "activity", at } satisfies ChannelMessage);
      if (Date.now() - lastHeartbeat.current >= HEARTBEAT_INTERVAL_MS) void heartbeat();
    },
    [heartbeat],
  );

  const stay = useCallback(() => {
    warningOpen.current = false;
    setRemainingMs(null);
    setAnnounce("");
    const now = Date.now();
    lastActivity.current = now;
    channel.current?.postMessage({ type: "activity", at: now } satisfies ChannelMessage);
    void heartbeat();
  }, [heartbeat]);

  useEffect(() => {
    const mountedAt = Date.now();
    lastActivity.current = mountedAt;
    lastHeartbeat.current = mountedAt;
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel(SESSION_CHANNEL);
      channel.current.onmessage = (event: MessageEvent<ChannelMessage>) => {
        if (event.data.type === "signed-out") {
          ended.current = true;
          router.replace(loginPath);
        } else if (event.data.type === "activity") {
          // Activité dans un autre onglet : elle ferme aussi l'alerte ici.
          warningOpen.current = false;
          setRemainingMs(null);
          lastActivity.current = Math.max(lastActivity.current, event.data.at);
        }
      };
    }
    const onActivity = () => recordActivity(Date.now(), true);
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { passive: true });

    const tick = () => {
      if (ended.current) return;
      const phase = idlePhase(Date.now() - lastActivity.current);
      if (phase.phase === "expired") {
        ended.current = true;
        channel.current?.postMessage({ type: "signed-out" } satisfies ChannelMessage);
        idleForm.current?.requestSubmit();
      } else if (phase.phase === "warning") {
        if (!warningOpen.current) {
          warningOpen.current = true;
          setAnnounce(t("remainingAnnounce", { seconds: Math.ceil(phase.remainingMs / 1000) }));
        } else if (phase.remainingMs <= 30_000 && phase.remainingMs > 29_000) {
          setAnnounce(t("remainingAnnounce", { seconds: 30 }));
        }
        setRemainingMs(phase.remainingMs);
      }
    };
    const timer = window.setInterval(tick, 1000);
    // Retour sur l'onglet après une longue absence : réévaluer tout de suite (sans compter d'activité).
    const onVisible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity);
      channel.current?.close();
    };
  }, [loginPath, recordActivity, router, t]);

  return (
    <>
      <form ref={idleForm} action={idleLogout} hidden>
        <input type="hidden" name="locale" value={locale} />
        {area === "admin" ? <input type="hidden" name="area" value="admin" /> : null}
      </form>
      <AlertDialog.Root open={remainingMs !== null}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-marine/60" />
          <AlertDialog.Content
            className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[4px] border border-gold/40 bg-white p-6 shadow-xl sm:p-8"
            onEscapeKeyDown={(e) => e.preventDefault()}
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              stayButton.current?.focus();
            }}
          >
            <div className="flex items-center gap-3">
              <Clock aria-hidden className="size-6 shrink-0 text-gold-ink" />
              <AlertDialog.Title className="font-display text-xl font-bold text-marine">
                {t("warningTitle")}
              </AlertDialog.Title>
            </div>
            <AlertDialog.Description className="mt-3 text-sm text-ink-muted">
              {t("warningBody")}
            </AlertDialog.Description>
            <p className="mt-5 font-mono text-3xl font-semibold text-marine tabular-nums" aria-hidden>
              {formatCountdown(remainingMs ?? 0)}
            </p>
            <p className="sr-only">{t("remaining", { time: formatCountdown(remainingMs ?? 0) })}</p>
            <p className="sr-only" aria-live="polite">
              {announce}
            </p>
            {/* Boutons empilés (libellés longs en français) ; « Rester connecté » reçoit le focus. */}
            <div className="mt-6 flex flex-col gap-3">
              <AlertDialog.Action asChild>
                <Button
                  ref={stayButton}
                  type="button"
                  variant="primary"
                  size="brand"
                  className="w-full"
                  onClick={stay}
                >
                  {t("stay")}
                </Button>
              </AlertDialog.Action>
              <form action={logout}>
                <input type="hidden" name="locale" value={locale} />
                <AlertDialog.Cancel asChild>
                  <Button type="submit" variant="outline-gold" size="brand" className="w-full">
                    {t("signOut")}
                  </Button>
                </AlertDialog.Cancel>
              </form>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
