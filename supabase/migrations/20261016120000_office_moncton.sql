-- Bureaux (ADR 0024) : siège social de Moncton et adresses publiées sur lexcanadalaw.com/contact
-- (confirmé par le responsable le 2026-10-16). Montréal reste sans adresse, en attente du cabinet.

-- Moncton (siège social) en premier dans les listes.
update public.offices set position = position + 1;
insert into public.offices (name_fr, name_en, city, province, timezone, address, position) values
  ('Moncton (siège social)', 'Moncton (head office)', 'Moncton', 'NB', 'America/Halifax',
   '15 John St., Moncton, NB E1C 2G7', 1)
on conflict do nothing;

update public.offices set address = '1959 Upper Water Street, Suite 1301, Tower 1, Halifax, NS B3J 3N2'
 where name_en = 'Halifax' and address is null;
update public.offices set address = '1 Rue Rideau, 7th & 8th Floor, Ottawa, ON K1N 8S7'
 where name_en = 'Ottawa' and address is null;

-- Tribunaux du Nouveau-Brunswick (liste de départ, à valider par le cabinet).
update public.courts set position = position + 3 where province <> 'NS';
insert into public.courts (name_fr, name_en, province, timezone, position) values
  ('Cour du Banc du Roi du Nouveau-Brunswick', 'Court of King''s Bench of New Brunswick', 'NB', 'America/Halifax', 4),
  ('Cour provinciale du Nouveau-Brunswick', 'Provincial Court of New Brunswick', 'NB', 'America/Halifax', 5),
  ('Cour d''appel du Nouveau-Brunswick', 'Court of Appeal of New Brunswick', 'NB', 'America/Halifax', 6)
on conflict do nothing;
