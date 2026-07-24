-- ===========================================================================
-- PAULUS Bug Fix 2.1 — Correct Parish-to-District Assignments
-- Diocese of San Pablo
-- ===========================================================================
-- Run this migration against the diocese.institutions table to update
-- the district assignment for each parish.
-- The parish names below match the canonical names in the system.
-- ===========================================================================

-- DISTRICT 1 — San Pedro & Biñan area (D1-1 to D1-26)
UPDATE diocese.institutions SET district = 1 WHERE type = 'parish' AND name ILIKE 'SAN PEDRO APOSTOL%' AND (location ILIKE '%San Pedro%' OR location ILIKE '%Landayan%' OR location ILIKE '%Malaban%' OR location ILIKE '%Ireneville%');
UPDATE diocese.institutions SET district = 1 WHERE type = 'parish' AND name ILIKE 'DIOCESAN SHRINE OF JESUS IN THE HOLY SEPULCHRE%';
UPDATE diocese.institutions SET district = 1 WHERE type = 'parish' AND name ILIKE 'SANTO ROSARYO%';
UPDATE diocese.institutions SET district = 1 WHERE type = 'parish' AND name ILIKE 'SAN LORENZO RUIZ%' AND location ILIKE '%Pacita%';
UPDATE diocese.institutions SET district = 1 WHERE type = 'parish' AND name ILIKE '%ASSUMPTION%' AND location ILIKE '%Aurora Village%';
UPDATE diocese.institutions SET district = 1 WHERE type = 'parish' AND name ILIKE 'OUR LADY OF LOURDES%' AND location ILIKE '%United San Pedro%';
UPDATE diocese.institutions SET district = 1 WHERE type = 'parish' AND name ILIKE 'OUR LADY OF FATIMA%' AND location ILIKE '%Elvinda%';
UPDATE diocese.institutions SET district = 1 WHERE type = 'parish' AND name ILIKE 'HOLY FAMILY%' AND location ILIKE '%Sampaguita%';
UPDATE diocese.institutions SET district = 1 WHERE type = 'parish' AND name ILIKE 'MOTHER OF GOOD COUNSEL%';
UPDATE diocese.institutions SET district = 1 WHERE type = 'parish' AND name ILIKE 'CHRIST THE KING%' AND location ILIKE '%GSIS%';
UPDATE diocese.institutions SET district = 1 WHERE type = 'parish' AND name ILIKE 'SAN MARTIN DE PORRES%' AND location ILIKE '%Adelina%';
UPDATE diocese.institutions SET district = 1 WHERE type = 'parish' AND name ILIKE 'MOST HOLY NAME OF JESUS%' AND location ILIKE '%Narra%';
UPDATE diocese.institutions SET district = 1 WHERE type = 'parish' AND name ILIKE 'ST. JOSEPH THE PATRIARCH%';
UPDATE diocese.institutions SET district = 1 WHERE type = 'parish' AND name ILIKE 'ST. JOSEPH THE WORKER%' AND location ILIKE '%Calendola%';
UPDATE diocese.institutions SET district = 1 WHERE type = 'parish' AND name ILIKE '%MOST HOLY ROSARY%' AND location ILIKE '%Rosario%' AND location ILIKE '%San Pedro%';
UPDATE diocese.institutions SET district = 1 WHERE type = 'parish' AND name ILIKE 'SAN ISIDRO LABRADOR%' AND location ILIKE '%Biñan%';
UPDATE diocese.institutions SET district = 1 WHERE type = 'parish' AND name ILIKE 'NUESTRA SE%ORA DE%PAZ%' AND location ILIKE '%Dela Paz%';
UPDATE diocese.institutions SET district = 1 WHERE type = 'parish' AND name ILIKE 'SAN VICENTE FERRER%' AND location ILIKE '%San Vicente%' AND location ILIKE '%Biñan%';
UPDATE diocese.institutions SET district = 1 WHERE type = 'parish' AND name ILIKE 'ST. MOTHER TERESA%';
UPDATE diocese.institutions SET district = 1 WHERE type = 'parish' AND name ILIKE 'RISEN LORD%';
UPDATE diocese.institutions SET district = 1 WHERE type = 'parish' AND name ILIKE 'SAN ANTONIO DE PADUA%' AND location ILIKE '%San Antonio%' AND location ILIKE '%Biñan%';
UPDATE diocese.institutions SET district = 1 WHERE type = 'parish' AND name ILIKE 'SAINT JOSEPH THE WORKER%' AND location ILIKE '%Olivarez%';
UPDATE diocese.institutions SET district = 1 WHERE type = 'parish' AND name ILIKE 'BLESSED SACRAMENT%' AND location ILIKE '%South City%';
UPDATE diocese.institutions SET district = 1 WHERE type = 'parish' AND name ILIKE 'STO. NI%O DE CEBU%';
UPDATE diocese.institutions SET district = 1 WHERE type = 'parish' AND name ILIKE 'OUR LADY OF THE MIRACULOUS MEDAL%';

