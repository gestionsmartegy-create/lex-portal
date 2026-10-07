-- ============================================================================
-- Contenu initial des modèles de dossiers (ADR 0019) : PREMIÈRE VERSION À VALIDER PAR LE CABINET.
-- Types repris de lexcanadalaw.com/expertise. Étapes, documents et champs proposés ;
-- le firm_admin les ajuste ensuite dans l'espace cabinet (« Modèles de dossiers »).
-- Idempotent : rien n'est inséré si un type du même code existe déjà.
-- ============================================================================

-- Immigration — Permis d'études ou de travail
with t as (insert into public.matter_types (code, practice_group, name_fr, name_en, position)
  values ('immigration_permits', 'legal', 'Immigration — Permis d''études ou de travail', 'Immigration — Study or Work Permit', 1) on conflict (code) do nothing returning id)
, s0 as (insert into public.matter_type_steps (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Consultation initiale et mandat', 'Initial consultation and retainer'),
    (2, 'Évaluation de l''admissibilité', 'Eligibility assessment'),
    (3, 'Collecte des documents', 'Document collection'),
    (4, 'Préparation de la demande', 'Application preparation'),
    (5, 'Dépôt de la demande auprès d''IRCC', 'Application submitted to IRCC'),
    (6, 'Biométrie et examen médical (si requis)', 'Biometrics and medical exam (if required)'),
    (7, 'Décision d''IRCC', 'IRCC decision'),
    (8, 'Clôture du dossier', 'File closing')) as v(p, fr, en)
  returning 1)
, d1 as (insert into public.matter_type_documents (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Passeport valide (toutes les pages)', 'Valid passport (all pages)'),
    (2, 'Photos conformes aux normes d''IRCC', 'IRCC-compliant photos'),
    (3, 'Lettre d''admission ou offre d''emploi', 'Letter of acceptance or job offer'),
    (4, 'Preuve de fonds (relevés bancaires)', 'Proof of funds (bank statements)'),
    (5, 'Diplômes et relevés de notes', 'Diplomas and transcripts')) as v(p, fr, en)
  returning 1)
insert into public.matter_type_fields (matter_type_id, position, label_fr, label_en, kind, visible_to_client)
  select t.id, v.p, v.fr, v.en, v.k, v.vis from t, (values
    (1, 'Numéro d''identification client (IUC)', 'Unique client identifier (UCI)', 'text', true),
    (2, 'Numéro de la demande', 'Application number', 'text', true),
    (3, 'Date de dépôt', 'Submission date', 'date', true)) as v(p, fr, en, k, vis);

-- Immigration — Résidence permanente (Entrée express, PCP)
with t as (insert into public.matter_types (code, practice_group, name_fr, name_en, position)
  values ('immigration_pr', 'legal', 'Immigration — Résidence permanente (Entrée express, PCP)', 'Immigration — Permanent Residence (Express Entry, PNP)', 2) on conflict (code) do nothing returning id)
, s0 as (insert into public.matter_type_steps (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Consultation initiale et mandat', 'Initial consultation and retainer'),
    (2, 'Évaluation du profil et du programme', 'Profile and program assessment'),
    (3, 'Tests de langue et évaluation des diplômes', 'Language tests and credential assessment'),
    (4, 'Création du profil Entrée express ou demande au PCP', 'Express Entry profile or PNP application'),
    (5, 'Invitation à présenter une demande', 'Invitation to apply'),
    (6, 'Collecte des documents', 'Document collection'),
    (7, 'Dépôt de la demande de résidence permanente', 'Permanent residence application submitted'),
    (8, 'Biométrie et examen médical', 'Biometrics and medical exam'),
    (9, 'Décision et confirmation de résidence permanente', 'Decision and confirmation of permanent residence'),
    (10, 'Clôture du dossier', 'File closing')) as v(p, fr, en)
  returning 1)
, d1 as (insert into public.matter_type_documents (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Passeport valide (toutes les pages)', 'Valid passport (all pages)'),
    (2, 'Résultats de test de langue', 'Language test results'),
    (3, 'Évaluation des diplômes d''études (EDE)', 'Educational credential assessment (ECA)'),
    (4, 'Lettres de référence d''emploi', 'Employment reference letters'),
    (5, 'Certificats de police', 'Police certificates'),
    (6, 'Preuve de fonds', 'Proof of funds')) as v(p, fr, en)
  returning 1)
