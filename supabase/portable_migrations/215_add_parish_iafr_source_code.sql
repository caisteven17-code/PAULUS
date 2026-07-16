-- Add the official IAFR/source parish code to parish details and use the same
-- value as the parish institution code.
--
-- Examples: D3-62, D3-71, D2-41.
--
-- These are the official parish codes from the finance workbook format. For
-- parishes, diocese.institutions.institution_code should also use this D#-#
-- value instead of the older generated P-#### code. The PUSHER can then use it
-- as the safest parish matching key before falling back to aliases or names.

BEGIN;

ALTER TABLE parishes.details
  ADD COLUMN IF NOT EXISTS iafr_source_code text;

COMMENT ON COLUMN parishes.details.iafr_source_code IS
  'Official parish source code used in IAFR/PUSHER finance workbooks, such as D3-62 or D2-41.';

CREATE TEMP TABLE _official_iafr_parishes (
  source_code text PRIMARY KEY,
  source_name text NOT NULL,
  institution_name text NOT NULL,
  vicariate text NOT NULL
) ON COMMIT DROP;

INSERT INTO _official_iafr_parishes (
  source_code,
  source_name,
  institution_name,
  vicariate
)
VALUES
  ('D1-1', 'SAN PEDRO APOSTOL, San Pedro', 'San Pedro Apostol Parish', 'San Pedro Apostol'),
  ('D1-2', 'DIOCESAN SHRINE OF JESUS IN THE HOLY SEPULCHRE, Landayan', 'Diocesan Shrine of Jesus in the Holy Sepulcher', 'San Pedro Apostol'),
  ('D1-3', 'SANTO ROSARYO, Pacita I, San Pedro', 'Sto. Rosario Parish', 'San Pedro Apostol'),
  ('D1-4', 'SAN LORENZO RUIZ, Pacita 2-A, San Pedro', 'San Lorenzo Ruiz Parish', 'San Pedro Apostol'),
  ('D1-5', 'OUR LADY''S ASSUMPTION, Aurora Village, San Pedro', 'Our Lady''s Assumption Parish', 'San Pedro Apostol'),
  ('D1-6', 'OUR LADY OF LOURDES, United San Pedro, San Pedro', 'Our Lady of Lourdes Parish', 'San Pedro Apostol'),
  ('D1-7', 'OUR LADY OF FATIMA, Elvinda Village, San Pedro', 'Our Lady of Fatima Parish', 'San Pedro Apostol'),
  ('D1-8', 'HOLY FAMILY, Sampaguita Village, San Pedro', 'Holy Family Parish', 'Holy Family'),
  ('D1-9', 'MOTHER OF GOOD COUNSEL, Chrysanthemum,San Pedro', 'Mother of Good Counsel Parish', 'Holy Family'),
  ('D1-10', 'CHRIST THE KING, GSIS Village, San Pedro', 'Christ the King Parish', 'Holy Family'),
  ('D1-11', 'SAN MARTIN DE PORRES, Adelina Village, San Pedro', 'San Martin de Porres Parish', 'Holy Family'),
  ('D1-12', 'MOST HOLY NAME OF JESUS, Narra, San Pedro', 'Most Holy Name of Jesus Parish', 'Holy Family'),
  ('D1-13', 'ST. JOSEPH THE PATRIARCH, Langgam, San Pedro', 'St. Joseph the Patriarch Parish', 'Holy Family'),
  ('D1-14', 'ST. JOSEPH THE WORKER, Calendola, San Pedro', 'St. Joseph the Worker Parish', 'Holy Family'),
  ('D1-15', 'OUR LADY OF THE MOST HOLY ROSARY, Rosario,San Pedro', 'Our Lady of the Most Holy Rosary Parish', 'Holy Family'),
  ('D1-16', 'SAN ISIDRO LABRADOR, Biñan', 'Diocesan Shrine of San Isidro Labrador', 'San Isidro Labrador'),
  ('D1-17', 'NUESTRA SEÑORA DELA PAZ, Dela Paz, Biñan', 'Nuestra Señora Dela Paz Y Buen Viaje Parish', 'San Isidro Labrador'),
  ('D1-18', 'SAN VICENTE FERRER, San Vicente, Biñan', 'San Vicente Ferrer Parish', 'San Isidro Labrador'),
  ('D1-19', 'ST. MOTHER TERESA OF CALCUTTA, Timbao, Biñan', 'Mother Teresa of Calcutta Parish', 'San Isidro Labrador'),
  ('D1-20', 'RISEN LORD, Town & Country Southville, Biñan', 'Parish of the Risen Lord', 'San Isidro Labrador'),
  ('D1-21', 'SAN ANTONIO DE PADUA, San Antonio, Biñan', 'San Antonio de Padua Parish', 'San Isidro Labrador'),
  ('D1-22', 'SAINT JOSEPH THE WORKER, Olivarez, Biñan', 'Parokya ng San Jose Manggagawa', 'San Isidro Labrador'),
  ('D1-23', 'BLESSED SACRAMENT, South City Homes, Biñan', 'Blessed Sacrament Parish', 'San Isidro Labrador'),
  ('D1-24', 'STO. NIÑO DE CEBU, Juana Complex, Biñan', 'Sto. Niño de Cebu Parish', 'San Isidro Labrador'),
  ('D1-25', 'SAN PEDRO APOSTOL, Malaban, Biñan', 'San Pedro Apostol Parish', 'San Isidro Labrador'),
  ('D1-26', 'OUR LADY OF THE MIRACULOUS MEDAL, Ireneville, Biñan', 'Our Lady of the Miraculous Medal Parish', 'San Isidro Labrador'),
  ('D2-27', 'SANTA ROSA DE LIMA, Sta. Rosa', 'Sta. Rosa de Lima Parish', 'Sta. Rosa De Lima'),
  ('D2-28', 'CHAIR OF ST. PETER, Balibago, Sta. Rosa', 'Chair of St. Peter Parish', 'Sta. Rosa De Lima'),
  ('D2-29', 'SAN LORENZO RUIZ, San Lorenzo Village, Sta. Rosa', 'San Lorenzo Ruiz Parish', 'Sta. Rosa De Lima'),
  ('D2-30', 'ST. JOHN BOSCO, Sta. Rosa Village, Sta. Rosa', 'St. John Bosco Parish', 'Sta. Rosa De Lima'),
  ('D2-31', 'OUR LADY OF THE MOST HOLY ROSARY, Golden City, Sta. Rosa', 'Our Lady of the Most Holy Rosary Parish', 'Sta. Rosa De Lima'),
  ('D2-32', 'OUR MOTHER OF PERPETUAL HELP, Laguna Bel-Air, Sta. Rosa', 'Our Mother of Perpetual Help Parish', 'Sta. Rosa De Lima'),
  ('D2-33', 'ST. POLYCARP, Cabuyao', 'St. Polycarp Parish', 'St. Polycarp'),
  ('D2-34', 'ST. FRANCIS OF ASSISI, Pulo, Cabuyao', 'St. Francis of Assisi Parish', 'St. Polycarp'),
  ('D2-35', 'DIOCESAN SHRINE OF SAN VICENTE FERRER, Mamatid, Cabuyao', 'Diocesan Shrine of San Vicente Ferrer', 'St. Polycarp'),
  ('D2-36', 'SAN MIGUEL ARKANGHEL, Banlic, Calamba', 'San Miguel Arkanghel Parish', 'St. Polycarp'),
  ('D2-37', 'MARY HELP OF CHRISTIANS, Southville, Cabuyao', 'Mary Help of Christians Parish', 'St. Polycarp'),
  ('D2-38', 'ST. JOSEPH THE WORKER, Bigaa, Cabuyao', 'St. Joseph the Worker Parish', 'St. Polycarp'),
  ('D2-39', 'SAN RAFAEL ARKANGHEL, Gulod, Cabuyao', 'San Rafael Arkanghel Parish', 'St. Polycarp'),
  ('D2-40', 'SAN JUAN BAUTISTA, Calamba', 'St. John the Baptist Parish', 'St. John the Baptist'),
  ('D2-41', 'STS. PETER & PAUL, Aplaya, Calamba', 'Sts. Peter and Paul Parish', 'St. John the Baptist'),
  ('D2-42', 'SAN JOSE MANGGAGAWA, Canlubang, Calamba', 'St. Joseph the Worker Parish', 'St. John the Baptist'),
  ('D2-43', 'SAN VICENTE FERRER, Real, Calamba', 'San Vicente Ferrer Parish', 'St. John the Baptist'),
  ('D2-44', 'SAN PEDRO CALUNGSOD, Villa De Calamba, Calamba', 'San Pedro Calungsod Parish', 'St. John the Baptist'),
  ('D2-45', 'SAN AGUSTIN, Parian, Calamba', 'San Agustin Parish', 'St. John the Baptist'),
  ('D2-46', 'MARY HELP OF CHRISTIANS, Mayapa, Calamba', 'Mary Help of Christians Parish', 'St. John the Baptist'),
  ('D2-47', 'HOLY TRINITY, Pansol, Calamba', 'Holy Trinity Parish', 'St. John the Baptist'),
  ('D2-48', 'OUR LADY OF FATIMA, Lawa, Calamba', 'Our Lady of Fatima Parish', 'St. John the Baptist'),
  ('D2-49', 'SAN ISIDRO LABRADOR, Makiling, Calamba', 'San Isidro Labrador Parish', 'St. John the Baptist'),
  ('D2-50', 'ST. MARY MAGDALENE, Looc, Calamba', 'St. Mary Magdalene Parish', 'St. John the Baptist'),
  ('D2-51', 'IMMACULATE CONCEPTION, Los Baños', 'Immaculate Conception Parish', 'Immaculate Conception'),
  ('D2-52', 'ST. THERESE OF THE CHILD JESUS, UPLB, Los Baños', 'Diocesan Shrine of St. Therese of the Child Jesus', 'Immaculate Conception'),
  ('D2-53', 'SAN ANTONIO DE PADUA, San Antonio, Los Baños', 'San Antonio De Padua Parish', 'Immaculate Conception'),
  ('D2-54', 'SAN AGUSTIN, Bay', 'San Agustin Parish', 'Immaculate Conception'),
  ('D2-55', 'SAN NICOLAS DE TOLENTINO, Masaya, Bay', 'San Nicholas De Tolentino Parish', 'Immaculate Conception'),
  ('D2-56', 'SAN ISIDRO LABRADOR, Calauan', 'San Isidro Labrador Parish', 'Immaculate Conception'),
  ('D3-57', 'CATHEDRAL OF ST. PAUL THE FIRST HERMIT, SPC', 'Cathedral Parish of St. Paul the First Hermit', 'St. Paul the First Hermit'),
  ('D3-58', 'NUESTRA SEÑORA DELOS REMEDIOS, Del Remedio, SPC', 'Nuestra Señora de Los Remedios Parish', 'St. Paul the First Hermit'),
  ('D3-59', 'ST. FRANCIS OF ASSISI, Calihan, SPC', 'St. Francis of Assisi Parish', 'St. Paul the First Hermit'),
  ('D3-60', 'SAN ROQUE, San Roque, SPC', 'San Roque Parish', 'St. Paul the First Hermit'),
  ('D3-61', 'ST. LUKE THE EVANGELIST, San Lucas, SPC', 'St. Luke the Evangelist Parish', 'St. Paul the First Hermit'),
  ('D3-62', 'IMMACULATE CONCEPTION, Concepcion, SPC', 'Immaculate Conception Parish', 'St. Paul the First Hermit'),
  ('D3-63', 'SAN GABRIEL ARKANGHEL, San Gabriel, SPC', 'San Gabriel Arkanghel Parish', 'St. Paul the First Hermit'),
  ('D3-64', 'OUR LADY OF THE PILAR, Alaminos', 'Our Lady of the Pillar Parish', 'St. Paul the First Hermit'),
  ('D3-65', 'SAN BARTOLOME APOSTOL, Nagcarlan', 'San Bartholomew the Apostle Parish', 'San Bartolome'),
  ('D3-66', 'ST. JOHN THE BAPTIST, Liliw', 'St. John the Baptist Parish', 'San Bartolome'),
  ('D3-67', 'ST. GREGORY THE GREAT, Majayjay', 'St. Gregory the Great Parish', 'San Bartolome'),
  ('D3-68', 'NUESTRA SEÑORA DEL PILAR, Suba, Majayjay', 'Nuestra Señora Del Pilar Parish', 'San Bartolome'),
  ('D3-69', 'SAN MIGUEL ARKANGHEL, Rizal', 'St. Michael the Archangel Parish', 'San Bartolome'),
  ('D3-70', 'SANTA MARIA MAGDALENA, Magdalena', 'St. Mary Magdalene Parish', 'San Bartolome'),
  ('D3-71', 'IMMACULATE CONCEPTION, Sta. Cruz', 'Immaculate Conception Parish (San Antonio)', 'San Antonio De Padua'),
  ('D3-72', 'ST. JOHN PAUL II, Labuin, Sta. Cruz', 'St. John Paul II Parish', 'San Antonio De Padua'),
  ('D3-73', 'NATIONAL SHRINE OF SAN ANTONIO DE PADUA, Pila', 'National Shrine of San Antonio de Padua', 'San Antonio De Padua'),
  ('D3-74', 'SAN JOSE, Linga, Pila', 'San Jose Parish', 'San Antonio De Padua'),
  ('D3-75', 'LA RESURRECCION, Victoria', 'La Resurrecion Parish', 'San Antonio De Padua'),
  ('D3-76', 'STS. JOACHIM AND ANNE, Calumpang, Liliw', 'Sts. Joachim and Anne Parish', 'San Bartolome'),
  ('D4-77', 'OUR LADY OF GUADALUPE, Pagsanjan', 'Diocesan Shrine of Our Lady of Guadalupe', 'Our Lady of Guadalupe'),
  ('D4-78', 'TRANSFIGURATION OF OUR LORD, Cavinti', 'Transfiguration of the Lord Parish', 'Our Lady of Guadalupe'),
  ('D4-79', 'NUESTRA SEÑORA DEL ROSARIO, Luisiana', 'Parroquia De Nuestra Señora del Rosario', 'Our Lady of Guadalupe'),
  ('D4-80', 'SAN SEBASTIAN, Lumban', 'San Sebastian Parish', 'Our Lady of Guadalupe'),
  ('D4-81', 'SAN SANTIAGO APOSTOL, Paete', 'St. James the Apostle Parish', 'St. James'),
  ('D4-82', 'SAN JUAN EBANGHELISTA, Kalayaan', 'St. John the Evangelist Parish', 'St. James'),
  ('D4-83', 'ST. JOHN THE BAPTIST, Longos, Kalayaan', 'St. John the Baptist Parish (St. James)', 'St. James'),
  ('D4-84', 'ST. PETER OF ALCANTARA, Pakil', 'St. Peter of Alcantara Parish', 'St. James'),
  ('D4-85', 'NUESTRA SEÑORA DELA NATIVIDAD, Pangil', 'Nuestra Señora dela Natividad Parish', 'St. James'),
  ('D4-86', 'SAN ANTONIO DE PADUA, San Antonio, Kalayaan', 'San Antonio de Padua Parish (St. James)', 'St. James'),
  ('D4-87', 'ST. MARK THE EVANGELIST, Balian, Pangil', 'St. Mark the Evangelist Parish', 'St. James'),
  ('D4-88', 'SAN PEDRO AT SAN PABLO, Siniloan', 'Sts. Peter and Paul Parish', 'Sts. Peter and Paul'),
  ('D4-89', 'SAN SEBASTIAN, Famy', 'San Sebastian Parish (Sts. Peter and Paul)', 'Sts. Peter and Paul'),
  ('D4-90', 'NUESTRA SEÑORA DE CANDELARIA, Mabitac', 'Nuestra Señora De Candelaria Parish', 'Sts. Peter and Paul'),
  ('D4-91', 'NUESTRA SEÑORA DELOS ANGELES, Sta. Maria', 'Nuestra Señora de los Angeles Parish', 'Sts. Peter and Paul'),
  ('D4-92', 'SAN ISIDRO LABRADOR, Kabulusan, Pakil', 'San Isidro Labrador Parish (Sts. Peter and Paul)', 'Sts. Peter and Paul');

