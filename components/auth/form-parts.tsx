"use client";

import { ArrowRight, CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { InputHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function Field({
  id,
  label,
  aside,
  hint,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; aside?: ReactNode; hint?: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-xs font-semibold tracking-[0.05em] text-marine uppercase">
          {label}
        </Label>
        {aside}
      </div>
      <Input
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="h-11 rounded-[2px] border-gray-200 bg-white focus-visible:border-gold focus-visible:ring-gold/30"
        {...input}
      />
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function SubmitButton({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  const t = useTranslations("auth.common");
  return (
    <Button
      type="submit"
      variant="primary"
      size="brand"
      className="w-full"
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? t("submitting") : children}
      {pending ? null : <ArrowRight aria-hidden />}
    </Button>
  );
}

export function FormAlert({ message, tone = "error" }: { message?: string; tone?: "error" | "info" }) {
  if (!message) return null;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={
        tone === "error"
          ? "flex items-start gap-2 rounded-[2px] border border-status-urgent/30 bg-status-urgent/5 p-3 text-sm text-[#B91C1C]"
          : "rounded-[2px] border border-gold/40 bg-cream p-3 text-sm text-marine"
      }
    >
      {tone === "error" ? <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" /> : null}
      <span>{message}</span>
    </div>
  );
}