insert into public.matter_type_fields (matter_type_id, position, label_fr, label_en, kind, visible_to_client)
  select t.id, v.p, v.fr, v.en, v.k, v.vis from t, (values
    (1, 'Numéro d''identification client (IUC)', 'Unique client identifier (UCI)', 'text', true),
    (2, 'Programme visé', 'Target program', 'text', true),
    (3, 'Score SCG', 'CRS score', 'number', true),
    (4, 'Date de dépôt', 'Submission date', 'date', true)) as v(p, fr, en, k, vis);

-- Immigration — Asile et motifs d'ordre humanitaire
with t as (insert into public.matter_types (code, practice_group, name_fr, name_en, position)
  values ('immigration_refugee', 'legal', 'Immigration — Asile et motifs d''ordre humanitaire', 'Immigration — Refugee and Humanitarian Claims', 3) on conflict (code) do nothing returning id)
, s0 as (insert into public.matter_type_steps (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Consultation initiale et mandat', 'Initial consultation and retainer'),
    (2, 'Rencontre et analyse du récit', 'Meeting and narrative review'),
    (3, 'Formulaire Fondement de la demande d''asile', 'Basis of Claim form'),
    (4, 'Collecte de la preuve documentaire', 'Documentary evidence collection'),
    (5, 'Dépôt de la demande', 'Claim filed'),
    (6, 'Préparation à l''audience', 'Hearing preparation'),
    (7, 'Audience devant la CISR', 'IRB hearing'),
    (8, 'Décision', 'Decision'),
    (9, 'Clôture du dossier', 'File closing')) as v(p, fr, en)
  returning 1)
, d1 as (insert into public.matter_type_documents (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Pièces d''identité', 'Identity documents'),
    (2, 'Preuves à l''appui du récit', 'Evidence supporting the narrative'),
    (3, 'Rapports médicaux ou psychologiques (si disponibles)', 'Medical or psychological reports (if available)')) as v(p, fr, en)
  returning 1)
insert into public.matter_type_fields (matter_type_id, position, label_fr, label_en, kind, visible_to_client)
  select t.id, v.p, v.fr, v.en, v.k, v.vis from t, (values
    (1, 'Numéro de dossier de la CISR', 'IRB file number', 'text', true),
    (2, 'Date de l''audience', 'Hearing date', 'date', true)) as v(p, fr, en, k, vis);

-- Immigration — Parrainage familial et appels
with t as (insert into public.matter_types (code, practice_group, name_fr, name_en, position)
  values ('immigration_sponsorship', 'legal', 'Immigration — Parrainage familial et appels', 'Immigration — Family Sponsorship and Appeals', 4) on conflict (code) do nothing returning id)
, s0 as (insert into public.matter_type_steps (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Consultation initiale et mandat', 'Initial consultation and retainer'),
    (2, 'Évaluation de l''admissibilité du répondant', 'Sponsor eligibility assessment'),
    (3, 'Collecte des documents', 'Document collection'),
    (4, 'Préparation de la demande de parrainage', 'Sponsorship application preparation'),
    (5, 'Dépôt auprès d''IRCC', 'Submitted to IRCC'),
    (6, 'Traitement et demandes de renseignements', 'Processing and information requests'),
    (7, 'Décision', 'Decision'),
    (8, 'Clôture du dossier', 'File closing')) as v(p, fr, en)
  returning 1)
, d1 as (insert into public.matter_type_documents (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Preuve de citoyenneté ou de résidence permanente du répondant', 'Sponsor''s proof of citizenship or permanent residence'),
    (2, 'Preuve de la relation (mariage, union, photos)', 'Proof of relationship (marriage, union, photos)'),
    (3, 'Avis de cotisation (impôt)', 'Notices of assessment (tax)'),
    (4, 'Passeport de la personne parrainée', 'Sponsored person''s passport')) as v(p, fr, en)
  returning 1)
insert into public.matter_type_fields (matter_type_id, position, label_fr, label_en, kind, visible_to_client)
  select t.id, v.p, v.fr, v.en, v.k, v.vis from t, (values
    (1, 'Numéro de la demande', 'Application number', 'text', true),
    (2, 'Date de dépôt', 'Submission date', 'date', true)) as v(p, fr, en, k, vis);

