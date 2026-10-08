-- ============================================================================
-- Espace « Dossier » (ADR 0020), suite de la revue de sécurité et de la QA :
--  - à la création, une demande naît « en attente » : aucun document lié n'est accepté ;
--  - le document lié doit appartenir au même dossier ET ne pas être interne au cabinet
--    (sous-dossier « internal ») : une demande faite au client ne pointe jamais vers une note interne.
-- ============================================================================

create or replace function private.guard_document_request_document()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.fulfilled_document_id := null;
    return new;
  end if;
  if new.fulfilled_document_id is not null
     and new.fulfilled_document_id is distinct from old.fulfilled_document_id then
    if not exists (select 1 from public.documents d
                    where d.id = new.fulfilled_document_id
                      and d.matter_id = new.matter_id
                      and d.folder <> 'internal') then
      raise exception 'Le document doit appartenir au même dossier et ne pas être interne'
        using errcode = '42501';
    end if;
    new.status := 'fulfilled';
  end if;
  return new;
end $$;

-- Le trigger couvre désormais la création ET la modification (toujours avant document_requests_guard).
drop trigger document_requests_document on public.document_requests;
create trigger document_requests_document before insert or update on public.document_requests
  for each row execute function private.guard_document_request_document();
