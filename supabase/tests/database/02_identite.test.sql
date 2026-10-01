-- Identité et rôles : création des profils, garde de domaine, colonnes protégées.
-- Scénarios : T1, T2, T12, T13, T26 · security.md 8 et 9.
begin;
\ir _fixture.psql
select plan(10);

-- T1 : rôles attribués à la création
select is((select role::text || '/' || status::text from public.profiles where email = 'wilson@lexcanadalaw.com'),
  'staff/active', 'T1 · Entra ID + domaine autorisé → staff actif');
select is((select role::text || '/' || status::text from public.profiles where email = 'intrus@gmail.com'),
  'client/suspended', 'T1 · security.md 8 · Entra ID hors domaine → client suspendu');
select is((select role::text from public.profiles where email = 'john@example.com'),
  'client', 'T1 · inscription e-mail → client');
select ok((select role = 'firm_admin' from public.profiles where email = 'admin@lexcanadalaw.com'),
  'firm_admin attribué uniquement par le serveur');
select ok(exists (select 1 from public.notification_preferences np
  join public.profiles p on p.id = np.user_id where p.email = 'john@example.com'),
  'Préférences de notification créées avec le profil');

-- T2 : même le serveur ne peut pas donner un rôle personnel hors domaine
select throws_ok(
  $$ update public.profiles set role = 'staff' where email = 'intrus@gmail.com' $$,
  'P0001', null, 'T2 · rôle staff refusé pour un domaine non autorisé');

-- T26 · security.md 9 : compte suspendu = aucun accès, même en aal2
select tests.authenticate_as('00000000-0000-0000-0000-00000000000d', 'aal2');
select is((select count(*) from public.matters), 0::bigint, 'T26 · security.md 9 · compte hors domaine : aucun dossier');
select tests.clear_authentication();

-- T12 / T13 : le client modifie ses informations, jamais son rôle
select tests.authenticate_as('00000000-0000-0000-0000-000000000001');
select throws_ok(
  $$ update public.profiles set role = 'firm_admin' where id = auth.uid() $$,
  '42501', null, 'T12 · un client ne peut pas changer son rôle');
select lives_ok(
  $$ update public.profiles set first_name = 'John' where id = auth.uid() $$,
  'T13 · un client peut modifier son prénom');
select is((select first_name from public.profiles where id = auth.uid()), 'John', 'T13 · modification enregistrée');
select tests.clear_authentication();

select * from finish();
rollback;