-- Immigration — Citoyenneté, renouvellement RP, contrôle judiciaire
with t as (insert into public.matter_types (code, practice_group, name_fr, name_en, position)
  values ('immigration_citizenship', 'legal', 'Immigration — Citoyenneté, renouvellement RP, contrôle judiciaire', 'Immigration — Citizenship, PR Renewal, Federal Court Review', 5) on conflict (code) do nothing returning id)
, s0 as (insert into public.matter_type_steps (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Consultation initiale et mandat', 'Initial consultation and retainer'),
    (2, 'Analyse de la situation', 'Situation review'),
    (3, 'Collecte des documents', 'Document collection'),
    (4, 'Préparation et dépôt de la demande', 'Application preparation and filing'),
    (5, 'Suivi auprès d''IRCC ou de la Cour fédérale', 'Follow-up with IRCC or the Federal Court'),
    (6, 'Décision', 'Decision'),
    (7, 'Clôture du dossier', 'File closing')) as v(p, fr, en)
  returning 1)
, d1 as (insert into public.matter_type_documents (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Carte de résident permanent', 'Permanent resident card'),
    (2, 'Historique des voyages', 'Travel history'),
    (3, 'Décision contestée (contrôle judiciaire)', 'Decision under review (judicial review)')) as v(p, fr, en)
  returning 1)
insert into public.matter_type_fields (matter_type_id, position, label_fr, label_en, kind, visible_to_client)
  select t.id, v.p, v.fr, v.en, v.k, v.vis from t, (values
    (1, 'Numéro de dossier IRCC ou de la Cour fédérale', 'IRCC or Federal Court file number', 'text', true)) as v(p, fr, en, k, vis);

-- Litige civil
with t as (insert into public.matter_types (code, practice_group, name_fr, name_en, position)
  values ('civil_litigation', 'legal', 'Litige civil', 'Civil Litigation', 6) on conflict (code) do nothing returning id)
, s0 as (insert into public.matter_type_steps (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Consultation initiale et mandat', 'Initial consultation and retainer'),
    (2, 'Analyse du dossier et stratégie', 'Case review and strategy'),
    (3, 'Mise en demeure', 'Demand letter'),
    (4, 'Procédures introductives', 'Originating proceedings'),
    (5, 'Communication de la preuve', 'Disclosure of evidence'),
    (6, 'Négociation ou médiation', 'Negotiation or mediation'),
    (7, 'Audience ou procès', 'Hearing or trial'),
    (8, 'Jugement et exécution', 'Judgment and enforcement'),
    (9, 'Clôture du dossier', 'File closing')) as v(p, fr, en)
  returning 1)
, d1 as (insert into public.matter_type_documents (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Contrats et correspondance pertinents', 'Relevant contracts and correspondence'),
    (2, 'Preuves (factures, photos, courriels)', 'Evidence (invoices, photos, emails)'),
    (3, 'Procédures reçues', 'Proceedings received')) as v(p, fr, en)
  returning 1)
insert into public.matter_type_fields (matter_type_id, position, label_fr, label_en, kind, visible_to_client)
  select t.id, v.p, v.fr, v.en, v.k, v.vis from t, (values
    (1, 'Numéro de dossier de la cour', 'Court file number', 'text', true),
    (2, 'Tribunal', 'Court', 'text', true),
    (3, 'Prochaine date d''audience', 'Next hearing date', 'date', true)) as v(p, fr, en, k, vis);

-- Droit de la famille
with t as (insert into public.matter_types (code, practice_group, name_fr, name_en, position)
  values ('family', 'legal', 'Droit de la famille', 'Family Law', 7) on conflict (code) do nothing returning id)
, s0 as (insert into public.matter_type_steps (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Consultation initiale et mandat', 'Initial consultation and retainer'),
    (2, 'Consultation et analyse de la situation familiale', 'Consultation and family situation review'),
    (3, 'Divulgation financière', 'Financial disclosure'),
    (4, 'Négociation ou médiation', 'Negotiation or mediation'),
    (5, 'Procédures judiciaires (si nécessaire)', 'Court proceedings (if needed)'),
    (6, 'Entente ou jugement', 'Agreement or judgment'),
    (7, 'Clôture du dossier', 'File closing')) as v(p, fr, en)
  returning 1)
