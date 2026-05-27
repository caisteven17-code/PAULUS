'use client';

import { Eye, Database, Users } from 'lucide-react';
import { UserRole, Parish, Seminary, DiocesanSchool } from './types';

// ============================================================================
// DESIGN SYSTEM CONSTANTS
// ============================================================================

/** Color palette for the Diocese Financial Analytics System */
export const COLORS = {
  gold: '#D4AF37',
  goldDark: '#B5952F',
  churchGreen: '#1a472a',
  churchGreenDark: '#0d2818',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
} as const;

/** Financial submission configuration */
export const SUBMISSION_CONFIG = {
  DEADLINE_DAY: 15,
  MONTHS_TO_TRACK: ['Aug', 'Oct', 'Dec'] as const,
  MONTHS_LATE_WARNING: 1,
  MONTHS_LATE_WARNING_MAX: 3,
  MONTHS_LATE_ACTION_REQUIRED: 4,
  MONTHS_TO_DAYS: 30,
  MILLISECONDS_PER_DAY: 1000 * 3600 * 24,
} as const;

/** Status badge labels and emojis */
export const STATUS_LABELS = {
  ON_TIME: '🟢 On Time',
  NOT_SUBMITTED: '🔴 Not Submitted',
  PENDING: '🟡 Pending Review',
  OVERDUE: '🔴 Overdue',
} as const;

/** Role display names */
export const ROLE_LABELS = {
  bishop: 'Bishop',
  admin: 'Administrator',
  parish_priest: 'Parish Priest',
  parish_secretary: 'Parish Secretary',
  school: 'School',
  seminary: 'Seminary',
} as const;

/** Error messages */
export const ERROR_MESSAGES = {
  LOGOUT_FAILED: 'Logout failed. Please try again.',
  AUTH_ERROR: 'Authentication error. Please try again.',
  FILE_ERROR: 'File upload failed. Please check the file format.',
  NETWORK_ERROR: 'Network error. Please check your connection.',
} as const;

// ============================================================================
// ROLE & PERMISSION CONSTANTS
// ============================================================================

export const ALL_PERMISSIONS = [
  {
    category: 'Viewing Permissions',
    icon: Eye,
    permissions: [
      { id: 'view_diocese', name: 'View Diocese Records', description: 'Allows the user to view all records across the entire diocese.' },
      { id: 'view_parish', name: 'View Parish Records', description: 'Allows the user to view records specific to their assigned parish.' },
      { id: 'view_seminary', name: 'View Seminary Records', description: 'Allows the user to view records specific to their assigned seminary.' },
      { id: 'view_school', name: 'View School Records', description: 'Allows the user to view records specific to their assigned school.' },
    ]
  },
  {
    category: 'Data Management',
    icon: Database,
    permissions: [
      { id: 'download_csv', name: 'Download CSV Templates', description: 'Allows the user to download blank CSV templates for data entry.' },
      { id: 'upload_csv_admin', name: 'Upload Master CSV', description: 'Allows the user to upload and process master CSV templates for the diocese.' },
      { id: 'upload_csv_entity', name: 'Upload Entity CSV', description: 'Allows the user to upload updated CSVs for their specific entity.' },
    ]
  },
  {
    category: 'User Management',
    icon: Users,
    permissions: [
      { id: 'create_users', name: 'Create User Accounts', description: 'Allows the user to create new accounts for other personnel.' },
      { id: 'manage_roles', name: 'Manage User Roles', description: 'Allows the user to modify role permissions and assign roles to users.' },
    ]
  }
];