-- DISTRICT 2 — Sta. Rosa, Cabuyao, Calamba, Los Baños, Bay, Caluan (D2-27 to D2-56)
UPDATE diocese.institutions SET district = 2 WHERE type = 'parish' AND name ILIKE 'SANTA ROSA DE LIMA%';
UPDATE diocese.institutions SET district = 2 WHERE type = 'parish' AND name ILIKE 'CHAIR OF ST. PETER%';
UPDATE diocese.institutions SET district = 2 WHERE type = 'parish' AND name ILIKE 'SAN LORENZO RUIZ%' AND location ILIKE '%San Lorenzo Village%';
UPDATE diocese.institutions SET district = 2 WHERE type = 'parish' AND name ILIKE 'ST. JOHN BOSCO%';
UPDATE diocese.institutions SET district = 2 WHERE type = 'parish' AND name ILIKE '%MOST HOLY ROSARY%' AND location ILIKE '%Golden City%';
UPDATE diocese.institutions SET district = 2 WHERE type = 'parish' AND name ILIKE 'OUR MOTHER OF PERPETUAL HELP%';
UPDATE diocese.institutions SET district = 2 WHERE type = 'parish' AND name ILIKE 'ST. POLYCARP%';
UPDATE diocese.institutions SET district = 2 WHERE type = 'parish' AND name ILIKE 'ST. FRANCIS OF ASSISI%' AND location ILIKE '%Pulo%';
UPDATE diocese.institutions SET district = 2 WHERE type = 'parish' AND name ILIKE 'DIOCESAN SHRINE OF SAN VICENTE FERRER%';
UPDATE diocese.institutions SET district = 2 WHERE type = 'parish' AND name ILIKE 'SAN MIGUEL ARKANGHEL%' AND location ILIKE '%Banlic%';
UPDATE diocese.institutions SET district = 2 WHERE type = 'parish' AND name ILIKE 'MARY HELP OF CHRISTIANS%' AND location ILIKE '%Southville%';
UPDATE diocese.institutions SET district = 2 WHERE type = 'parish' AND name ILIKE 'ST. JOSEPH THE WORKER%' AND location ILIKE '%Bigaa%';
UPDATE diocese.institutions SET district = 2 WHERE type = 'parish' AND name ILIKE 'SAN RAFAEL ARKANGHEL%';
UPDATE diocese.institutions SET district = 2 WHERE type = 'parish' AND name ILIKE 'SAN JUAN BAUTISTA%' AND location ILIKE '%Calamba%';
UPDATE diocese.institutions SET district = 2 WHERE type = 'parish' AND name ILIKE 'STS. PETER%PAUL%' AND location ILIKE '%Aplaya%';
UPDATE diocese.institutions SET district = 2 WHERE type = 'parish' AND name ILIKE 'SAN JOSE MANGGAGAWA%';
UPDATE diocese.institutions SET district = 2 WHERE type = 'parish' AND name ILIKE 'SAN VICENTE FERRER%' AND location ILIKE '%Real%';
UPDATE diocese.institutions SET district = 2 WHERE type = 'parish' AND name ILIKE 'SAN PEDRO CALUNGSOD%';
UPDATE diocese.institutions SET district = 2 WHERE type = 'parish' AND name ILIKE 'SAN AGUSTIN%' AND location ILIKE '%Parian%';
UPDATE diocese.institutions SET district = 2 WHERE type = 'parish' AND name ILIKE 'MARY HELP OF CHRISTIANS%' AND location ILIKE '%Mayapa%';
UPDATE diocese.institutions SET district = 2 WHERE type = 'parish' AND name ILIKE 'HOLY TRINITY%' AND location ILIKE '%Pansol%';
UPDATE diocese.institutions SET district = 2 WHERE type = 'parish' AND name ILIKE 'OUR LADY OF FATIMA%' AND location ILIKE '%Lawa%';
UPDATE diocese.institutions SET district = 2 WHERE type = 'parish' AND name ILIKE 'SAN ISIDRO LABRADOR%' AND location ILIKE '%Makiling%';
UPDATE diocese.institutions SET district = 2 WHERE type = 'parish' AND name ILIKE 'ST. MARY MAGDALENE%';
UPDATE diocese.institutions SET district = 2 WHERE type = 'parish' AND name ILIKE 'IMMACULATE CONCEPTION%' AND location ILIKE '%Los Baños%';
UPDATE diocese.institutions SET district = 2 WHERE type = 'parish' AND name ILIKE 'ST. THERESE OF THE CHILD JESUS%';
UPDATE diocese.institutions SET district = 2 WHERE type = 'parish' AND name ILIKE 'SAN ANTONIO DE PADUA%' AND location ILIKE '%Los Baños%';
UPDATE diocese.institutions SET district = 2 WHERE type = 'parish' AND name ILIKE 'SAN AGUSTIN%' AND location ILIKE '%Bay%';
UPDATE diocese.institutions SET district = 2 WHERE type = 'parish' AND name ILIKE 'SAN NICOLAS DE TOLENTINO%';
UPDATE diocese.institutions SET district = 2 WHERE type = 'parish' AND name ILIKE 'SAN ISIDRO LABRADOR%' AND location ILIKE '%Caluan%';