, d1 as (insert into public.matter_type_documents (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Déclarations de revenus (3 dernières années)', 'Tax returns (last 3 years)'),
    (2, 'Relevés bancaires et de placements', 'Bank and investment statements'),
    (3, 'Certificat de mariage (si applicable)', 'Marriage certificate (if applicable)')) as v(p, fr, en)
  returning 1)
insert into public.matter_type_fields (matter_type_id, position, label_fr, label_en, kind, visible_to_client)
  select t.id, v.p, v.fr, v.en, v.k, v.vis from t, (values
    (1, 'Numéro de dossier de la cour', 'Court file number', 'text', true),
    (2, 'Prochaine date d''audience', 'Next hearing date', 'date', true)) as v(p, fr, en, k, vis);

-- Planification successorale
with t as (insert into public.matter_types (code, practice_group, name_fr, name_en, position)
  values ('estate', 'legal', 'Planification successorale', 'Estate Planning', 8) on conflict (code) do nothing returning id)
, s0 as (insert into public.matter_type_steps (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Consultation initiale et mandat', 'Initial consultation and retainer'),
    (2, 'Entrevue et inventaire du patrimoine', 'Interview and estate inventory'),
    (3, 'Rédaction du testament et des procurations', 'Drafting of will and powers of attorney'),
    (4, 'Révision par le client', 'Client review'),
    (5, 'Signature devant témoins', 'Signing before witnesses'),
    (6, 'Conservation des documents', 'Safekeeping of documents'),
    (7, 'Clôture du dossier', 'File closing')) as v(p, fr, en)
  returning 1)
insert into public.matter_type_documents (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Pièce d''identité', 'Identification'),
    (2, 'Liste des biens et des dettes', 'List of assets and debts'),
    (3, 'Testament antérieur (si existant)', 'Previous will (if any)')) as v(p, fr, en);

-- Droit immobilier
with t as (insert into public.matter_types (code, practice_group, name_fr, name_en, position)
  values ('real_estate', 'legal', 'Droit immobilier', 'Real Estate Law', 9) on conflict (code) do nothing returning id)
, s0 as (insert into public.matter_type_steps (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Consultation initiale et mandat', 'Initial consultation and retainer'),
    (2, 'Examen de la convention d''achat', 'Review of the purchase agreement'),
    (3, 'Recherche de titres', 'Title search'),
    (4, 'Coordination avec le prêteur', 'Coordination with the lender'),
    (5, 'Signature des documents', 'Signing of documents'),
    (6, 'Clôture de la transaction', 'Closing of the transaction'),
    (7, 'Enregistrement et rapport final', 'Registration and final report'),
    (8, 'Clôture du dossier', 'File closing')) as v(p, fr, en)
  returning 1)
, d1 as (insert into public.matter_type_documents (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Convention d''achat et de vente', 'Agreement of purchase and sale'),
    (2, 'Instructions hypothécaires', 'Mortgage instructions'),
    (3, 'Preuve d''assurance habitation', 'Proof of home insurance'),
    (4, 'Pièces d''identité', 'Identification')) as v(p, fr, en)
  returning 1)
insert into public.matter_type_fields (matter_type_id, position, label_fr, label_en, kind, visible_to_client)
  select t.id, v.p, v.fr, v.en, v.k, v.vis from t, (values
    (1, 'Adresse de l''immeuble', 'Property address', 'text', true),
    (2, 'Date de clôture', 'Closing date', 'date', true)) as v(p, fr, en, k, vis);

-- Droit criminel et fédéral
with t as (insert into public.matter_types (code, practice_group, name_fr, name_en, position)
  values ('criminal', 'legal', 'Droit criminel et fédéral', 'Criminal and Federal Law', 10) on conflict (code) do nothing returning id)