export const INITIAL_ROLES: UserRole[] = [
  { id: 'bishop', name: 'Bishop', color: '#D4AF37', permissions: { view_diocese: true, view_parish: true, view_seminary: true, view_school: true, download_csv: true, upload_csv_admin: true, upload_csv_entity: true, create_users: true, manage_roles: true } },
  { id: 'diocese_admin', name: 'Diocese Admin', color: '#1E3A8A', permissions: { view_diocese: true, view_parish: true, view_seminary: true, view_school: true, download_csv: true, upload_csv_admin: true, upload_csv_entity: true, create_users: true, manage_roles: true } },
  { id: 'parish_priest', name: 'Parish Priest', color: '#059669', permissions: { view_diocese: false, view_parish: true, view_seminary: false, view_school: false, download_csv: true, upload_csv_admin: false, upload_csv_entity: true, create_users: false, manage_roles: false } },
  { id: 'parish_secretary', name: 'Parish Secretary', color: '#10B981', permissions: { view_diocese: false, view_parish: true, view_seminary: false, view_school: false, download_csv: true, upload_csv_admin: false, upload_csv_entity: true, create_users: false, manage_roles: false } },
  { id: 'seminary_rector', name: 'Seminary Rector', color: '#DC2626', permissions: { view_diocese: false, view_parish: false, view_seminary: true, view_school: false, download_csv: true, upload_csv_admin: false, upload_csv_entity: true, create_users: false, manage_roles: false } },
  { id: 'school_registrar', name: 'Diocesan School Registrar', color: '#7C3AED', permissions: { view_diocese: false, view_parish: false, view_seminary: false, view_school: true, download_csv: true, upload_csv_admin: false, upload_csv_entity: true, create_users: false, manage_roles: false } }
];

export const PREDEFINED_ROLE_IDS = ['bishop', 'diocese_admin', 'parish_priest', 'parish_secretary', 'seminary_rector', 'school_registrar'];

export const VICARIATES = [
  'Holy Family',
  'San Isidro Labrador',
  'San Pedro Apostol',
  'Sta. Rosa De Lima',
  'St. Polycarp',
  'St. John the Baptist',
  'Immaculate Conception',
  'St. Paul the First Hermit',
  'San Bartolome',
  'San Antonio De Padua',
  'Our Lady of Guadalupe',
  'St. James',
  'Sts. Peter and Paul',
];

export const CLASSES = ['Class A', 'Class B', 'Class C', 'Class D', 'Class E'];

export const INITIAL_PARISHES: Parish[] = [
  { id: '1', name: 'St. Francis of Assisi Parish', vicariate: 'Holy Family', class: 'Class A', pastor: 'Rev. Fr. Rizaldy Urgena', address: 'San Pablo City, Laguna', contactNumber: '049-562-1234', email: 'stfrancis@diocese.org' },
  { id: '2', name: 'St. Vincent Ferrer Parish', vicariate: 'San Isidro Labrador', class: 'Class B', pastor: 'Fr. Juan Dela Cruz', address: 'Mabitac, Laguna', contactNumber: '049-562-5678', email: 'stvincent@diocese.org' },
  { id: '3', name: 'St. Peter of Alcantara Parish', vicariate: 'San Pedro Apostol', class: 'Class A', pastor: 'Fr. Ricardo Reyes', address: 'Pakil, Laguna', contactNumber: '049-562-9012', email: 'stpeter@diocese.org' },
];

export const INITIAL_SEMINARIES: Seminary[] = [
  { id: '1', name: 'St. Peter\'s College Seminary', vicariate: 'San Pablo', class: 'Class A', rector: 'Msgr. Jerry Bitoon', address: 'San Pablo City, Laguna', enrollment: 45, capacity: 60, staff: 8 },
  { id: '2', name: 'San Pablo Theological Formation Center', vicariate: 'San Pablo', class: 'Class B', rector: 'Fr. Noel de Leon', address: 'San Pablo City, Laguna', enrollment: 32, capacity: 50, staff: 6 },
];

export const INITIAL_SCHOOLS: DiocesanSchool[] = [
  { id: '1', name: 'Liceo de San Pablo', vicariate: 'San Pablo', class: 'Class A', principal: 'Sr. Maria Clara', address: 'San Pablo City, Laguna', level: 'K-12', enrollment: 1200, capacity: 1500, staff: 45 },
  { id: '2', name: 'Canossa College San Pablo', vicariate: 'San Pablo', class: 'Class B', principal: 'Sr. Josefina', address: 'San Pablo City, Laguna', level: 'K-12', enrollment: 850, capacity: 1000, staff: 32 },
];