-- Make the migration re-runnable: clear workbook-owned codes before assigning
-- the official list again.
UPDATE parishes.details pd
SET iafr_source_code = NULL,
    updated_at = now()
WHERE upper(regexp_replace(trim(pd.iafr_source_code), '\s+', '', 'g')) IN (
  SELECT source_code FROM _official_iafr_parishes
);

-- Some databases may already contain duplicate institution rows with the same
-- parish name and vicariate. Pick one deterministic institution per source
-- code so the update/upsert below cannot touch the same alias twice.
CREATE TEMP TABLE _matched_official_iafr_parishes AS
SELECT DISTINCT ON (official.source_code)
  official.source_code,
  official.source_name,
  official.institution_name,
  official.vicariate,
  i.id AS institution_id
FROM _official_iafr_parishes official
JOIN diocese.institutions i
  ON lower(i.name) = lower(official.institution_name)
  AND lower(i.vicariate) = lower(official.vicariate)
  AND i.institution_type = 'parish'
  AND i.deleted_at IS NULL
ORDER BY
  official.source_code,
  i.institution_code NULLS LAST,
  i.created_at,
  i.id;

-- These D#-# values are the official parish institution codes. Clear the
-- workbook-owned codes from any non-matched rows first so the unique
-- institution_code index cannot collide, then assign the official code to the
-- matched parish institution.
UPDATE diocese.institutions i
SET institution_code = NULL,
    updated_at = now()