, s0 as (insert into public.matter_type_steps (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Consultation initiale et mandat', 'Initial consultation and retainer'),
    (2, 'Consultation et analyse des accusations', 'Consultation and review of charges'),
    (3, 'Obtention de la divulgation de la preuve', 'Obtaining disclosure'),
    (4, 'Analyse de la preuve et stratégie', 'Evidence review and strategy'),
    (5, 'Négociations avec la Couronne', 'Negotiations with the Crown'),
    (6, 'Procès ou règlement', 'Trial or resolution'),
    (7, 'Détermination de la peine (si applicable)', 'Sentencing (if applicable)'),
    (8, 'Clôture du dossier', 'File closing')) as v(p, fr, en)
  returning 1)
, d1 as (insert into public.matter_type_documents (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Documents de mise en liberté et conditions', 'Release documents and conditions'),
    (2, 'Assignation ou citation à comparaître', 'Summons or appearance notice')) as v(p, fr, en)
  returning 1)
insert into public.matter_type_fields (matter_type_id, position, label_fr, label_en, kind, visible_to_client)
  select t.id, v.p, v.fr, v.en, v.k, v.vis from t, (values
    (1, 'Numéro de dossier de la cour', 'Court file number', 'text', true),
    (2, 'Prochaine comparution', 'Next court appearance', 'date', true)) as v(p, fr, en, k, vis);

-- Droit constitutionnel
with t as (insert into public.matter_types (code, practice_group, name_fr, name_en, position)
  values ('constitutional', 'legal', 'Droit constitutionnel', 'Constitutional Law', 11) on conflict (code) do nothing returning id)
insert into public.matter_type_steps (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Consultation initiale et mandat', 'Initial consultation and retainer'),
    (2, 'Analyse juridique', 'Legal analysis'),
    (3, 'Avis ou procédures', 'Opinion or proceedings'),
    (4, 'Audience', 'Hearing'),
    (5, 'Décision', 'Decision'),
    (6, 'Clôture du dossier', 'File closing')) as v(p, fr, en);

-- Droit du travail
with t as (insert into public.matter_types (code, practice_group, name_fr, name_en, position)
  values ('labour', 'legal', 'Droit du travail', 'Labour Law', 12) on conflict (code) do nothing returning id)
, s0 as (insert into public.matter_type_steps (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Consultation initiale et mandat', 'Initial consultation and retainer'),
    (2, 'Analyse de la situation d''emploi', 'Employment situation review'),
    (3, 'Mise en demeure ou réponse', 'Demand letter or response'),
    (4, 'Négociation', 'Negotiation'),
    (5, 'Plainte ou procédure (si nécessaire)', 'Complaint or proceeding (if needed)'),
    (6, 'Règlement ou décision', 'Settlement or decision'),
    (7, 'Clôture du dossier', 'File closing')) as v(p, fr, en)
  returning 1)
insert into public.matter_type_documents (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Contrat de travail', 'Employment contract'),
    (2, 'Relevé d''emploi et talons de paie', 'Record of employment and pay stubs'),
    (3, 'Correspondance avec l''employeur', 'Correspondence with the employer')) as v(p, fr, en);

-- Services notariaux
with t as (insert into public.matter_types (code, practice_group, name_fr, name_en, position)
  values ('notarial', 'legal', 'Services notariaux', 'Notarial Services', 13) on conflict (code) do nothing returning id)
, s0 as (insert into public.matter_type_steps (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Consultation initiale et mandat', 'Initial consultation and retainer'),
    (2, 'Réception des documents', 'Documents received'),
    (3, 'Vérification de l''identité', 'Identity verification'),
    (4, 'Certification ou attestation', 'Certification or attestation'),
    (5, 'Remise des documents', 'Documents returned'),
    (6, 'Clôture du dossier', 'File closing')) as v(p, fr, en)
  returning 1)
insert into public.matter_type_documents (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Documents à certifier', 'Documents to be certified'),
    (2, 'Pièce d''identité avec photo', 'Photo identification')) as v(p, fr, en);

-- Gouvernance d'entreprise
with t as (insert into public.matter_types (code, practice_group, name_fr, name_en, position)
  values ('corporate_governance', 'business', 'Gouvernance d''entreprise', 'Corporate Governance', 14) on conflict (code) do nothing returning id)
