/** État renvoyé par les Server Actions (défini côté serveur ; miroir côté interface). */
export type FormState = { error?: string; ok?: boolean };
export type FormAction = (state: FormState, formData: FormData) => Promise<FormState>;
