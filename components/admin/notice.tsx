import { FormAlert } from "@/components/auth/form-parts";

/** Résultat d'une action par formulaire (?notice=…) ; libellé déjà traduit. */
export function Notice({ message, error }: { message?: string; error?: boolean }) {
  if (!message) return null;
  return (
    <div className="mb-6">
      <FormAlert message={message} tone={error ? "error" : "info"} />
    </div>
  );
}