, s0 as (insert into public.matter_type_steps (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Consultation initiale et mandat', 'Initial consultation and retainer'),
    (2, 'Analyse de la structure', 'Structure review'),
    (3, 'Constitution ou mise à jour des statuts', 'Incorporation or update of articles'),
    (4, 'Règlements et convention entre actionnaires', 'By-laws and shareholders'' agreement'),
    (5, 'Registres et résolutions', 'Records and resolutions'),
    (6, 'Livraison du livre de la société', 'Delivery of the minute book'),
    (7, 'Clôture du dossier', 'File closing')) as v(p, fr, en)
  returning 1)
, d1 as (insert into public.matter_type_documents (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Statuts et certificat de constitution', 'Articles and certificate of incorporation'),
    (2, 'Registre des actionnaires et des administrateurs', 'Register of shareholders and directors')) as v(p, fr, en)
  returning 1)
insert into public.matter_type_fields (matter_type_id, position, label_fr, label_en, kind, visible_to_client)
  select t.id, v.p, v.fr, v.en, v.k, v.vis from t, (values
    (1, 'Dénomination sociale', 'Corporate name', 'text', true),
    (2, 'Numéro d''entreprise', 'Business number', 'text', true)) as v(p, fr, en, k, vis);

-- Droit bancaire et financier
with t as (insert into public.matter_types (code, practice_group, name_fr, name_en, position)
  values ('banking_finance', 'business', 'Droit bancaire et financier', 'Banking and Finance Law', 15) on conflict (code) do nothing returning id)
, s0 as (insert into public.matter_type_steps (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Consultation initiale et mandat', 'Initial consultation and retainer'),
    (2, 'Analyse de l''opération', 'Transaction review'),
    (3, 'Négociation des modalités', 'Negotiation of terms'),
    (4, 'Rédaction des conventions', 'Drafting of agreements'),
    (5, 'Vérifications et sûretés', 'Due diligence and security'),
    (6, 'Signature et clôture', 'Signing and closing'),
    (7, 'Clôture du dossier', 'File closing')) as v(p, fr, en)
  returning 1)
insert into public.matter_type_documents (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'États financiers', 'Financial statements'),
    (2, 'Lettre d''offre ou d''engagement', 'Offer or commitment letter')) as v(p, fr, en);

-- Fusions et acquisitions
with t as (insert into public.matter_types (code, practice_group, name_fr, name_en, position)
  values ('mna', 'business', 'Fusions et acquisitions', 'M&A Transactions', 16) on conflict (code) do nothing returning id)
, s0 as (insert into public.matter_type_steps (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Consultation initiale et mandat', 'Initial consultation and retainer'),
    (2, 'Lettre d''intention', 'Letter of intent'),
    (3, 'Vérification diligente', 'Due diligence'),
    (4, 'Rédaction de la convention d''achat', 'Drafting of the purchase agreement'),
    (5, 'Négociation', 'Negotiation'),
    (6, 'Clôture', 'Closing'),
    (7, 'Intégration post-clôture', 'Post-closing integration'),
    (8, 'Clôture du dossier', 'File closing')) as v(p, fr, en)
  returning 1)
, d1 as (insert into public.matter_type_documents (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'États financiers (3 dernières années)', 'Financial statements (last 3 years)'),
    (2, 'Contrats importants', 'Material contracts'),
    (3, 'Livre de la société', 'Minute book')) as v(p, fr, en)
  returning 1)
insert into public.matter_type_fields (matter_type_id, position, label_fr, label_en, kind, visible_to_client)
  select t.id, v.p, v.fr, v.en, v.k, v.vis from t, (values
    (1, 'Date de clôture visée', 'Target closing date', 'date', true)) as v(p, fr, en, k, vis);

-- Conformité réglementaire
with t as (insert into public.matter_types (code, practice_group, name_fr, name_en, position)
  values ('regulatory', 'business', 'Conformité réglementaire', 'Regulatory Compliance', 17) on conflict (code) do nothing returning id)
, s0 as (insert into public.matter_type_steps (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Consultation initiale et mandat', 'Initial consultation and retainer'),
    (2, 'Diagnostic de conformité', 'Compliance assessment'),
    (3, 'Plan de mise en conformité', 'Compliance plan'),
    (4, 'Mise en œuvre', 'Implementation'),
    (5, 'Suivi et rapport', 'Monitoring and report'),
    (6, 'Clôture du dossier', 'File closing')) as v(p, fr, en)
  returning 1)