-- DISTRICT 3 — San Pablo City, Alaminos, Nagcarlan, Majayjay, Sta. Cruz, Pila, Victoria, Liliw (D3-57 to D3-76)
UPDATE diocese.institutions SET district = 3 WHERE type = 'parish' AND name ILIKE 'CATHEDRAL OF ST. PAUL THE FIRST HERMIT%';
UPDATE diocese.institutions SET district = 3 WHERE type = 'parish' AND name ILIKE 'NUESTRA SE%ORA DELOS REMEDIOS%';
UPDATE diocese.institutions SET district = 3 WHERE type = 'parish' AND name ILIKE 'ST. FRANCIS OF ASSISI%' AND location ILIKE '%Calihan%';
UPDATE diocese.institutions SET district = 3 WHERE type = 'parish' AND name ILIKE 'SAN ROQUE%' AND location ILIKE '%San Roque%';
UPDATE diocese.institutions SET district = 3 WHERE type = 'parish' AND name ILIKE 'ST. LUKE THE EVANGELIST%';
UPDATE diocese.institutions SET district = 3 WHERE type = 'parish' AND name ILIKE 'IMMACULATE CONCEPTION%' AND location ILIKE '%Concepcion%';
UPDATE diocese.institutions SET district = 3 WHERE type = 'parish' AND name ILIKE 'SAN GABRIEL ARKANGHEL%';
UPDATE diocese.institutions SET district = 3 WHERE type = 'parish' AND name ILIKE 'OUR LADY OF THE PILAR%' AND location ILIKE '%Alaminos%';
UPDATE diocese.institutions SET district = 3 WHERE type = 'parish' AND name ILIKE 'SAN BARTOLOME APOSTOL%';
UPDATE diocese.institutions SET district = 3 WHERE type = 'parish' AND name ILIKE 'ST. JOHN THE BAPTIST%' AND location ILIKE '%Liliw%';
UPDATE diocese.institutions SET district = 3 WHERE type = 'parish' AND name ILIKE 'ST. GREGORY THE GREAT%';
UPDATE diocese.institutions SET district = 3 WHERE type = 'parish' AND name ILIKE 'NUESTRA SE%ORA DEL PILAR%' AND location ILIKE '%Suba%';
UPDATE diocese.institutions SET district = 3 WHERE type = 'parish' AND name ILIKE 'SAN MIGUEL ARKANGHEL%' AND location ILIKE '%Rizal%';
UPDATE diocese.institutions SET district = 3 WHERE type = 'parish' AND name ILIKE 'SANTA MARIA MAGDALENA%';
UPDATE diocese.institutions SET district = 3 WHERE type = 'parish' AND name ILIKE 'IMMACULATE CONCEPTION%' AND location ILIKE '%Sta. Cruz%';
UPDATE diocese.institutions SET district = 3 WHERE type = 'parish' AND name ILIKE 'ST. JOHN PAUL II%';
UPDATE diocese.institutions SET district = 3 WHERE type = 'parish' AND name ILIKE 'NATIONAL SHRINE OF SAN ANTONIO DE PADUA%';
UPDATE diocese.institutions SET district = 3 WHERE type = 'parish' AND name ILIKE 'SAN JOSE%' AND location ILIKE '%Linga%';
UPDATE diocese.institutions SET district = 3 WHERE type = 'parish' AND name ILIKE 'LA RESURRECCION%';
UPDATE diocese.institutions SET district = 3 WHERE type = 'parish' AND name ILIKE 'STS. JOACHIM AND ANNE%';