WHERE upper(regexp_replace(trim(i.institution_code), '\s+', '', 'g')) IN (
    SELECT source_code FROM _official_iafr_parishes
  )
  AND NOT EXISTS (
    SELECT 1
    FROM _matched_official_iafr_parishes official
    WHERE official.institution_id = i.id
  );

UPDATE diocese.institutions i
SET institution_code = official.source_code,
    updated_at = now()
FROM _matched_official_iafr_parishes official
WHERE i.id = official.institution_id
  AND i.institution_type = 'parish'
  AND i.deleted_at IS NULL;

UPDATE parishes.details pd
SET iafr_source_code = official.source_code,
    updated_at = now()
FROM _matched_official_iafr_parishes official
WHERE pd.institution_id = official.institution_id;

INSERT INTO operations.parish_import_aliases (
  source_code,
  source_name,
  normalized_source_name,
  institution_id,
  confidence,
  status,
  notes
)
SELECT
  official.source_code,
  official.source_name,
  trim(regexp_replace(lower(regexp_replace(official.source_name, '[^a-zA-Z0-9]+', ' ', 'g')), '\s+', ' ', 'g')),
  official.institution_id,
  1,
  'approved',
  'Approved from official 2024 IAFR workbook parish source-code list.'
FROM _matched_official_iafr_parishes official
ON CONFLICT (source_code, normalized_source_name) DO UPDATE
SET source_name = EXCLUDED.source_name,
    institution_id = EXCLUDED.institution_id,
    confidence = 1,
    status = 'approved',
    notes = EXCLUDED.notes,
    deleted_at = NULL,
    updated_at = now();

