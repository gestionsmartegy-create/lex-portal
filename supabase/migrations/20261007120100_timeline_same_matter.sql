-- ============================================================================
-- Suivi du dossier (ADR 0018), suite de la revue de sécurité :
-- une étape ne change jamais de dossier. Sinon l'avancement de l'ancien dossier resterait
-- faux et le déplacement ne serait pas journalisé.
-- Précision sur 20261007120000 : matters.progress_percent n'est jamais écrit par l'application,
-- mais l'équipe garde techniquement le droit de modifier matters (schéma initial) ; la valeur
-- est recalculée au changement d'étape suivant. Restreindre ce droit par colonne : à décider
-- par le responsable technique.
-- ============================================================================

create or replace function private.guard_timeline_matter()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.matter_id is distinct from old.matter_id then
    raise exception 'Une étape ne peut pas changer de dossier' using errcode = '42501';
  end if;
  return new;
end $$;

revoke all on function private.guard_timeline_matter() from public;

create trigger matter_timeline_same_matter before update on public.matter_timeline_steps
  for each row execute function private.guard_timeline_matter();
