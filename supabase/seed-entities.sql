-- =============================================================================
-- Diocese of San Pablo — Entity Seed Data
--
-- Run AFTER admin-schema.sql.
-- Pastes all parishes, seminaries, and schools from constants.ts into the DB.
-- Safe to re-run: uses ON CONFLICT DO NOTHING (won't duplicate rows).
-- =============================================================================

-- =============================================================================
-- PARISHES  (100 parishes across 13 vicariates)
-- =============================================================================
INSERT INTO parishes (name, vicariate, class, pastor, address, contact_number, email) VALUES

-- Holy Family
('Christ the King Parish',                         'Holy Family',              'Class C', 'Not assigned', 'San Pablo City, Laguna', '', ''),
('Holy Family Parish',                             'Holy Family',              'Class B', 'Not assigned', 'San Pablo City, Laguna', '', ''),
('Most Holy Name of Jesus Parish',                 'Holy Family',              'Class A', 'Not assigned', 'San Pablo City, Laguna', '', ''),
('Mother of Good Counsel Parish',                  'Holy Family',              'Class D', 'Not assigned', 'San Pablo City, Laguna', '', ''),
('Our Lady of the Most Holy Rosary Parish',        'Holy Family',              'Class C', 'Not assigned', 'San Pablo City, Laguna', '', ''),
('San Martin de Porres Parish',                    'Holy Family',              'Class B', 'Not assigned', 'San Pablo City, Laguna', '', ''),
('St. Joseph the Patriarch Parish',                'Holy Family',              'Class D', 'Not assigned', 'San Pablo City, Laguna', '', ''),
('St. Joseph the Worker Parish',                   'Holy Family',              'Class B', 'Not assigned', 'San Pablo City, Laguna', '', ''),

-- San Isidro Labrador
('Blessed Sacrament Parish',                                   'San Isidro Labrador', 'Class A', 'Not assigned', 'Laguna', '', ''),
('Diocesan Shrine of San Isidro Labrador',                     'San Isidro Labrador', 'Class B', 'Not assigned', 'Laguna', '', ''),
('Nuestra Señora Dela Paz Y Buen Viaje Parish',               'San Isidro Labrador', 'Class C', 'Not assigned', 'Laguna', '', ''),
('Our Lady of the Miraculous Medal Parish',                    'San Isidro Labrador', 'Class D', 'Not assigned', 'Laguna', '', ''),
('Parish of the Risen Lord',                                   'San Isidro Labrador', 'Class A', 'Not assigned', 'Laguna', '', ''),
('San Antonio de Padua Parish',                                'San Isidro Labrador', 'Class B', 'Not assigned', 'Laguna', '', ''),
('San Pedro Apostol Parish',                                   'San Isidro Labrador', 'Class C', 'Not assigned', 'Laguna', '', ''),
('San Vicente Ferrer Parish',                                  'San Isidro Labrador', 'Class D', 'Not assigned', 'Laguna', '', ''),
('Parokya ng San Jose Manggagawa',                             'San Isidro Labrador', 'Class B', 'Not assigned', 'Laguna', '', ''),
('Mother Teresa of Calcutta Parish',                           'San Isidro Labrador', 'Class C', 'Not assigned', 'Laguna', '', ''),
('Sto. Niño de Cebu Parish',                                   'San Isidro Labrador', 'Class D', 'Not assigned', 'Laguna', '', ''),

-- San Pedro Apostol
('Diocesan Shrine of Jesus in the Holy Sepulcher', 'San Pedro Apostol',        'Class A', 'Not assigned', 'Laguna', '', ''),
('Our Lady of Fatima Parish',                      'San Pedro Apostol',        'Class B', 'Not assigned', 'Laguna', '', ''),
('Our Lady of Lourdes Parish',                     'San Pedro Apostol',        'Class C', 'Not assigned', 'Laguna', '', ''),
('San Lorenzo Ruiz Parish',                        'San Pedro Apostol',        'Class D', 'Not assigned', 'Laguna', '', ''),
('San Pedro Apostol Parish',                       'San Pedro Apostol',        'Class A', 'Not assigned', 'Laguna', '', ''),
('Sto. Rosario Parish',                            'San Pedro Apostol',        'Class B', 'Not assigned', 'Laguna', '', ''),
('Our Lady''s Assumption Parish',                  'San Pedro Apostol',        'Class C', 'Not assigned', 'Laguna', '', ''),

-- Sta. Rosa De Lima
('Chair of St. Peter Parish',                      'Sta. Rosa De Lima',        'Class D', 'Not assigned', 'Laguna', '', ''),
('Our Lady of the Most Holy Rosary Parish',        'Sta. Rosa De Lima',        'Class A', 'Not assigned', 'Laguna', '', ''),
('Our Mother of Perpetual Help Parish',            'Sta. Rosa De Lima',        'Class B', 'Not assigned', 'Laguna', '', ''),
('San Lorenzo Ruiz Parish',                        'Sta. Rosa De Lima',        'Class C', 'Not assigned', 'Laguna', '', ''),
('St. John Bosco Parish',                          'Sta. Rosa De Lima',        'Class D', 'Not assigned', 'Laguna', '', ''),
('Sta. Rosa de Lima Parish',                       'Sta. Rosa De Lima',        'Class A', 'Not assigned', 'Laguna', '', ''),

-- St. Polycarp
('Diocesan Shrine of San Vicente Ferrer',          'St. Polycarp',             'Class B', 'Not assigned', 'Laguna', '', ''),
('Mary Help of Christians Parish',                 'St. Polycarp',             'Class C', 'Not assigned', 'Laguna', '', ''),
('San Miguel Arkanghel Parish',                    'St. Polycarp',             'Class D', 'Not assigned', 'Laguna', '', ''),
('St. Francis of Assisi Parish',                   'St. Polycarp',             'Class A', 'Not assigned', 'Laguna', '', ''),
('St. Polycarp Parish',                            'St. Polycarp',             'Class B', 'Not assigned', 'Laguna', '', ''),
('St. Joseph the Worker Parish',                   'St. Polycarp',             'Class C', 'Not assigned', 'Laguna', '', ''),

-- St. John the Baptist
('Holy Trinity Parish',                            'St. John the Baptist',     'Class D', 'Not assigned', 'Laguna', '', ''),
('Mary Help of Christians Parish',                 'St. John the Baptist',     'Class A', 'Not assigned', 'Laguna', '', ''),
('Our Lady of Fatima Parish',                      'St. John the Baptist',     'Class B', 'Not assigned', 'Laguna', '', ''),
('San Agustin Parish',                             'St. John the Baptist',     'Class C', 'Not assigned', 'Laguna', '', ''),
('San Isidro Labrador Parish',                     'St. John the Baptist',     'Class D', 'Not assigned', 'Laguna', '', ''),
('San Pedro Calungsod Parish',                     'St. John the Baptist',     'Class A', 'Not assigned', 'Laguna', '', ''),
('San Vicente Ferrer Parish',                      'St. John the Baptist',     'Class B', 'Not assigned', 'Laguna', '', ''),
('St. John the Baptist Parish',                    'St. John the Baptist',     'Class C', 'Not assigned', 'Laguna', '', ''),
('St. Joseph the Worker Parish',                   'St. John the Baptist',     'Class D', 'Not assigned', 'Laguna', '', ''),
('St. Mary Magdalene Parish',                      'St. John the Baptist',     'Class A', 'Not assigned', 'Laguna', '', ''),
('Sts. Peter and Paul Parish',                     'St. John the Baptist',     'Class B', 'Not assigned', 'Laguna', '', ''),

-- Immaculate Conception
('Diocesan Shrine of St. Therese of the Child Jesus', 'Immaculate Conception', 'Class C', 'Not assigned', 'Laguna', '', ''),
('Immaculate Conception Parish',                   'Immaculate Conception',    'Class D', 'Not assigned', 'Laguna', '', ''),
('San Agustin Parish',                             'Immaculate Conception',    'Class A', 'Not assigned', 'Laguna', '', ''),
('San Antonio De Padua Parish',                    'Immaculate Conception',    'Class B', 'Not assigned', 'Laguna', '', ''),
('San Isidro Labrador Parish',                     'Immaculate Conception',    'Class C', 'Not assigned', 'Laguna', '', ''),
('San Nicholas De Tolentino Parish',               'Immaculate Conception',    'Class D', 'Not assigned', 'Laguna', '', ''),

-- St. Paul the First Hermit
('Cathedral Parish of St. Paul the First Hermit',  'St. Paul the First Hermit','Class A', 'Rev. Fr. Juan Santos', 'San Pablo City, Laguna', '049-562-0001', 'cathedral@diocese-sanpablo.ph'),
('Nuestra Señora de Los Remedios Parish',          'St. Paul the First Hermit','Class B', 'Not assigned', 'Laguna', '', ''),
('Our Lady of the Pillar Parish',                  'St. Paul the First Hermit','Class C', 'Not assigned', 'Laguna', '', ''),
('San Gabriel Arkanghel Parish',                   'St. Paul the First Hermit','Class D', 'Not assigned', 'Laguna', '', ''),
('St. Francis of Assisi Parish',                   'St. Paul the First Hermit','Class A', 'Not assigned', 'Laguna', '', ''),
('St. Luke the Evangelist Parish',                 'St. Paul the First Hermit','Class B', 'Not assigned', 'Laguna', '', ''),
('San Roque Parish',                               'St. Paul the First Hermit','Class C', 'Not assigned', 'Laguna', '', ''),
('Immaculate Conception Parish',                   'St. Paul the First Hermit','Class D', 'Not assigned', 'Laguna', '', ''),

-- San Bartolome
('Nuestra Señora Del Pilar Parish',                'San Bartolome',            'Class A', 'Not assigned', 'Laguna', '', ''),
('St. Mary Magdalene Parish',                      'San Bartolome',            'Class B', 'Not assigned', 'Laguna', '', ''),
('St. Gregory the Great Parish',                   'San Bartolome',            'Class C', 'Not assigned', 'Laguna', '', ''),
('San Bartholomew the Apostle Parish',             'San Bartolome',            'Class D', 'Not assigned', 'Laguna', '', ''),
('St. John the Baptist Parish',                    'San Bartolome',            'Class A', 'Not assigned', 'Laguna', '', ''),
('St. Michael the Archangel Parish',               'San Bartolome',            'Class B', 'Not assigned', 'Laguna', '', ''),
('Sts. Joachim and Anne Parish',                   'San Bartolome',            'Class C', 'Not assigned', 'Laguna', '', ''),

-- San Antonio De Padua
('Immaculate Conception Parish (San Antonio)',      'San Antonio De Padua',     'Class D', 'Not assigned', 'Laguna', '', ''),
('La Resurrecion Parish',                          'San Antonio De Padua',     'Class A', 'Not assigned', 'Laguna', '', ''),
('National Shrine of San Antonio de Padua',        'San Antonio De Padua',     'Class B', 'Not assigned', 'Laguna', '', ''),
('San Jose Parish',                                'San Antonio De Padua',     'Class C', 'Not assigned', 'Laguna', '', ''),
('St. John Paul II Parish',                        'San Antonio De Padua',     'Class D', 'Not assigned', 'Laguna', '', ''),

-- Our Lady of Guadalupe
('Diocesan Shrine of Our Lady of Guadalupe',       'Our Lady of Guadalupe',    'Class A', 'Not assigned', 'Laguna', '', ''),
('Parroquia De Nuestra Señora del Rosario',        'Our Lady of Guadalupe',    'Class B', 'Not assigned', 'Laguna', '', ''),
('San Sebastian Parish',                           'Our Lady of Guadalupe',    'Class C', 'Not assigned', 'Laguna', '', ''),
('Transfiguration of the Lord Parish',             'Our Lady of Guadalupe',    'Class D', 'Not assigned', 'Laguna', '', ''),

-- St. James
('St. Peter of Alcantara Parish',                  'St. James',                'Class A', 'Not assigned', 'Laguna', '', ''),
('Nuestra Señora dela Natividad Parish',           'St. James',                'Class B', 'Not assigned', 'Laguna', '', ''),
('San Antonio de Padua Parish (St. James)',        'St. James',                'Class C', 'Not assigned', 'Laguna', '', ''),
('St. James the Apostle Parish',                   'St. James',                'Class D', 'Not assigned', 'Laguna', '', ''),
('St. John the Baptist Parish (St. James)',        'St. James',                'Class A', 'Not assigned', 'Laguna', '', ''),
('St. John the Evangelist Parish',                 'St. James',                'Class B', 'Not assigned', 'Laguna', '', ''),
('St. Mark the Evangelist Parish',                 'St. James',                'Class C', 'Not assigned', 'Laguna', '', ''),

-- Sts. Peter and Paul
('Nuestra Señora De Candelaria Parish',            'Sts. Peter and Paul',      'Class D', 'Not assigned', 'Laguna', '', ''),
('Nuestra Señora de los Angeles Parish',           'Sts. Peter and Paul',      'Class A', 'Not assigned', 'Laguna', '', ''),
('San Isidro Labrador Parish (Sts. Peter and Paul)','Sts. Peter and Paul',     'Class B', 'Not assigned', 'Laguna', '', ''),
('San Sebastian Parish (Sts. Peter and Paul)',     'Sts. Peter and Paul',      'Class C', 'Not assigned', 'Laguna', '', ''),
('Sts. Peter and Paul Parish',                     'Sts. Peter and Paul',      'Class D', 'Not assigned', 'Laguna', '', '')

ON CONFLICT DO NOTHING;

-- =============================================================================
-- SEMINARIES
-- =============================================================================
INSERT INTO seminaries (name, vicariate, class, rector, address, enrollment, capacity, staff) VALUES
('St. Peter''s College Seminary',            'San Pablo', 'Class A', 'Msgr. Jerry Bitoon',  'San Pablo City, Laguna', 45, 60,  8),
('San Pablo Theological Formation Center',   'San Pablo', 'Class B', 'Fr. Noel de Leon',    'San Pablo City, Laguna', 32, 50,  6),
('Diocesan Memorial Seminary',               'San Pablo', 'Class C', 'Not assigned',        'San Pablo City, Laguna',  0, 40,  4),
('Holy Cross Seminary',                      'San Pablo', 'Class C', 'Not assigned',        'San Pablo City, Laguna',  0, 35,  4),
('Our Lady of Guadalupe Seminary',           'San Pablo', 'Class D', 'Not assigned',        'San Pablo City, Laguna',  0, 30,  3)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- DIOCESAN SCHOOLS
-- =============================================================================
INSERT INTO diocesan_schools (name, vicariate, class, principal, address, level, enrollment, capacity, staff) VALUES
('Liceo de San Pablo',        'San Pablo', 'Class A', 'Sr. Maria Clara',   'San Pablo City, Laguna', 'K-12',    1200, 1500, 45),
('Canossa College San Pablo', 'San Pablo', 'Class B', 'Sr. Josefina',      'San Pablo City, Laguna', 'K-12',     850, 1000, 32),
('Liceo de Calamba',          'San Pablo', 'Class B', 'Not assigned',      'Calamba City, Laguna',   'K-12',     780,  950, 28),
('Liceo de Cabuyao',          'San Pablo', 'Class C', 'Not assigned',      'Cabuyao City, Laguna',   'K-12',     620,  800, 22),
('Liceo de Los Baños',        'San Pablo', 'Class C', 'Not assigned',      'Los Baños, Laguna',      'K-12',     540,  700, 20),
('Liceo de Bay',              'San Pablo', 'Class D', 'Not assigned',      'Bay, Laguna',            'K-12',     410,  600, 16)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- SAMPLE ANNOUNCEMENTS
-- =============================================================================
INSERT INTO announcements (title, content, author, author_role, priority, category) VALUES
(
  'Q1 2026 Financial Report Submission Deadline',
  'All parishes, seminaries, and diocesan schools are reminded to submit their Q1 2026 financial reports (IAFR) no later than April 15, 2026. Late submissions will be flagged in the system and may affect your institution''s compliance score. Please coordinate with your finance officer for timely submission.',
  'Diocese Administrator',
  'diocese_admin',
  'high',
  'financial'
),
(
  'Updated IAFR Template Now Available',
  'The revised IAFR template for FY2026 is now available for download under Data Management. All institutions must use the new template starting with the March 2026 submission. The updated template includes new fields for Special Collections and Mass Intentions.',
  'Diocese Administrator',
  'diocese_admin',
  'medium',
  'administrative'
),
(
  'Financial Literacy Seminar — May 10, 2026',
  'The Diocese of San Pablo will hold a Financial Literacy and Stewardship Seminar for all parish finance officers and secretaries on May 10, 2026 at the Diocesan Pastoral Center. Attendance is highly encouraged. Please confirm your attendance by May 3.',
  'Bishop''s Office',
  'bishop',
  'medium',
  'event'
),
(
  'System Maintenance — April 30, 2026 (2AM–4AM)',
  'The Financial Analytics System will undergo scheduled maintenance on April 30, 2026 from 2:00 AM to 4:00 AM. The system will be unavailable during this window. Please plan your submissions accordingly.',
  'System Administrator',
  'diocese_admin',
  'low',
  'administrative'
)
ON CONFLICT DO NOTHING;