-- Backfill from already-approved import aliases only when the institution has
-- exactly one approved source code and that code belongs to only one parish.
-- Ambiguous duplicate-name parishes are intentionally left NULL for manual review.
WITH approved_codes AS (
  SELECT
    institution_id,
    upper(regexp_replace(trim(source_code), '\s+', '', 'g')) AS iafr_source_code
  FROM operations.parish_import_aliases
  WHERE source_code IS NOT NULL
    AND trim(source_code) <> ''
    AND status = 'approved'
    AND deleted_at IS NULL
),
single_code_per_parish AS (
  SELECT
    institution_id,
    min(iafr_source_code) AS iafr_source_code
  FROM approved_codes
  GROUP BY institution_id
  HAVING count(DISTINCT iafr_source_code) = 1
),
unique_code_owner AS (
  SELECT iafr_source_code
  FROM single_code_per_parish
  GROUP BY iafr_source_code
  HAVING count(*) = 1
)
UPDATE parishes.details pd
SET iafr_source_code = sc.iafr_source_code,
    updated_at = now()
FROM single_code_per_parish sc
JOIN unique_code_owner uco
  ON uco.iafr_source_code = sc.iafr_source_code
WHERE pd.institution_id = sc.institution_id
  AND pd.iafr_source_code IS NULL;