insert into public.matter_type_documents (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Politiques internes existantes', 'Existing internal policies')) as v(p, fr, en);

-- Droit fiscal
with t as (insert into public.matter_types (code, practice_group, name_fr, name_en, position)
  values ('tax', 'business', 'Droit fiscal', 'Tax Law', 18) on conflict (code) do nothing returning id)
, s0 as (insert into public.matter_type_steps (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Consultation initiale et mandat', 'Initial consultation and retainer'),
    (2, 'Analyse de la situation fiscale', 'Tax situation review'),
    (3, 'Planification ou opposition', 'Planning or objection'),
    (4, 'Représentations auprès de l''ARC', 'Representations to the CRA'),
    (5, 'Règlement ou décision', 'Settlement or decision'),
    (6, 'Clôture du dossier', 'File closing')) as v(p, fr, en)
  returning 1)
insert into public.matter_type_documents (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Avis de cotisation', 'Notices of assessment'),
    (2, 'Correspondance de l''ARC', 'CRA correspondence')) as v(p, fr, en);

-- Immigration économique
with t as (insert into public.matter_types (code, practice_group, name_fr, name_en, position)
  values ('economic_immigration', 'business', 'Immigration économique', 'Economic Immigration', 19) on conflict (code) do nothing returning id)
, s0 as (insert into public.matter_type_steps (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Consultation initiale et mandat', 'Initial consultation and retainer'),
    (2, 'Analyse du projet d''affaires', 'Business project review'),
    (3, 'Évaluation de l''admissibilité', 'Eligibility assessment'),
    (4, 'Préparation du plan d''affaires et des documents', 'Business plan and document preparation'),
    (5, 'Dépôt de la demande', 'Application submitted'),
    (6, 'Décision', 'Decision'),
    (7, 'Clôture du dossier', 'File closing')) as v(p, fr, en)
  returning 1)
, d1 as (insert into public.matter_type_documents (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Plan d''affaires', 'Business plan'),
    (2, 'Preuve de fonds', 'Proof of funds'),
    (3, 'Passeport', 'Passport')) as v(p, fr, en)
  returning 1)
insert into public.matter_type_fields (matter_type_id, position, label_fr, label_en, kind, visible_to_client)
  select t.id, v.p, v.fr, v.en, v.k, v.vis from t, (values
    (1, 'Numéro d''identification client (IUC)', 'Unique client identifier (UCI)', 'text', true)) as v(p, fr, en, k, vis);

-- Mobilité internationale
with t as (insert into public.matter_types (code, practice_group, name_fr, name_en, position)
  values ('international_mobility', 'business', 'Mobilité internationale', 'International Mobility', 20) on conflict (code) do nothing returning id)
, s0 as (insert into public.matter_type_steps (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Consultation initiale et mandat', 'Initial consultation and retainer'),
    (2, 'Analyse des besoins de l''employeur', 'Employer needs assessment'),
    (3, 'Choix de la voie (EIMT ou dispense)', 'Pathway choice (LMIA or exemption)'),
    (4, 'Préparation des demandes', 'Application preparation'),
    (5, 'Dépôt', 'Submission'),
    (6, 'Décision', 'Decision'),
    (7, 'Clôture du dossier', 'File closing')) as v(p, fr, en)
  returning 1)
, d1 as (insert into public.matter_type_documents (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Offre d''emploi', 'Job offer'),
    (2, 'Passeport du travailleur', 'Worker''s passport')) as v(p, fr, en)
  returning 1)
insert into public.matter_type_fields (matter_type_id, position, label_fr, label_en, kind, visible_to_client)
  select t.id, v.p, v.fr, v.en, v.k, v.vis from t, (values
    (1, 'Numéro de l''EIMT ou de l''offre d''emploi', 'LMIA or job offer number', 'text', true)) as v(p, fr, en, k, vis);

-- Succession d'entreprise
with t as (insert into public.matter_types (code, practice_group, name_fr, name_en, position)
  values ('business_succession', 'business', 'Succession d''entreprise', 'Business Succession', 21) on conflict (code) do nothing returning id)
, s0 as (insert into public.matter_type_steps (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Consultation initiale et mandat', 'Initial consultation and retainer'),
    (2, 'Diagnostic de l''entreprise', 'Business assessment'),
    (3, 'Choix du scénario de relève', 'Succession scenario selection'),
    (4, 'Structure juridique et fiscale', 'Legal and tax structure'),
    (5, 'Documents de transfert', 'Transfer documents'),
    (6, 'Transfert et suivi', 'Transfer and follow-up'),
    (7, 'Clôture du dossier', 'File closing')) as v(p, fr, en)
  returning 1)
insert into public.matter_type_documents (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'États financiers', 'Financial statements'),
    (2, 'Convention entre actionnaires', 'Shareholders'' agreement')) as v(p, fr, en);