export const ALL_PARISHES = [
  // Holy Family
  { name: 'Christ the King Parish', vicariate: 'Holy Family', class: 'Class C', collections: 1245000 },
  { name: 'Holy Family Parish', vicariate: 'Holy Family', class: 'Class B', collections: 2450000 },
  { name: 'Most Holy Name of Jesus Parish', vicariate: 'Holy Family', class: 'Class A', collections: 3890000 },
  { name: 'Mother of Good Counsel Parish', vicariate: 'Holy Family', class: 'Class D', collections: 1650000 },
  { name: 'Our Lady of the Most Holy Rosary Parish', vicariate: 'Holy Family', class: 'Class C', collections: 1420000 },
  { name: 'San Martin de Porres Parish', vicariate: 'Holy Family', class: 'Class B', collections: 2780000 },
  { name: 'St. Joseph the Patriarch Parish', vicariate: 'Holy Family', class: 'Class D', collections: 1550000 },
  { name: 'St. Joseph the Worker Parish', vicariate: 'Holy Family', class: 'Class B', collections: 2150000 },
  // San Isidro Labrador
  { name: 'Blessed Sacrament Parish', vicariate: 'San Isidro Labrador', class: 'Class A', collections: 4120000 },
  { name: 'Diocesan Shrine of San Isidro Labrador', vicariate: 'San Isidro Labrador', class: 'Class B', collections: 2950000 },
  { name: 'Nuestra Señora Dela Paz Y Buen Viaje Parish', vicariate: 'San Isidro Labrador', class: 'Class C', collections: 1380000 },
  { name: 'Our Lady of the Miraculous Medal Parish', vicariate: 'San Isidro Labrador', class: 'Class D', collections: 1720000 },
  { name: 'Parish of the Risen Lord', vicariate: 'San Isidro Labrador', class: 'Class A', collections: 3560000 },
  { name: 'San Antonio de Padua Parish', vicariate: 'San Isidro Labrador', class: 'Class B', collections: 2420000 },
  { name: 'San Pedro Apostol Parish', vicariate: 'San Isidro Labrador', class: 'Class C', collections: 1610000 },
  { name: 'San Vicente Ferrer Parish', vicariate: 'San Isidro Labrador', class: 'Class D', collections: 1890000 },
  { name: 'Parokya ng San Jose Manggagawa', vicariate: 'San Isidro Labrador', class: 'Class B', collections: 2350000 },
  { name: 'Mother Teresa of Calcutta Parish', vicariate: 'San Isidro Labrador', class: 'Class C', collections: 1480000 },
  { name: 'Sto. Niño de Cebu Parish', vicariate: 'San Isidro Labrador', class: 'Class D', collections: 1750000 },
  // San Pedro Apostol
  { name: 'Diocesan Shrine of Jesus in the Holy Sepulcher', vicariate: 'San Pedro Apostol', class: 'Class A', collections: 4500000 },
  { name: 'Our Lady of Fatima Parish', vicariate: 'San Pedro Apostol', class: 'Class B', collections: 2820000 },
  { name: 'Our Lady of Lourdes Parish', vicariate: 'San Pedro Apostol', class: 'Class C', collections: 1590000 },
  { name: 'San Lorenzo Ruiz Parish', vicariate: 'San Pedro Apostol', class: 'Class D', collections: 1920000 },
  { name: 'San Pedro Apostol Parish', vicariate: 'San Pedro Apostol', class: 'Class A', collections: 3750000 },
  { name: 'Sto. Rosario Parish', vicariate: 'San Pedro Apostol', class: 'Class B', collections: 2540000 },
  { name: 'Our Lady\'s Assumption Parish', vicariate: 'San Pedro Apostol', class: 'Class C', collections: 1450000 },
  // Sta. Rosa De Lima
  { name: 'Chair of St. Peter Parish', vicariate: 'Sta. Rosa De Lima', class: 'Class D', collections: 1680000 },
  { name: 'Our Lady of the Most Holy Rosary Parish', vicariate: 'Sta. Rosa De Lima', class: 'Class A', collections: 4200000 },
  { name: 'Our Mother of Perpetual Help Parish', vicariate: 'Sta. Rosa De Lima', class: 'Class B', collections: 2750000 },
  { name: 'San Lorenzo Ruiz Parish', vicariate: 'Sta. Rosa De Lima', class: 'Class C', collections: 1320000 },
  { name: 'St. John Bosco Parish', vicariate: 'Sta. Rosa De Lima', class: 'Class D', collections: 1850000 },
  { name: 'Sta. Rosa de Lima Parish', vicariate: 'Sta. Rosa De Lima', class: 'Class A', collections: 3950000 },
  // St. Polycarp
  { name: 'Diocesan Shrine of San Vicente Ferrer', vicariate: 'St. Polycarp', class: 'Class B', collections: 2680000 },
  { name: 'Mary Help of Christians Parish', vicariate: 'St. Polycarp', class: 'Class C', collections: 1540000 },
  { name: 'San Miguel Arkanghel Parish', vicariate: 'St. Polycarp', class: 'Class D', collections: 1780000 },
  { name: 'St. Francis of Assisi Parish', vicariate: 'St. Polycarp', class: 'Class A', collections: 3450000 },
  { name: 'St. Polycarp Parish', vicariate: 'St. Polycarp', class: 'Class B', collections: 2590000 },
  { name: 'St. Joseph the Worker Parish', vicariate: 'St. Polycarp', class: 'Class C', collections: 1470000 },
  // St. John the Baptist
  { name: 'Holy Trinity Parish', vicariate: 'St. John the Baptist', class: 'Class D', collections: 1950000 },
  { name: 'Mary Help of Christians Parish', vicariate: 'St. John the Baptist', class: 'Class A', collections: 3650000 },
  { name: 'Our Lady of Fatima Parish', vicariate: 'St. John the Baptist', class: 'Class B', collections: 2720000 },
  { name: 'San Agustin Parish', vicariate: 'St. John the Baptist', class: 'Class C', collections: 1580000 },
  { name: 'San Isidro Labrador Parish', vicariate: 'St. John the Baptist', class: 'Class D', collections: 1820000 },
  { name: 'San Pedro Calungsod Parish', vicariate: 'St. John the Baptist', class: 'Class A', collections: 3250000 },
  { name: 'San Vicente Ferrer Parish', vicariate: 'St. John the Baptist', class: 'Class B', collections: 2640000 },
  { name: 'St. John the Baptist Parish', vicariate: 'St. John the Baptist', class: 'Class C', collections: 1490000 },
  { name: 'St. Joseph the Worker Parish', vicariate: 'St. John the Baptist', class: 'Class D', collections: 1760000 },
  { name: 'St. Mary Magdalene Parish', vicariate: 'St. John the Baptist', class: 'Class A', collections: 3550000 },
  { name: 'Sts. Peter and Paul Parish', vicariate: 'St. John the Baptist', class: 'Class B', collections: 2580000 },
  // Immaculate Conception
  { name: 'Diocesan Shrine of St. Therese of the Child Jesus', vicariate: 'Immaculate Conception', class: 'Class C', collections: 1620000 },
  { name: 'Immaculate Conception Parish', vicariate: 'Immaculate Conception', class: 'Class D', collections: 1880000 },
  { name: 'San Agustin Parish', vicariate: 'Immaculate Conception', class: 'Class A', collections: 3420000 },
  { name: 'San Antonio De Padua Parish', vicariate: 'Immaculate Conception', class: 'Class B', collections: 2650000 },
  { name: 'San Isidro Labrador Parish', vicariate: 'Immaculate Conception', class: 'Class C', collections: 1520000 },
  { name: 'San Nicholas De Tolentino Parish', vicariate: 'Immaculate Conception', class: 'Class D', collections: 1790000 },
  // St. Paul the First Hermit
  { name: 'Cathedral Parish of St. Paul the First Hermit', vicariate: 'St. Paul the First Hermit', class: 'Class A', collections: 5850000 },
  { name: 'Nuestra Señora de Los Remedios Parish', vicariate: 'St. Paul the First Hermit', class: 'Class B', collections: 2720000 },
  { name: 'Our Lady of the Pillar Parish', vicariate: 'St. Paul the First Hermit', class: 'Class C', collections: 1480000 },
  { name: 'San Gabriel Arkanghel Parish', vicariate: 'St. Paul the First Hermit', class: 'Class D', collections: 1920000 },
  { name: 'St. Francis of Assisi Parish', vicariate: 'St. Paul the First Hermit', class: 'Class A', collections: 3650000 },
  { name: 'St. Luke the Evangelist Parish', vicariate: 'St. Paul the First Hermit', class: 'Class B', collections: 2840000 },
  { name: 'San Roque Parish', vicariate: 'St. Paul the First Hermit', class: 'Class C', collections: 1510000 },
  { name: 'Immaculate Conception Parish', vicariate: 'St. Paul the First Hermit', class: 'Class D', collections: 1750000 },
  // San Bartolome
  { name: 'Nuestra Señora Del Pilar Parish', vicariate: 'San Bartolome', class: 'Class A', collections: 3480000 },
  { name: 'St. Mary Magdalene Parish', vicariate: 'San Bartolome', class: 'Class B', collections: 2620000 },
  { name: 'St. Gregory the Great Parish', vicariate: 'San Bartolome', class: 'Class C', collections: 1550000 },
  { name: 'San Bartholomew the Apostle Parish', vicariate: 'San Bartolome', class: 'Class D', collections: 1820000 },
  { name: 'St. John the Baptist Parish', vicariate: 'San Bartolome', class: 'Class A', collections: 3350000 },
  { name: 'St. Michael the Archangel Parish', vicariate: 'San Bartolome', class: 'Class B', collections: 2690000 },
  { name: 'Sts. Joachim and Anne Parish', vicariate: 'San Bartolome', class: 'Class C', collections: 1420000 },
  // San Antonio De Padua
  { name: 'Immaculate Conception Parish (San Antonio)', vicariate: 'San Antonio De Padua', class: 'Class D', collections: 1750000 },
  { name: 'La Resurrecion Parish', vicariate: 'San Antonio De Padua', class: 'Class A', collections: 3580000 },
  { name: 'National Shrine of San Antonio de Padua', vicariate: 'San Antonio De Padua', class: 'Class B', collections: 2820000 },
  { name: 'San Jose Parish', vicariate: 'San Antonio De Padua', class: 'Class C', collections: 1590000 },
  { name: 'St. John Paul II Parish', vicariate: 'San Antonio De Padua', class: 'Class D', collections: 1840000 },
  // Our Lady of Guadalupe
  { name: 'Diocesan Shrine of Our Lady of Guadalupe', vicariate: 'Our Lady of Guadalupe', class: 'Class A', collections: 3720000 },
  { name: 'Parroquia De Nuestra Señora del Rosario', vicariate: 'Our Lady of Guadalupe', class: 'Class B', collections: 2650000 },
  { name: 'San Sebastian Parish', vicariate: 'Our Lady of Guadalupe', class: 'Class C', collections: 1480000 },
  { name: 'Transfiguration of the Lord Parish', vicariate: 'Our Lady of Guadalupe', class: 'Class D', collections: 1920000 },
  // St. James
  { name: 'St. Peter of Alcantara Parish', vicariate: 'St. James', class: 'Class A', collections: 3450000 },
  { name: 'Nuestra Señora dela Natividad Parish', vicariate: 'St. James', class: 'Class B', collections: 2720000 },
  { name: 'San Antonio de Padua Parish (St. James)', vicariate: 'St. James', class: 'Class C', collections: 1510000 },
  { name: 'St. James the Apostle Parish', vicariate: 'St. James', class: 'Class D', collections: 1880000 },
  { name: 'St. John the Baptist Parish (St. James)', vicariate: 'St. James', class: 'Class A', collections: 3320000 },
  { name: 'St. John the Evangelist Parish', vicariate: 'St. James', class: 'Class B', collections: 2650000 },
  { name: 'St. Mark the Evangelist Parish', vicariate: 'St. James', class: 'Class C', collections: 1420000 },
  // Sts. Peter and Paul
  { name: 'Nuestra Señora De Candelaria Parish', vicariate: 'Sts. Peter and Paul', class: 'Class D', collections: 1780000 },
  { name: 'Nuestra Señora de los Angeles Parish', vicariate: 'Sts. Peter and Paul', class: 'Class A', collections: 3550000 },
  { name: 'San Isidro Labrador Parish (Sts. Peter and Paul)', vicariate: 'Sts. Peter and Paul', class: 'Class B', collections: 2820000 },
  { name: 'San Sebastian Parish (Sts. Peter and Paul)', vicariate: 'Sts. Peter and Paul', class: 'Class C', collections: 1590000 },
  { name: 'Sts. Peter and Paul Parish', vicariate: 'Sts. Peter and Paul', class: 'Class D', collections: 1840000 },
];

export const APP_CONFIG = {
  name: 'Diocese of San Pablo',
  logoPath: '/assets/566522138_1374378061059695_7865351978330714529_n.png',
  primaryColor: '#D4AF37',
  secondaryColor: '#1E3A8A'
};