-- One active parish should not own the same official IAFR/source code.
-- The expression normalizes case and accidental spaces.
CREATE UNIQUE INDEX IF NOT EXISTS uq_parish_details_iafr_source_code
  ON parishes.details (
    upper(regexp_replace(trim(iafr_source_code), '\s+', '', 'g'))
  )
  WHERE iafr_source_code IS NOT NULL
    AND deleted_at IS NULL;

COMMIT;

-- Optional review after running:
--
-- SELECT
--   i.institution_code,
--   pd.iafr_source_code,
--   i.name,
--   i.vicariate,
--   i.address
-- FROM parishes.details pd
-- JOIN diocese.institutions i ON i.id = pd.institution_id
-- WHERE i.institution_type = 'parish'
--   AND i.deleted_at IS NULL
-- ORDER BY pd.iafr_source_code NULLS LAST, i.name;
--
-- SELECT count(*) AS coded_parish_count
-- FROM parishes.details pd
-- JOIN diocese.institutions i ON i.id = pd.institution_id
-- WHERE i.institution_type = 'parish'
--   AND i.deleted_at IS NULL
--   AND pd.iafr_source_code IS NOT NULL;
--
-- SELECT i.institution_code, i.name, i.vicariate
-- FROM parishes.details pd
-- JOIN diocese.institutions i ON i.id = pd.institution_id
-- WHERE i.institution_type = 'parish'
--   AND i.deleted_at IS NULL
--   AND pd.iafr_source_code IS NULL
-- ORDER BY i.vicariate, i.name;