-- Direction juridique externe
with t as (insert into public.matter_types (code, practice_group, name_fr, name_en, position)
  values ('external_gc', 'advisory', 'Direction juridique externe', 'External General Counsel', 22) on conflict (code) do nothing returning id)
insert into public.matter_type_steps (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Consultation initiale et mandat', 'Initial consultation and retainer'),
    (2, 'Rencontre de démarrage', 'Kick-off meeting'),
    (3, 'Revue des besoins juridiques', 'Legal needs review'),
    (4, 'Plan d''accompagnement', 'Support plan'),
    (5, 'Suivi périodique', 'Periodic review'),
    (6, 'Clôture du dossier', 'File closing')) as v(p, fr, en);

-- Conseils consultatifs
with t as (insert into public.matter_types (code, practice_group, name_fr, name_en, position)
  values ('advisory_boards', 'advisory', 'Conseils consultatifs', 'Advisory Boards', 23) on conflict (code) do nothing returning id)
insert into public.matter_type_steps (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Consultation initiale et mandat', 'Initial consultation and retainer'),
    (2, 'Définition du mandat', 'Mandate definition'),
    (3, 'Composition du conseil', 'Board composition'),
    (4, 'Première réunion', 'First meeting'),
    (5, 'Suivi', 'Follow-up'),
    (6, 'Clôture du dossier', 'File closing')) as v(p, fr, en);

-- Conseil aux dirigeants
with t as (insert into public.matter_types (code, practice_group, name_fr, name_en, position)
  values ('executive_advisory', 'advisory', 'Conseil aux dirigeants', 'Executive Advisory', 24) on conflict (code) do nothing returning id)
insert into public.matter_type_steps (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Consultation initiale et mandat', 'Initial consultation and retainer'),
    (2, 'Rencontre initiale', 'Initial meeting'),
    (3, 'Analyse et recommandations', 'Analysis and recommendations'),
    (4, 'Accompagnement', 'Support'),
    (5, 'Bilan', 'Review'),
    (6, 'Clôture du dossier', 'File closing')) as v(p, fr, en);

-- Gestion des risques
with t as (insert into public.matter_types (code, practice_group, name_fr, name_en, position)
  values ('risk_management', 'advisory', 'Gestion des risques', 'Risk Management', 25) on conflict (code) do nothing returning id)
insert into public.matter_type_steps (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Consultation initiale et mandat', 'Initial consultation and retainer'),
    (2, 'Cartographie des risques', 'Risk mapping'),
    (3, 'Recommandations', 'Recommendations'),
    (4, 'Mise en œuvre des mesures', 'Implementation of measures'),
    (5, 'Suivi', 'Follow-up'),
    (6, 'Clôture du dossier', 'File closing')) as v(p, fr, en);

-- Croissance et expansion
with t as (insert into public.matter_types (code, practice_group, name_fr, name_en, position)
  values ('growth', 'advisory', 'Croissance et expansion', 'Growth and Expansion', 26) on conflict (code) do nothing returning id)
insert into public.matter_type_steps (matter_type_id, position, title_fr, title_en)
  select t.id, v.p, v.fr, v.en from t, (values
    (1, 'Consultation initiale et mandat', 'Initial consultation and retainer'),
    (2, 'Analyse du projet de croissance', 'Growth project review'),
    (3, 'Structure et financement', 'Structure and financing'),
    (4, 'Contrats et partenariats', 'Contracts and partnerships'),
    (5, 'Lancement et suivi', 'Launch and follow-up'),
    (6, 'Clôture du dossier', 'File closing')) as v(p, fr, en);
