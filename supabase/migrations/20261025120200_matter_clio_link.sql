-- ADR 0038 : `matters.clio_matter_id` n'est pas lisible par l'API (droits par colonne, ADR 0009).
-- L'équipe du dossier (ou le firm_admin) en a besoin pour l'agenda Clio et le lien « Ouvrir dans Clio » :
-- lecture par une fonction qui revérifie l'accès au dossier.
create or replace function public.matter_clio_id(p_matter uuid)
returns text language sql stable security definer set search_path = '' as $$
  select m.clio_matter_id from public.matters m
   where m.id = p_matter
     and (private.is_firm_admin() or private.is_on_matter_team(p_matter))
$$;
revoke all on function public.matter_clio_id(uuid) from public, anon;
grant execute on function public.matter_clio_id(uuid) to authenticated;