-- DISTRICT 4 — Pagsanjan, Cavinti, Luisiana, Lumban, Paete, Kalayaan, Pakil, Pangil, Siniloan, Famy, Mabitac, Sta. Maria (D4-77 to D4-92)
UPDATE diocese.institutions SET district = 4 WHERE type = 'parish' AND name ILIKE 'OUR LADY OF GUADALUPE%';
UPDATE diocese.institutions SET district = 4 WHERE type = 'parish' AND name ILIKE 'TRANSFIGURATION OF OUR LORD%';
UPDATE diocese.institutions SET district = 4 WHERE type = 'parish' AND name ILIKE 'NUESTRA SE%ORA DEL ROSARIO%' AND location ILIKE '%Luisiana%';
UPDATE diocese.institutions SET district = 4 WHERE type = 'parish' AND name ILIKE 'SAN SEBASTIAN%' AND location ILIKE '%Lumban%';
UPDATE diocese.institutions SET district = 4 WHERE type = 'parish' AND name ILIKE 'SAN SANTIAGO APOSTOL%';
UPDATE diocese.institutions SET district = 4 WHERE type = 'parish' AND name ILIKE 'SAN JUAN EBANGHELISTA%';
UPDATE diocese.institutions SET district = 4 WHERE type = 'parish' AND name ILIKE 'ST. JOHN THE BAPTIST%' AND location ILIKE '%Longos%';
UPDATE diocese.institutions SET district = 4 WHERE type = 'parish' AND name ILIKE 'ST. PETER OF ALCANTARA%';
UPDATE diocese.institutions SET district = 4 WHERE type = 'parish' AND name ILIKE 'NUESTRA SE%ORA DELA NATIVIDAD%';
UPDATE diocese.institutions SET district = 4 WHERE type = 'parish' AND name ILIKE 'SAN ANTONIO DE PADUA%' AND location ILIKE '%Kalayaan%';
UPDATE diocese.institutions SET district = 4 WHERE type = 'parish' AND name ILIKE 'ST. MARK THE EVANGELIST%';
UPDATE diocese.institutions SET district = 4 WHERE type = 'parish' AND name ILIKE 'SAN PEDRO AT SAN PABLO%';
UPDATE diocese.institutions SET district = 4 WHERE type = 'parish' AND name ILIKE 'SAN SEBASTIAN%' AND location ILIKE '%Famy%';
UPDATE diocese.institutions SET district = 4 WHERE type = 'parish' AND name ILIKE 'NUESTRA SE%ORA DE CANDELARIA%';
UPDATE diocese.institutions SET district = 4 WHERE type = 'parish' AND name ILIKE 'NUESTRA SE%ORA DELOS ANGELES%';
UPDATE diocese.institutions SET district = 4 WHERE type = 'parish' AND name ILIKE 'SAN ISIDRO LABRADOR%' AND location ILIKE '%Kabulusan%';

-- ===========================================================================
-- Verification query — run after migration to confirm district coverage
-- ===========================================================================
-- SELECT district, COUNT(*) as parish_count
-- FROM diocese.institutions
-- WHERE type = 'parish' AND status != 'archived'
-- GROUP BY district
-- ORDER BY district;
-- Expected: District 1: 26, District 2: 30, District 3: 20, District 4: 16
-- ===========================================================================
