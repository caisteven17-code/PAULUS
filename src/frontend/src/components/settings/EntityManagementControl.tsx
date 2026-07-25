'use client';

import React, { useState, useEffect } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Building2,
  School,
  GraduationCap,
  AlertTriangle,
  ArrowRight,
  Maximize2,
  Loader2,
  ShieldAlert,
  CheckCircle,
  Database,
  X,
  Phone,
  Mail,
  MapPin,
  Archive,
  Users,
  Layers,
  ArrowUpDown,
  History,
  GripVertical,
} from 'lucide-react';
import { Parish, Seminary, DiocesanSchool, EntityClass } from '../../types';
import { VICARIATES, CLASSES, ALL_PARISHES, INITIAL_PARISHES } from '../../constants';
import { dataService } from '../../services/dataService';
import { roundedField, selectField } from '../../lib/formStyles';
import { ENTITY_TYPE_ICON } from '../../lib/entityIcons';
import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { EntityLocationMapModal, DraggableMarker, UpdateMapCenter } from './EntityLocationMapModal';
import { EntityDeleteConfirmModal } from './EntityDeleteConfirmModal';

interface EntityManagementControlProps {
  parishes: Parish[];
  seminaries: Seminary[];
  schools: DiocesanSchool[];
  onUpdateParishes: (parishes: Parish[]) => void;
  onUpdateSeminaries: (seminaries: Seminary[]) => void;
  onUpdateSchools: (schools: DiocesanSchool[]) => void;
  onNavigate?: (page: string) => void;
  accounts?: any[];
  currentUser?: any;
}

const stripVicariatePrefix = (name: string) => name.replace('Vicariate of ', '');

const getInstitutionCode = (entity: any) =>
  String(entity?.iafrSourceCode || entity?.iafr_source_code || entity?.institutionCode || entity?.institution_code || '').trim();

const normalizeInstitutionCode = (value: string) => value.trim().toUpperCase().replace(/\s+/g, '');

const DISTRICTS = ['District I', 'District II', 'District III', 'District IV'];

const VICARIATE_TO_DISTRICT: Record<string, string> = {
  'Holy Family': 'District I',
  'San Isidro Labrador': 'District I',
  'San Pedro Apostol': 'District I',
  'Sta. Rosa De Lima': 'District II',
  'St. Polycarp': 'District II',
  'St. John the Baptist': 'District II',
  'Immaculate Conception': 'District II',
  'St. Paul the First Hermit': 'District III',
  'San Bartolome': 'District III',
  'San Antonio De Padua': 'District III',
  'Our Lady of Guadalupe': 'District IV',
  'St. James': 'District IV',
  'Sts. Peter and Paul': 'District IV',
};

const LAGUNA_CITIES_TOWNS = [
  'Alaminos',
  'Bay',
  'Biñan City',
  'Cabuyao City',
  'Calamba City',
  'Calauan',
  'Cavinti',
  'Famy',
  'Kalayaan',
  'Liliw',
  'Los Baños',
  'Luisiana',
  'Mabitac',
  'Magdalena',
  'Majayjay',
  'Nagcarlan',
  'Paete',
  'Pagsanjan',
  'Pakil',
  'Pangil',
  'Pila',
  'Rizal',
  'San Pablo City',
  'San Pedro City',
  'Santa Cruz',
  'Santa Maria',
  'Santa Rosa City',
  'Siniloan',
  'Victoria',
];

const CITY_TO_VICARIATE: Record<string, string> = {
  Alaminos: 'St. Paul the First Hermit',
  Bay: 'Immaculate Conception',
  'Biñan City': 'San Isidro Labrador',
  'Cabuyao City': 'St. Polycarp',
  'Calamba City': 'St. John the Baptist',
  Calauan: 'St. Paul the First Hermit',
  Cavinti: 'San Bartolome',
  Famy: 'Sts. Peter and Paul',
  Kalayaan: 'Our Lady of Guadalupe',
  Liliw: 'San Bartolome',
  'Los Baños': 'Immaculate Conception',
  Luisiana: 'San Bartolome',
  Mabitac: 'Sts. Peter and Paul',
  Magdalena: 'San Bartolome',
  Majayjay: 'San Bartolome',
  Nagcarlan: 'San Bartolome',
  Paete: 'Our Lady of Guadalupe',
  Pagsanjan: 'Our Lady of Guadalupe',
  Pakil: 'St. James',
  Pangil: 'St. James',
  Pila: 'San Antonio De Padua',
  Rizal: 'St. Paul the First Hermit',
  'San Pablo City': 'St. Paul the First Hermit',
  'San Pedro City': 'San Pedro Apostol',
  'Santa Cruz': 'Immaculate Conception',
  'Santa Maria': 'Sts. Peter and Paul',
  'Santa Rosa City': 'Sta. Rosa De Lima',
  Siniloan: 'Sts. Peter and Paul',
  Victoria: 'San Antonio De Padua',
};

const getCityFromGoogleComponents = (components: any[]) => {
  if (!components) return null;
  const locality = components.find((c: any) => c.types.includes('locality'));
  if (locality) return locality.long_name;

  const adminArea3 = components.find((c: any) => c.types.includes('administrative_area_level_3'));
  if (adminArea3) return adminArea3.long_name;

  const sublocality = components.find((c: any) => c.types.includes('sublocality_level_1'));
  if (sublocality) return sublocality.long_name;

  return null;
};

const matchLagunaCity = (geocodedName: string): string | null => {
  if (!geocodedName) return null;

  const normalize = (str: string) =>
    str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove accents (e.g. ñ -> n)
      .replace(/ñ/g, 'n')
      .replace(/\bcity\b/g, '')
      .replace(/\bof\b/g, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();

  const cleanGeocoded = normalize(geocodedName);

  for (const city of LAGUNA_CITIES_TOWNS) {
    if (normalize(city) === cleanGeocoded) {
      return city;
    }
  }

  // Substring fallback
  for (const city of LAGUNA_CITIES_TOWNS) {
    const cleanCity = normalize(city);
    if (cleanCity.includes(cleanGeocoded) || cleanGeocoded.includes(cleanCity)) {
      return city;
    }
  }

  return null;
};

export function EntityManagementControl({
  parishes,
  seminaries,
  schools,
  onUpdateParishes,
  onUpdateSeminaries,
  onUpdateSchools,
  onNavigate,
  accounts = [],
  currentUser,
}: EntityManagementControlProps) {
  const [activeSubTab, setActiveSubTab] = useState<'parishes' | 'seminaries' | 'schools'>('parishes');
  const [searchQuery, setSearchQuery] = useState('');
  const [vicariateFilter, setVicariateFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const [districtFilter, setDistrictFilter] = useState('all');
  const [clusterFilter, setClusterFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState<{ key: 'name' | 'iafrSourceCode'; direction: 'asc' | 'desc' }>({
    key: 'iafrSourceCode',
    direction: 'asc',
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<any | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [entityToDelete, setEntityToDelete] = useState<any | null>(null);
  const [viewEntity, setViewEntity] = useState<any | null>(null); // read-only detail modal
  const [showSuccess, setShowSuccess] = useState<{ show: boolean; message: string }>({ show: false, message: '' });
  const [renumberingPreview, setRenumberingPreview] = useState<any | null>(null);
  const [renumberingConfirmation, setRenumberingConfirmation] = useState('');
  const [renumberingError, setRenumberingError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [renumberingHistory, setRenumberingHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [bulkReorderOpen, setBulkReorderOpen] = useState(false);
  const [bulkDistrict, setBulkDistrict] = useState(DISTRICTS[0]);
  const [bulkOrder, setBulkOrder] = useState<Parish[]>([]);
  const [bulkPreview, setBulkPreview] = useState<any | null>(null);
  const [bulkConfirmation, setBulkConfirmation] = useState('');
  const [bulkError, setBulkError] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [draggedParishId, setDraggedParishId] = useState<string | null>(null);

  const [deleteState, setDeleteState] = useState<{
    isChecked: boolean;
    isChecking: boolean;
    hasPastor: boolean;
    hasCollections: boolean;
    hasAccounts: boolean;
    hasProjects: boolean;
    isPredefined: boolean;
    hasAny: boolean;
  }>({
    isChecked: false,
    isChecking: false,
    hasPastor: false,
    hasCollections: false,
    hasAccounts: false,
    hasProjects: false,
    isPredefined: false,
    hasAny: false,
  });

  useEffect(() => {
    setVicariateFilter('all');
    setClassFilter('all');
    setDistrictFilter('all');
    setClusterFilter('all');
    setSortConfig({
      key: activeSubTab === 'parishes' ? 'iafrSourceCode' : 'name',
      direction: 'asc',
    });
  }, [activeSubTab]);

  useEffect(() => {
    if (!entityToDelete) {
      setDeleteState({
        isChecked: false,
        isChecking: false,
        hasPastor: false,
        hasCollections: false,
        hasAccounts: false,
        hasProjects: false,
        isPredefined: false,
        hasAny: false,
      });
      return;
    }

    const runCheck = async () => {
      setDeleteState({
        isChecked: false,
        isChecking: true,
        hasPastor: false,
        hasCollections: false,
        hasAccounts: false,
        hasProjects: false,
        isPredefined: false,
        hasAny: false,
      });

      try {
        const name = entityToDelete.name || '';
        const isParish = activeSubTab === 'parishes';
        const isSeminary = activeSubTab === 'seminaries';
        const isSchool = activeSubTab === 'schools';

        // 1. Pastor / Rector / Principal assignment
        let hasPastor = false;
        if (isParish) {
          hasPastor =
            entityToDelete.pastor &&
            entityToDelete.pastor.trim() !== '' &&
            entityToDelete.pastor.toLowerCase() !== 'not assigned';
        } else if (isSeminary) {
          hasPastor =
            entityToDelete.rector &&
            entityToDelete.rector.trim() !== '' &&
            entityToDelete.rector.toLowerCase() !== 'not assigned';
        } else if (isSchool) {
          hasPastor =
            entityToDelete.principal &&
            entityToDelete.principal.trim() !== '' &&
            entityToDelete.principal.toLowerCase() !== 'not assigned';
        }

        // 2. Collections check
        const hasCollections = entityToDelete.collections && entityToDelete.collections > 0;

        // 3. Profiles / User assignments (accounts)
        const hasAccounts = accounts.some((acc: any) => acc.entity?.toLowerCase() === name.toLowerCase());

        // 4. Financial records in DB
        let hasDbRecords = false;
        if (isParish || isSeminary || isSchool) {
          try {
            const records = await dataService.getRecords(name, activeSubTab.slice(0, -1) as any);
            if (records && records.length > 0) {
              hasDbRecords = records.some((r: any) => r.collections > 0 || r.disbursements > 0);
            }
          } catch (err) {
            console.error('Error fetching records for dependency check:', err);
          }
        }

        // 5. Projects in DB
        let hasDbProjects = false;
        if (isParish || isSeminary || isSchool) {
          try {
            const projects = await dataService.getProjects(name, activeSubTab.slice(0, -1));
            if (projects && projects.length > 0) {
              hasDbProjects = true;
            }
          } catch (err) {
            console.error('Error fetching projects for dependency check:', err);
          }
        }

        // 6. Predefined check (to protect default template data)
        let isPredefined = false;
        if (isParish) {
          isPredefined =
            ALL_PARISHES.some((p: any) => p.name?.toLowerCase() === name.toLowerCase()) ||
            INITIAL_PARISHES.some((p: any) => p.name?.toLowerCase() === name.toLowerCase());
        }

        setDeleteState({
          isChecked: true,
          isChecking: false,
          hasPastor,
          hasCollections: hasCollections || hasDbRecords,
          hasAccounts,
          hasProjects: hasDbProjects,
          isPredefined,
          hasAny: hasPastor || hasCollections || hasDbRecords || hasAccounts || hasDbProjects || isPredefined,
        });
      } catch (err) {
        console.error('Error running dependency check:', err);
        setDeleteState({
          isChecked: true,
          isChecking: false,
          hasPastor: false,
          hasCollections: false,
          hasAccounts: false,
          hasProjects: false,
          isPredefined: false,
          hasAny: false,
        });
      }
    };

    runCheck();
  }, [entityToDelete, activeSubTab, accounts]);

  // Form state
  const [formState, setFormState] = useState<{
    name: string;
    vicariate: string;
    cluster: 1 | 2 | 3;
    class: string;
    address: string;
    iafrSourceCode: string;
    subsidyType: 'subsidized' | 'independent';
    city?: string;
    lat?: number;
    lng?: number;
    district?: string;
  }>({
    name: '',
    vicariate: VICARIATES[0],
    cluster: 1,
    class: CLASSES[0],
    address: '',
    iafrSourceCode: '',
    subsidyType: 'subsidized',
    city: '',
    lat: undefined,
    lng: undefined,
    district: undefined,
  });

  const [showMap, setShowMap] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodingStatus, setGeocodingStatus] = useState<string | null>(null);
  const [lastGeocodedName, setLastGeocodedName] = useState<string>('');
  const [isMapLocked, setIsMapLocked] = useState(true);
  const [isLargeMapOpen, setIsLargeMapOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);

  const handleAutoGeocode = async (nameOverride?: string) => {
    const nameToSearch = nameOverride || formState.name;
    if (!nameToSearch) {
      setGeocodingStatus('Please enter a name first.');
      return;
    }

    const filterPhysical = (items: any[]) => {
      if (!items) return [];
      return items.filter((item: any) => item.class !== 'boundary' && item.type !== 'administrative');
    };

    const filterLagunaOnly = (items: any[]) => {
      if (!items) return [];
      return items.filter((item: any) => (item.display_name || '').toLowerCase().includes('laguna'));
    };

    setIsGeocoding(true);
    setGeocodingStatus('Retrieving coordinates...');

    // High-precision override for Holy Trinity Parish (Pansol, Calamba, Laguna)
    const lowerName = nameToSearch.toLowerCase().trim();
    if (
      lowerName.includes('holy trinity') ||
      lowerName.includes('holy tinity') ||
      lowerName.includes('holy trinty') ||
      (lowerName.includes('trinity') && lowerName.includes('pansol')) ||
      (lowerName.includes('tinity') && lowerName.includes('pansol')) ||
      (lowerName.includes('trinty') && lowerName.includes('pansol'))
    ) {
      setFormState((prev) => ({
        ...prev,
        name: 'Holy Trinity Parish',
        lat: 14.18014,
        lng: 121.18536,
        city: 'Calamba City',
        address: 'Pansol, Calamba City, Laguna',
      }));
      setGeocodingStatus('Coordinates retrieved successfully (high-precision override)!');
      setIsMapLocked(true);
      setShowMap(true);
      setIsGeocoding(false);
      return;
    }

    try {
      // 0. Double Safety Net: If Google API Key is provided in .env, attempt to geocode using Google Maps!
      const googleKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_PLATFORM_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      if (googleKey && googleKey.trim() !== '') {
        try {
          const cityPart = formState.city ? `, ${formState.city}` : '';
          const query = encodeURIComponent(nameToSearch + cityPart + ', Laguna, Philippines');
          const response = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${googleKey}`,
          );
          if (response.ok) {
            const data = await response.json();
            if (data.status === 'OK' && data.results && data.results.length > 0) {
              const filtered = data.results.filter(
                (item: any) =>
                  (item.formatted_address || '').toLowerCase().includes('laguna') &&
                  !(item.formatted_address || '').toLowerCase().includes('quezon'),
              );
              if (filtered.length > 0) {
                const target = filtered[0];
                const lat = target.geometry.location.lat;
                const lng = target.geometry.location.lng;

                let matchedCity = '';
                if (target.address_components) {
                  const googleCity = getCityFromGoogleComponents(target.address_components);
                  if (googleCity) {
                    matchedCity = matchLagunaCity(googleCity) || '';
                  }
                }

                setFormState((prev) => ({
                  ...prev,
                  lat,
                  lng,
                  ...(matchedCity
                    ? {
                        city: matchedCity,
                        address: `${matchedCity}, Laguna`,
                      }
                    : {}),
                }));
                setGeocodingStatus('Coordinates retrieved successfully (via Google Maps)!');
                setIsMapLocked(true);
                setShowMap(true);
                setIsGeocoding(false);
                return;
              }
            }
          }
        } catch (googleErr) {
          console.warn('Google Maps Geocoding failed, falling back to OpenStreetMap:', googleErr);
        }
      }

      // 1. Try highly specific local search: Name + Laguna + Philippines
      const queryParts = [nameToSearch];
      if (formState.city) {
        queryParts.push(formState.city);
      } else if (formState.address) {
        queryParts.push(formState.address);
      }
      queryParts.push('Laguna', 'Philippines');

      let searchQuery = encodeURIComponent(queryParts.join(', '));
      let url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${searchQuery}&limit=10`;

      let response = await fetch(url, {
        headers: {
          'User-Agent': 'CapstoneParishGeocoding/1.0 (contact@diocese-sanpablo.ph)',
        },
      });

      if (!response.ok) throw new Error('Network response was not ok');
      let results = await response.json();
      let filtered = filterLagunaOnly(filterPhysical(results));

      if (filtered.length > 0) {
        const target = filtered[0];
        const lat = parseFloat(target.lat);
        const lng = parseFloat(target.lon);

        let matchedCity = '';
        if (target.address) {
          const osmCity =
            target.address.city ||
            target.address.town ||
            target.address.municipality ||
            target.address.village ||
            target.address.suburb;
          if (osmCity) {
            matchedCity = matchLagunaCity(osmCity) || '';
          }
        }

        setFormState((prev) => ({
          ...prev,
          lat,
          lng,
          ...(matchedCity
            ? {
                city: matchedCity,
                address: `${matchedCity}, Laguna`,
              }
            : {}),
        }));
        setGeocodingStatus('Coordinates retrieved successfully!');
        setIsMapLocked(true);
        setShowMap(true);
        setIsGeocoding(false);
        return;
      }

      // 2. Try broader Laguna search: Name + Laguna + Philippines (without address)
      const lagunaQueryParts = [nameToSearch, 'Laguna', 'Philippines'];
      searchQuery = encodeURIComponent(lagunaQueryParts.join(', '));
      url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${searchQuery}&limit=10`;

      response = await fetch(url, {
        headers: {
          'User-Agent': 'CapstoneParishGeocoding/1.0 (contact@diocese-sanpablo.ph)',
        },
      });

      if (response.ok) {
        results = await response.json();
        filtered = filterLagunaOnly(filterPhysical(results));
        if (filtered.length > 0) {
          const target = filtered[0];
          const lat = parseFloat(target.lat);
          const lng = parseFloat(target.lon);

          let matchedCity = '';
          if (target.address) {
            const osmCity =
              target.address.city ||
              target.address.town ||
              target.address.municipality ||
              target.address.village ||
              target.address.suburb;
            if (osmCity) {
              matchedCity = matchLagunaCity(osmCity) || '';
            }
          }

          setFormState((prev) => ({
            ...prev,
            lat,
            lng,
            ...(matchedCity
              ? {
                  city: matchedCity,
                  address: `${matchedCity}, Laguna`,
                }
              : {}),
          }));
          setGeocodingStatus('Location found in Laguna! Drag pin to adjust if needed.');
          setIsMapLocked(true);
          setShowMap(true);
          setIsGeocoding(false);
          return;
        }
      }

      // 3. Try Philippines-wide search, but strictly filter for Laguna province
      const phQueryParts = [nameToSearch, 'Philippines'];
      searchQuery = encodeURIComponent(phQueryParts.join(', '));
      url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${searchQuery}&limit=15&countrycodes=ph`;

      response = await fetch(url, {
        headers: {
          'User-Agent': 'CapstoneParishGeocoding/1.0 (contact@diocese-sanpablo.ph)',
        },
      });

      if (response.ok) {
        results = await response.json();
        filtered = filterLagunaOnly(filterPhysical(results));
        if (filtered.length > 0) {
          const target = filtered[0];
          const lat = parseFloat(target.lat);
          const lng = parseFloat(target.lon);

          let matchedCity = '';
          if (target.address) {
            const osmCity =
              target.address.city ||
              target.address.town ||
              target.address.municipality ||
              target.address.village ||
              target.address.suburb;
            if (osmCity) {
              matchedCity = matchLagunaCity(osmCity) || '';
            }
          }

          setFormState((prev) => ({
            ...prev,
            lat,
            lng,
            ...(matchedCity
              ? {
                  city: matchedCity,
                  address: `${matchedCity}, Laguna`,
                }
              : {}),
          }));
          setGeocodingStatus('Location found in Laguna! Drag pin on map to adjust.');
          setIsMapLocked(true);
          setShowMap(true);
          setIsGeocoding(false);
          return;
        }
      }

      // 4. If all searches fail, center the map on Laguna as fallback and prompt user to do manual pinning
      setFormState((prev) => ({
        ...prev,
        lat: 14.1686,
        lng: 121.3253,
      }));
      setGeocodingStatus(
        'Parish location not found in Laguna! Coordinates centered on Laguna. Please drag the map pin to manually locate it.',
      );
      setIsMapLocked(false);
      setShowMap(true);
    } catch (error) {
      console.error('Error during geocoding:', error);
      setFormState((prev) => ({
        ...prev,
        lat: 14.1686,
        lng: 121.3253,
      }));
      setGeocodingStatus(
        'Could not retrieve coordinates. Coordinates centered on Laguna. Please unlock and drag map pin.',
      );
      setIsMapLocked(false);
      setShowMap(true);
    } finally {
      setIsGeocoding(false);
    }
  };

  // Debounced auto-retrieve suggestions while typing (500ms debounce)
  useEffect(() => {
    if (activeSubTab !== 'parishes' || !isModalOpen) return;
    if (!formState.name || formState.name.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    // Avoid searching if it matches the last successfully geocoded/selected name
    if (formState.name.trim() === lastGeocodedName.trim()) {
      setSuggestions([]);
      return;
    }

    // High-precision override for Holy Trinity Parish suggestions (supports common typos like tinity / trinty)
    const lowerName = formState.name.toLowerCase().trim();
    if (
      lowerName.includes('holy trinity') ||
      lowerName.includes('holy tinity') ||
      lowerName.includes('holy trinty') ||
      (lowerName.includes('trinity') && lowerName.includes('pansol')) ||
      (lowerName.includes('tinity') && lowerName.includes('pansol')) ||
      (lowerName.includes('trinty') && lowerName.includes('pansol'))
    ) {
      setSuggestions([
        {
          display_name: 'Holy Trinity Parish, Pansol, Calamba City, Laguna',
          lat: '14.18014',
          lon: '121.18536',
          city: 'Calamba City',
        },
      ]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsFetchingSuggestions(true);
      try {
        // 0. Double Safety Net: If Google API Key is provided, fetch suggestions via Google Geocoding API!
        const googleKey =
          process.env.NEXT_PUBLIC_GOOGLE_MAPS_PLATFORM_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
        if (googleKey && googleKey.trim() !== '') {
          try {
            const cityPart = formState.city ? `, ${formState.city}` : '';
            const query = encodeURIComponent(formState.name + cityPart + ', Laguna, Philippines');
            const response = await fetch(
              `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${googleKey}`,
            );
            if (response.ok) {
              const data = await response.json();
              if (data.status === 'OK' && data.results) {
                const physicalOnly = data.results.filter(
                  (item: any) =>
                    (item.formatted_address || '').toLowerCase().includes('laguna') &&
                    !(item.formatted_address || '').toLowerCase().includes('quezon'),
                );
                const mapped = physicalOnly.slice(0, 5).map((item: any) => {
                  let matchedCity = '';
                  if (item.address_components) {
                    const googleCity = getCityFromGoogleComponents(item.address_components);
                    if (googleCity) {
                      matchedCity = matchLagunaCity(googleCity) || '';
                    }
                  }
                  return {
                    display_name: `${item.formatted_address.split(',')[0]}, ${item.formatted_address}`,
                    lat: item.geometry.location.lat.toString(),
                    lon: item.geometry.location.lng.toString(),
                    city: matchedCity,
                  };
                });
                setSuggestions(mapped);
                setIsFetchingSuggestions(false);
                return;
              }
            }
          } catch (googleErr) {
            console.warn('Google Maps autocomplete suggestions failed, falling back to OSM:', googleErr);
          }
        }

        // Query Laguna specific locations via OSM Nominatim
        const cityPart = formState.city ? `, ${formState.city}` : '';
        const query = encodeURIComponent(formState.name + cityPart + ', Laguna, Philippines');
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${query}&limit=15&countrycodes=ph`,
          {
            headers: {
              'User-Agent': 'CapstoneParishGeocoding/1.0 (contact@diocese-sanpablo.ph)',
            },
          },
        );
        if (response.ok) {
          const data = await response.json();
          const physicalOnly = (data || []).filter(
            (item: any) => item.class !== 'boundary' && item.type !== 'administrative',
          );
          const lagunaOnly = physicalOnly.filter((item: any) =>
            (item.display_name || '').toLowerCase().includes('laguna'),
          );
          const mapped = lagunaOnly.slice(0, 5).map((item: any) => {
            let matchedCity = '';
            if (item.address) {
              const osmCity =
                item.address.city ||
                item.address.town ||
                item.address.municipality ||
                item.address.village ||
                item.address.suburb;
              if (osmCity) {
                matchedCity = matchLagunaCity(osmCity) || '';
              }
            }
            return {
              display_name: item.display_name,
              lat: item.lat,
              lon: item.lon,
              city: matchedCity,
            };
          });
          setSuggestions(mapped);
        }
      } catch (err) {
        console.error('Error fetching suggestions:', err);
      } finally {
        setIsFetchingSuggestions(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [formState.name, activeSubTab, isModalOpen, lastGeocodedName]);

  // Debounced auto-retrieve final coordinates (runs when user pauses for 2 seconds and no suggestion was selected)
  useEffect(() => {
    if (activeSubTab !== 'parishes' || !isModalOpen) return;
    if (!formState.name || formState.name.trim() === '') {
      return;
    }

    // Skip initial geocoding for existing parishes if the name has not been modified
    if (editingEntity && formState.name.trim() === editingEntity.name?.trim()) {
      return;
    }

    // Skip if we already auto-geocoded this exact name to prevent loop
    if (formState.name.trim() === lastGeocodedName.trim()) {
      return;
    }

    const timer = setTimeout(() => {
      // If suggestions are visible, let the user pick first instead of auto-locating in the background immediately
      if (suggestions.length > 0) return;
      handleAutoGeocode(formState.name);
      setLastGeocodedName(formState.name);
    }, 2000);

    return () => clearTimeout(timer);
  }, [formState.name, activeSubTab, isModalOpen, editingEntity, lastGeocodedName, suggestions]);

  const handleOpenModal = (entity?: any) => {
    setRenumberingPreview(null);
    setRenumberingConfirmation('');
    setRenumberingError('');
    if (entity) {
      setEditingEntity(entity);
      const rawAddress = entity.address || '';
      let extractedCity = entity.municipality || rawAddress.replace(', Laguna', '').trim();
      if (extractedCity.toLowerCase() === 'laguna') {
        extractedCity = '';
      }
      setFormState({
        name: entity.name || '',
        vicariate: entity.vicariate || VICARIATES[0],
        cluster: entity.cluster || 1,
        class: entity.class || CLASSES[0],
        address: rawAddress,
        iafrSourceCode: getInstitutionCode(entity),
        subsidyType: entity.subsidyType || 'subsidized',
        city: extractedCity,
        lat: entity.lat !== undefined ? Number(entity.lat) : undefined,
        lng: entity.lng !== undefined ? Number(entity.lng) : undefined,
        district: entity.district || VICARIATE_TO_DISTRICT[entity.vicariate || VICARIATES[0]] || DISTRICTS[0],
      });
      setLastGeocodedName(entity.name || '');
      setShowMap(entity.lat !== undefined && entity.lng !== undefined);
      setIsMapLocked(true);
    } else {
      setEditingEntity(null);
      setFormState({
        name: '',
        vicariate: '',
        cluster: 1,
        class: CLASSES[0],
        address: '',
        iafrSourceCode: '',
        subsidyType: 'subsidized',
        city: '',
        lat: undefined,
        lng: undefined,
        district: '',
      });
      setLastGeocodedName('');
      setShowMap(false);
      setIsMapLocked(true);
    }
    setSuggestions([]);
    setIsFetchingSuggestions(false);
    setGeocodingStatus(null);
    setIsModalOpen(true);
  };

  const openRenumberingHistory = async () => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const response = await fetch('/api/admin/entities/parish-renumbering/history', {
        headers: {
          'x-user-id': String(currentUser?.id || currentUser?.uid || ''),
          'x-user-name': String(currentUser?.displayName || currentUser?.name || currentUser?.email || 'Authorized user'),
          'x-user-role': String(currentUser?.accessRole || currentUser?.roleId || currentUser?.role || ''),
        },
      });
      const body = await response.json().catch(() => []);
      if (!response.ok) throw new Error(body?.error || 'Unable to load renumbering history.');
      setRenumberingHistory(Array.isArray(body) ? body : []);
    } catch (error) {
      setRenumberingHistory([]);
      setRenumberingError(error instanceof Error ? error.message : 'Unable to load renumbering history.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const parishesForDistrict = (district: string) =>
    parishes
      .filter((parish) => parish.status !== 'inactive')
      .filter((parish) => (parish.district || VICARIATE_TO_DISTRICT[parish.vicariate]) === district)
      .sort((left, right) =>
        getInstitutionCode(left).localeCompare(getInstitutionCode(right), undefined, { numeric: true }),
      );

  const openBulkReorder = () => {
    const district = DISTRICTS[0];
    setBulkDistrict(district);
    setBulkOrder(parishesForDistrict(district));
    setBulkPreview(null);
    setBulkConfirmation('');
    setBulkError('');
    setBulkReorderOpen(true);
  };

  const changeBulkDistrict = (district: string) => {
    setBulkDistrict(district);
    setBulkOrder(parishesForDistrict(district));
    setBulkPreview(null);
    setBulkConfirmation('');
    setBulkError('');
  };

  const moveBulkParish = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    setBulkOrder((current) => {
      const fromIndex = current.findIndex((parish) => parish.id === fromId);
      const toIndex = current.findIndex((parish) => parish.id === toId);
      if (fromIndex < 0 || toIndex < 0) return current;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    setBulkPreview(null);
    setBulkConfirmation('');
    setBulkError('');
  };

  const bulkRequestHeaders = () => ({
    'Content-Type': 'application/json',
    'x-user-id': String(currentUser?.id || currentUser?.uid || ''),
    'x-user-name': String(currentUser?.displayName || currentUser?.name || currentUser?.email || 'Authorized user'),
    'x-user-role': String(currentUser?.accessRole || currentUser?.roleId || currentUser?.role || ''),
  });

  const previewBulkReorder = async () => {
    setBulkError('');
    setBulkSaving(true);
    try {
      const response = await fetch('/api/admin/entities/parish-renumbering/bulk-preview', {
        method: 'POST',
        headers: bulkRequestHeaders(),
        body: JSON.stringify({ district: bulkDistrict, order: bulkOrder.map((parish) => parish.id) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Unable to preview this parish order.');
      if (!body.affectedParishCount) throw new Error('Move at least one parish before reviewing the reorder.');
      setBulkPreview(body);
      setBulkConfirmation('');
    } catch (error) {
      setBulkError(error instanceof Error ? error.message : 'Unable to preview this parish order.');
    } finally {
      setBulkSaving(false);
    }
  };

  const executeBulkReorder = async () => {
    if (!bulkPreview) return previewBulkReorder();
    if (bulkConfirmation !== 'REORDER') {
      setBulkError('Type REORDER exactly to confirm these source-code changes.');
      return;
    }
    setBulkError('');
    setBulkSaving(true);
    try {
      const response = await fetch('/api/admin/entities/parish-renumbering/bulk-execute', {
        method: 'POST',
        headers: bulkRequestHeaders(),
        body: JSON.stringify({
          district: bulkDistrict,
          order: bulkOrder.map((parish) => parish.id),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'The bulk reorder failed. No source codes were changed.');

      const newCodes = new Map(
        (bulkPreview.changes || []).map((change: any) => [change.institutionId, change.newSourceCode]),
      );
      onUpdateParishes(
        parishes.map((parish) => {
          const newCode = newCodes.get(parish.id) as string | undefined;
          return newCode ? { ...parish, institutionCode: newCode, iafrSourceCode: newCode } : parish;
        }),
      );
      setBulkReorderOpen(false);
      setShowSuccess({
        show: true,
        message: `${body.affectedParishCount ?? bulkPreview.affectedParishCount} parish source code(s) were reordered in ${bulkDistrict}.`,
      });
    } catch (error) {
      setBulkError(error instanceof Error ? error.message : 'The bulk reorder failed. No source codes were changed.');
    } finally {
      setBulkSaving(false);
    }
  };

  const entityIdentity = (entity: any) => ({
    id: entity?.id?.toString(),
    name: entity?.name?.trim().toLowerCase(),
  });

  const upsertEntityList = <T extends { id: string; name: string }>(
    list: T[],
    entity: T,
    previousEntity?: Partial<T> | null,
  ) => {
    const nextIdentity = entityIdentity(entity);
    const previousIdentity = entityIdentity(previousEntity);
    let replaced = false;

    const merged = list.map((item) => {
      const itemIdentity = entityIdentity(item);
      const matches =
        (previousIdentity.id && itemIdentity.id === previousIdentity.id) ||
        (previousIdentity.name && itemIdentity.name === previousIdentity.name) ||
        (nextIdentity.id && itemIdentity.id === nextIdentity.id) ||
        (nextIdentity.name && itemIdentity.name === nextIdentity.name);

      if (!matches) return item;
      replaced = true;
      return { ...item, ...entity };
    });

    return dedupeEntities(replaced ? merged : [...merged, entity]);
  };

  const dedupeEntities = <T extends { id: string; name: string }>(list: T[]) => {
    const seen = new Set<string>();
    return list.filter((item) => {
      const identity = entityIdentity(item);
      const key = identity.id || identity.name;
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = editingEntity ? editingEntity.id : Math.random().toString(36).substr(2, 9);
    const type = activeSubTab === 'parishes' ? 'parish' : activeSubTab === 'seminaries' ? 'seminary' : 'school';

    const requestedSourceCode = normalizeInstitutionCode(formState.iafrSourceCode);
    const requestHeaders = {
      'Content-Type': 'application/json',
      'x-user-id': String(currentUser?.id || currentUser?.uid || ''),
      'x-user-name': String(currentUser?.displayName || currentUser?.name || currentUser?.email || 'Authorized user'),
      'x-user-role': String(currentUser?.accessRole || currentUser?.roleId || currentUser?.role || ''),
    };

    if (activeSubTab === 'parishes' && !editingEntity) {
      setRenumberingError('');
      if (!/^D[1-4]-[1-9][0-9]*$/.test(requestedSourceCode)) {
        setRenumberingError('Enter the official source code in D#-# format, for example D2-42.');
        return;
      }
      if (renumberingPreview?.requestedSourceCode !== requestedSourceCode) {
        setIsSaving(true);
        try {
          const previewResponse = await fetch(
            `/api/admin/entities/parish-renumbering/preview?sourceCode=${encodeURIComponent(requestedSourceCode)}`,
            { headers: requestHeaders },
          );
          const previewBody = await previewResponse.json().catch(() => ({}));
          if (!previewResponse.ok) throw new Error(previewBody.error || 'Unable to calculate the renumbering preview.');
          setRenumberingPreview(previewBody);
          setRenumberingConfirmation('');
        } catch (error) {
          setRenumberingError(error instanceof Error ? error.message : 'Unable to calculate the renumbering preview.');
        } finally {
          setIsSaving(false);
        }
        return;
      }

      if (renumberingConfirmation !== requestedSourceCode) {
        setRenumberingError(`Type ${requestedSourceCode} exactly to confirm the renumbering.`);
        return;
      }

      setIsSaving(true);
      try {
        const executeResponse = await fetch('/api/admin/entities/parish-renumbering/execute', {
          method: 'POST',
          headers: requestHeaders,
          body: JSON.stringify({
            requestedSourceCode,
            parish: {
              name: formState.name,
              district: formState.district,
              vicariate: formState.vicariate,
              class: formState.class,
              address: formState.address,
              municipality: formState.city,
              lat: formState.lat,
              lng: formState.lng,
            },
          }),
        });
        const savedEntity = await executeResponse.json().catch(() => ({}));
        if (!executeResponse.ok) throw new Error(savedEntity.error || 'The parish was not created. No codes were changed.');

        const insertionPosition = Number(requestedSourceCode.split('-')[1]);
        const shifted = parishes.map((parish) => {
          const code = normalizeInstitutionCode(getInstitutionCode(parish));
          const match = code.match(/^(D[1-4])-([1-9][0-9]*)$/);
          if (!match || Number(match[2]) < insertionPosition) return parish;
          const newCode = `${match[1]}-${Number(match[2]) + 1}`;
          return { ...parish, institutionCode: newCode, iafrSourceCode: newCode };
        });
        onUpdateParishes([...shifted, savedEntity]);
        setIsModalOpen(false);
        setShowSuccess({
          show: true,
          message: `Parish created at ${requestedSourceCode}. ${savedEntity?.renumbering?.affectedParishCount ?? renumberingPreview.affectedParishCount} existing source code(s) were updated.`,
        });
      } catch (error) {
        setRenumberingError(error instanceof Error ? error.message : 'The parish was not created. No codes were changed.');
      } finally {
        setIsSaving(false);
      }
      return;
    }

    const baseData = {
      name: formState.name,
      vicariate: formState.vicariate,
      class: formState.class,
      address: formState.address,
      municipality: formState.city,
      institutionCode: normalizeInstitutionCode(formState.iafrSourceCode),
      iafrSourceCode: normalizeInstitutionCode(formState.iafrSourceCode),
    };

    let payload: any = { type };
    if (editingEntity) {
      payload.id = id;
    }

    if (activeSubTab === 'parishes') {
      payload = {
        ...payload,
        ...baseData,
        class: formState.class,
        pastor: editingEntity?.pastor || '',
        contact_number: editingEntity?.contactNumber || '',
        email: editingEntity?.email || '',
        lat: formState.lat,
        lng: formState.lng,
        district: formState.district,
        institutionCode: normalizeInstitutionCode(formState.iafrSourceCode),
        iafrSourceCode: normalizeInstitutionCode(formState.iafrSourceCode),
        subsidy_type: formState.subsidyType,
        status: 'active',
      };
    } else if (activeSubTab === 'seminaries') {
      // Seminaries have no vicariate / district / class / cluster.
      payload = {
        ...payload,
        name: formState.name,
        address: formState.address,
        rector: editingEntity?.rector || '',
        enrollment: editingEntity?.enrollment || 0,
        capacity: editingEntity?.capacity || 0,
        staff: editingEntity?.staff || 0,
        lat: formState.lat,
        lng: formState.lng,
        subsidy_type: formState.subsidyType,
        status: 'active',
      };
    } else {
      // Schools are organized by cluster only — they have no class.
      payload = {
        ...payload,
        name: formState.name,
        cluster: formState.cluster,
        address: formState.address,
        principal: editingEntity?.principal || '',
        level: editingEntity?.level || 'K-12',
        enrollment: editingEntity?.enrollment || 0,
        capacity: editingEntity?.capacity || 0,
        staff: editingEntity?.staff || 0,
        lat: formState.lat,
        lng: formState.lng,
        subsidy_type: formState.subsidyType,
        status: 'active',
      };
    }

    try {
      const method = editingEntity ? 'PATCH' : 'POST';
      const endpoint = editingEntity
        ? `/api/admin/entities?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`
        : '/api/admin/entities';
      const res = await fetch(endpoint, {
        method,
        headers: requestHeaders,
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new Error(errorText || `API save failed with status ${res.status}`);
      }
      const savedEntity = await res.json();

      const mappedEntity: any = {
        id: savedEntity.id || id,
        name: savedEntity.name,
        vicariate: savedEntity.vicariate,
        class: savedEntity.class,
        address: savedEntity.address,
        municipality: savedEntity.municipality || formState.city,
        status: savedEntity.status || 'active',
        district: savedEntity.district,
        institutionCode: savedEntity.institutionCode || savedEntity.institution_code || savedEntity.iafrSourceCode || savedEntity.iafr_source_code || normalizeInstitutionCode(formState.iafrSourceCode),
        iafrSourceCode: savedEntity.iafrSourceCode || savedEntity.iafr_source_code || savedEntity.institutionCode || savedEntity.institution_code || normalizeInstitutionCode(formState.iafrSourceCode),
        collections: savedEntity.collections,
        subsidyType: savedEntity.subsidy_type || savedEntity.subsidyType || formState.subsidyType,
        lat: savedEntity.lat !== undefined ? Number(savedEntity.lat) : formState.lat,
        lng: savedEntity.lng !== undefined ? Number(savedEntity.lng) : formState.lng,
      };

      if (activeSubTab === 'parishes') {
        mappedEntity.pastor = savedEntity.pastor;
        mappedEntity.contactNumber = savedEntity.contact_number || savedEntity.contactNumber;
        mappedEntity.email = savedEntity.email;
        mappedEntity.lat = savedEntity.lat !== undefined ? Number(savedEntity.lat) : undefined;
        mappedEntity.lng = savedEntity.lng !== undefined ? Number(savedEntity.lng) : undefined;

        if (editingEntity) {
          onUpdateParishes(parishes.map((p) => (p.id === editingEntity.id ? mappedEntity : p)));
          setShowSuccess({ show: true, message: 'Parish updated successfully!' });
        } else {
          onUpdateParishes([...parishes, mappedEntity]);
          setShowSuccess({ show: true, message: 'Parish created successfully!' });
        }
      } else if (activeSubTab === 'seminaries') {
        mappedEntity.rector = savedEntity.rector;
        mappedEntity.enrollment = savedEntity.enrollment;
        mappedEntity.capacity = savedEntity.capacity;
        mappedEntity.staff = savedEntity.staff;

        if (editingEntity) {
          onUpdateSeminaries(seminaries.map((s) => (s.id === editingEntity.id ? mappedEntity : s)));
          setShowSuccess({ show: true, message: 'Seminary updated successfully!' });
        } else {
          onUpdateSeminaries([...seminaries, mappedEntity]);
          setShowSuccess({ show: true, message: 'Seminary created successfully!' });
        }
      } else {
        mappedEntity.principal = savedEntity.principal;
        mappedEntity.level = savedEntity.level;
        mappedEntity.enrollment = savedEntity.enrollment;
        mappedEntity.capacity = savedEntity.capacity;
        mappedEntity.staff = savedEntity.staff;
        mappedEntity.cluster = savedEntity.cluster || formState.cluster;

        if (editingEntity) {
          onUpdateSchools(schools.map((s) => (s.id === editingEntity.id ? mappedEntity : s)));
          setShowSuccess({ show: true, message: 'School updated successfully!' });
        } else {
          onUpdateSchools([...schools, mappedEntity]);
          setShowSuccess({ show: true, message: 'School created successfully!' });
        }
      }
    } catch (err) {
      console.warn('Error saving entity, falling back to local memory:', err instanceof Error ? err.message : err);
      const baseDataLocal = {
        id,
        name: formState.name,
        vicariate: formState.vicariate,
        class: formState.class,
        address: formState.address,
        municipality: formState.city,
        status: 'active' as const,
      };

      if (activeSubTab === 'parishes') {
        const newParish: Parish = {
          ...baseDataLocal,
          class: formState.class as EntityClass,
          pastor: editingEntity?.pastor || '',
          contactNumber: editingEntity?.contactNumber || '',
          email: editingEntity?.email || '',
          lat: formState.lat,
          lng: formState.lng,
          district: formState.district,
          institutionCode: normalizeInstitutionCode(formState.iafrSourceCode),
          iafrSourceCode: normalizeInstitutionCode(formState.iafrSourceCode),
          subsidyType: formState.subsidyType,
        };
        if (editingEntity) {
          onUpdateParishes(upsertEntityList(parishes, newParish, editingEntity));
          setShowSuccess({ show: true, message: 'Parish updated successfully (Offline Mode)!' });
        } else {
          onUpdateParishes(upsertEntityList(parishes, newParish));
          setShowSuccess({ show: true, message: 'Parish created successfully (Offline Mode)!' });
        }
      } else if (activeSubTab === 'seminaries') {
        const newSeminary: Seminary = {
          ...baseDataLocal,
          class: formState.class as EntityClass,
          rector: editingEntity?.rector || '',
          enrollment: editingEntity?.enrollment || 0,
          capacity: editingEntity?.capacity || 0,
          staff: editingEntity?.staff || 0,
          lat: formState.lat,
          lng: formState.lng,
          subsidyType: formState.subsidyType,
        };
        if (editingEntity) {
          onUpdateSeminaries(upsertEntityList(seminaries, newSeminary, editingEntity));
          setShowSuccess({ show: true, message: 'Seminary updated successfully (Offline Mode)!' });
        } else {
          onUpdateSeminaries(upsertEntityList(seminaries, newSeminary));
          setShowSuccess({ show: true, message: 'Seminary created successfully (Offline Mode)!' });
        }
      } else {
        const newSchool: DiocesanSchool = {
          ...baseDataLocal,
          cluster: formState.cluster,
          class: formState.class as EntityClass,
          principal: editingEntity?.principal || '',
          level: editingEntity?.level || 'K-12',
          enrollment: editingEntity?.enrollment || 0,
          capacity: editingEntity?.capacity || 0,
          staff: editingEntity?.staff || 0,
          lat: formState.lat,
          lng: formState.lng,
          subsidyType: formState.subsidyType,
        };
        if (editingEntity) {
          onUpdateSchools(upsertEntityList(schools, newSchool, editingEntity));
          setShowSuccess({ show: true, message: 'School updated successfully (Offline Mode)!' });
        } else {
          onUpdateSchools(upsertEntityList(schools, newSchool));
          setShowSuccess({ show: true, message: 'School created successfully (Offline Mode)!' });
        }
      }
    }

    setTimeout(() => setShowSuccess({ show: false, message: '' }), 3500);
    setIsModalOpen(false);
  };

  const handleDelete = async () => {
    if (!entityToDelete) return;

    const isParish = activeSubTab === 'parishes';
    const isSeminary = activeSubTab === 'seminaries';
    const isSchool = activeSubTab === 'schools';
    const type = isParish ? 'parish' : isSeminary ? 'seminary' : 'school';

    const hardDelete = !deleteState.hasAny;

    try {
      const res = await fetch('/api/admin/entities', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, id: entityToDelete.id, hard: hardDelete }),
      });

      if (!res.ok) throw new Error('API delete failed');

      if (isParish) {
        if (hardDelete) {
          onUpdateParishes(parishes.filter((p) => p.id !== entityToDelete.id));
          setShowSuccess({ show: true, message: 'Parish permanently deleted!' });
        } else {
          onUpdateParishes(parishes.map((p) => (p.id === entityToDelete.id ? { ...p, status: 'inactive' } : p)));
          setShowSuccess({ show: true, message: 'Parish archived successfully to protect historical data!' });
        }
      } else if (isSeminary) {
        if (hardDelete) {
          onUpdateSeminaries(seminaries.filter((s) => s.id !== entityToDelete.id));
          setShowSuccess({ show: true, message: 'Seminary permanently deleted!' });
        } else {
          onUpdateSeminaries(seminaries.map((s) => (s.id === entityToDelete.id ? { ...s, status: 'inactive' } : s)));
          setShowSuccess({ show: true, message: 'Seminary archived successfully!' });
        }
      } else {
        if (hardDelete) {
          onUpdateSchools(schools.filter((s) => s.id !== entityToDelete.id));
          setShowSuccess({ show: true, message: 'School permanently deleted!' });
        } else {
          onUpdateSchools(schools.map((s) => (s.id === entityToDelete.id ? { ...s, status: 'inactive' } : s)));
          setShowSuccess({ show: true, message: 'School archived successfully!' });
        }
      }
    } catch (err) {
      console.error('Error during deletion, falling back to local memory:', err);
      if (isParish) {
        if (hardDelete) {
          onUpdateParishes(parishes.filter((p) => p.id !== entityToDelete.id));
          setShowSuccess({ show: true, message: 'Parish permanently deleted (Offline Mode)!' });
        } else {
          onUpdateParishes(parishes.map((p) => (p.id === entityToDelete.id ? { ...p, status: 'inactive' } : p)));
          setShowSuccess({ show: true, message: 'Parish archived successfully (Offline Mode)!' });
        }
      } else if (isSeminary) {
        if (hardDelete) {
          onUpdateSeminaries(seminaries.filter((s) => s.id !== entityToDelete.id));
          setShowSuccess({ show: true, message: 'Seminary permanently deleted (Offline Mode)!' });
        } else {
          onUpdateSeminaries(seminaries.map((s) => (s.id === entityToDelete.id ? { ...s, status: 'inactive' } : s)));
          setShowSuccess({ show: true, message: 'Seminary archived successfully (Offline Mode)!' });
        }
      } else {
        if (hardDelete) {
          onUpdateSchools(schools.filter((s) => s.id !== entityToDelete.id));
          setShowSuccess({ show: true, message: 'School permanently deleted (Offline Mode)!' });
        } else {
          onUpdateSchools(schools.map((s) => (s.id === entityToDelete.id ? { ...s, status: 'inactive' } : s)));
          setShowSuccess({ show: true, message: 'School archived successfully (Offline Mode)!' });
        }
      }
    }

    setTimeout(() => setShowSuccess({ show: false, message: '' }), 3500);
    setIsDeleteModalOpen(false);
    setEntityToDelete(null);
  };

  const filteredData = () => {
    const query = searchQuery.trim().toLowerCase();
    const itemClass = (item: any) => item.class || item.entityClass || '';
    const itemDistrict = (item: any) => item.district || VICARIATE_TO_DISTRICT[item.vicariate] || '';
    const matchesQuery = (item: any, fields: any[]) =>
      query.length === 0 || fields.filter(Boolean).some((field) => String(field).toLowerCase().includes(query));
    const sortItems = (items: any[]) => {
      const direction = sortConfig.direction === 'asc' ? 1 : -1;
      return [...items].sort((a, b) => {
        const left = sortConfig.key === 'iafrSourceCode' ? getInstitutionCode(a) : a.name || '';
        const right = sortConfig.key === 'iafrSourceCode' ? getInstitutionCode(b) : b.name || '';
        return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' }) * direction;
      });
    };

    if (activeSubTab === 'parishes') {
      return sortItems(dedupeEntities(parishes)
        .filter((p) => p.status !== 'inactive')
        .filter((p) => matchesQuery(p, [p.name, getInstitutionCode(p), p.address, p.vicariate, itemClass(p), itemDistrict(p)]))
        .filter((p) => vicariateFilter === 'all' || p.vicariate === vicariateFilter)
        .filter((p) => classFilter === 'all' || itemClass(p) === classFilter)
        .filter((p) => districtFilter === 'all' || itemDistrict(p) === districtFilter));
    } else if (activeSubTab === 'seminaries') {
      return sortItems(dedupeEntities(seminaries)
        .filter((s) => s.status !== 'inactive')
        .filter((s) => matchesQuery(s, [s.name, s.address, s.vicariate, itemClass(s), itemDistrict(s)]))
        .filter((s) => vicariateFilter === 'all' || s.vicariate === vicariateFilter)
        .filter((s) => classFilter === 'all' || itemClass(s) === classFilter)
        .filter((s) => districtFilter === 'all' || itemDistrict(s) === districtFilter));
    } else {
      return sortItems(dedupeEntities(schools)
        .filter((s) => s.status !== 'inactive')
        .filter((s) => matchesQuery(s, [s.name, s.address, `Cluster ${s.cluster}`, itemClass(s), s.level]))
        .filter((s) => clusterFilter === 'all' || String(s.cluster) === clusterFilter)
        .filter((s) => classFilter === 'all' || itemClass(s) === classFilter));
    }
  };

  const toggleSort = (key: 'name' | 'iafrSourceCode') => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const visibleEntities = filteredData();
  const activeCounts = {
    parishes: dedupeEntities(parishes).filter((item) => item.status !== 'inactive').length,
    seminaries: dedupeEntities(seminaries).filter((item) => item.status !== 'inactive').length,
    schools: dedupeEntities(schools).filter((item) => item.status !== 'inactive').length,
  };
  const currentTypeLabel = activeSubTab === 'parishes' ? 'Parishes' : activeSubTab === 'seminaries' ? 'Seminaries' : 'Schools';
  const CurrentTypeIcon = activeSubTab === 'parishes' ? ENTITY_TYPE_ICON.parish : activeSubTab === 'seminaries' ? GraduationCap : School;

  return (
    <div className="space-y-5">
      {/* Delete Confirmation Modal */}
      <EntityDeleteConfirmModal
        isOpen={isDeleteModalOpen}
        onCancel={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDelete}
        entityToDelete={entityToDelete}
        deleteState={deleteState}
      />

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-[110] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 border border-gray-100"
          >
            <div className="bg-[#1A1A1A] p-8 text-white relative overflow-hidden shrink-0">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#D4AF37]/10 rounded-full -mr-16 -mt-16 blur-2xl"></div>
              <h3 className="text-2xl font-bold relative z-10">
                {editingEntity ? `Edit ${activeSubTab.slice(0, -1)}` : `Add New ${activeSubTab.slice(0, -1)}`}
              </h3>
              <p className="text-white/50 text-sm mt-1 relative z-10">
                Enter the details for the {activeSubTab.slice(0, -1)} below.
              </p>
            </div>

            <form
              onSubmit={handleSave}
              onKeyDown={(e) => {
                // Prevent standard Enter key form submission from inside input fields
                if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
                  e.preventDefault();
                  // If Enter is pressed inside the Name input field, trigger geocoding search immediately
                  if (activeSubTab === 'parishes' && (e.target as HTMLElement).id === 'parish-name-input') {
                    handleAutoGeocode(formState.name);
                    setLastGeocodedName(formState.name);
                    setSuggestions([]); // Close suggestions popup immediately
                  }
                }
              }}
              className="p-8 space-y-6 flex-1 flex flex-col overflow-hidden"
            >
              {activeSubTab === 'parishes' ? (
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-8 flex-1 overflow-y-auto pr-2 scrollbar-thin items-stretch">
                  {/* Left Column: Parish Details */}
                  <div className="space-y-5">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">
                        Name <span className="text-rose-500 font-bold ml-0.5">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          required
                          id="parish-name-input"
                          value={formState.name}
                          onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                          placeholder="e.g. St. Jude Parish"
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all placeholder:text-gray-400"
                        />
                        {isFetchingSuggestions && (
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-bold uppercase animate-pulse">
                            Searching...
                          </span>
                        )}

                        {suggestions.length > 0 && (
                          <div className="absolute left-0 right-0 top-[calc(100%+4px)] bg-white border border-gray-100 rounded-2xl shadow-xl z-[120] max-h-[220px] overflow-y-auto pr-1 py-2 divide-y divide-gray-50 scrollbar-thin animate-in slide-in-from-top-2 duration-150">
                            {suggestions.map((sug, idx) => {
                              const displayName = sug.display_name.split(',')[0];
                              const addressDetails = sug.display_name.split(',').slice(1, 4).join(',').trim();

                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => {
                                    const lat = parseFloat(sug.lat);
                                    const lng = parseFloat(sug.lon);
                                    setFormState((prev) => ({
                                      ...prev,
                                      name: displayName,
                                      lat,
                                      lng,
                                      ...(sug.city
                                        ? {
                                            city: sug.city,
                                            address: `${sug.city}, Laguna`,
                                          }
                                        : {}),
                                    }));
                                    setLastGeocodedName(displayName);
                                    setGeocodingStatus('Coordinates set successfully from suggestion!');
                                    setIsMapLocked(true);
                                    setSuggestions([]);
                                  }}
                                  className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex flex-col gap-0.5 transition-colors"
                                >
                                  <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                                    📍 {displayName}
                                  </span>
                                  <span className="text-[10px] text-gray-400 truncate max-w-[320px]">
                                    {addressDetails || sug.display_name}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">
                        IAFR Source Code
                      </label>
                      <input
                        type="text"
                        disabled={Boolean(editingEntity)}
                        value={formState.iafrSourceCode}
                        onChange={(e) =>
                          {
                            setFormState({
                              ...formState,
                              iafrSourceCode: normalizeInstitutionCode(e.target.value),
                            });
                            setRenumberingPreview(null);
                            setRenumberingConfirmation('');
                            setRenumberingError('');
                          }
                        }
                        placeholder="e.g. D3-67"
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all placeholder:text-gray-400 font-mono font-bold disabled:cursor-not-allowed disabled:opacity-60"
                      />
                      <p className="mt-1.5 ml-1 text-[10px] text-gray-400">
                        {editingEntity
                          ? 'Official parish code from the IAFR workbook format.'
                          : 'Existing parish codes at this number and above will be moved down automatically.'}
                      </p>
                    </div>

                    {!editingEntity && (
                      <>
                        {renumberingPreview && (
                          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                            <div className="flex items-start gap-3">
                              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-black text-amber-950">Review source-code changes</p>
                                <p className="mt-1 text-xs leading-relaxed text-amber-800">
                                  The new parish will receive <strong>{renumberingPreview.requestedSourceCode}</strong>.{' '}
                                  {renumberingPreview.affectedParishCount} existing parish code(s) will move down by one.
                                </p>
                                <div className="mt-3 max-h-36 space-y-1 overflow-y-auto rounded-xl bg-white/70 p-3">
                                  {(renumberingPreview.changes || []).slice(0, 20).map((change: any) => (
                                    <div key={change.institutionId} className="flex items-center justify-between gap-3 text-[11px]">
                                      <span className="truncate font-semibold text-slate-600">{change.parishName}</span>
                                      <span className="shrink-0 font-mono font-black text-slate-900">
                                        {change.oldSourceCode} → {change.newSourceCode}
                                      </span>
                                    </div>
                                  ))}
                                  {renumberingPreview.affectedParishCount > 20 && (
                                    <p className="pt-1 text-[10px] font-bold text-amber-700">
                                      And {renumberingPreview.affectedParishCount - 20} more parish(es)
                                    </p>
                                  )}
                                </div>
                                <label className="mt-3 block text-[10px] font-black uppercase tracking-wider text-amber-900">
                                  Type {renumberingPreview.requestedSourceCode} to confirm
                                </label>
                                <input
                                  type="text"
                                  value={renumberingConfirmation}
                                  onChange={(e) => {
                                    setRenumberingConfirmation(normalizeInstitutionCode(e.target.value));
                                    setRenumberingError('');
                                  }}
                                  className="mt-1.5 w-full rounded-xl border border-amber-300 bg-white px-3 py-2 font-mono text-sm font-black text-slate-900 outline-none focus:border-amber-500"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {renumberingError && (
                          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
                            {renumberingError}
                          </div>
                        )}
                      </>
                    )}

                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">
                        City / Town <span className="text-rose-500 font-bold ml-0.5">*</span>
                      </label>
                      <div className="relative">
                        <select
                          required
                          value={formState.city || ''}
                          onChange={(e) => {
                            const selectedCity = e.target.value;
                            setFormState((prev) => ({
                              ...prev,
                              city: selectedCity,
                              address: selectedCity ? `${selectedCity}, Laguna` : '',
                            }));
                          }}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all appearance-none font-medium text-sm"
                        >
                          <option value="" disabled hidden>
                            Select City or Town...
                          </option>
                          {(() => {
                            const list = [...LAGUNA_CITIES_TOWNS];
                            if (formState.city && !list.includes(formState.city)) {
                              list.push(formState.city);
                              list.sort();
                            }
                            return list.map((city) => (
                              <option key={city} value={city}>
                                {city}
                              </option>
                            ));
                          })()}
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                          <ArrowRight className="w-4 h-4 text-gray-400 rotate-90" />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">
                        Vicariate <span className="text-rose-500 font-bold ml-0.5">*</span>
                      </label>
                      <div className="relative">
                        <select
                          required
                          value={formState.vicariate}
                          onChange={(e) => {
                            const vicVal = e.target.value;
                            const autoDist = vicVal ? VICARIATE_TO_DISTRICT[vicVal] || DISTRICTS[0] : '';
                            setFormState((prev) => ({
                              ...prev,
                              vicariate: vicVal,
                              district: autoDist,
                            }));
                          }}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all appearance-none"
                        >
                          <option value="" disabled hidden>
                            Select Vicariate...
                          </option>
                          {VICARIATES.map((v) => (
                            <option key={v} value={v}>
                              {stripVicariatePrefix(v)}
                            </option>
                          ))}
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                          <ArrowRight className="w-4 h-4 text-gray-400 rotate-90" />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">
                        District <span className="text-rose-500 font-bold ml-0.5">*</span>
                      </label>
                      <div className="relative">
                        <select
                          required
                          value={formState.district || ''}
                          onChange={(e) => setFormState({ ...formState, district: e.target.value })}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all appearance-none"
                        >
                          <option value="" disabled hidden>
                            Select District...
                          </option>
                          {DISTRICTS.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                          <ArrowRight className="w-4 h-4 text-gray-400 rotate-90" />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">
                        Subsidy Type <span className="text-rose-500 font-bold ml-0.5">*</span>
                      </label>
                      <div className="relative">
                        <select
                          required
                          value={formState.subsidyType}
                          onChange={(e) => setFormState({ ...formState, subsidyType: e.target.value as 'subsidized' | 'independent' })}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all appearance-none"
                        >
                          <option value="subsidized">Subsidized</option>
                          <option value="independent">Independent</option>
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                          <ArrowRight className="w-4 h-4 text-gray-400 rotate-90" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Middle Column: Divider Line */}
                  <div className="hidden md:block w-px bg-gray-200 self-stretch my-2"></div>

                  {/* Right Column: Coordinates & Map */}
                  <div className="space-y-5 flex flex-col justify-between">
                    <div className="space-y-4">
                      <div className="flex gap-4">
                        <div className="flex-1">
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">
                            Latitude <span className="text-rose-500 font-bold ml-0.5">*</span>
                          </label>
                          <input
                            type="number"
                            step="any"
                            required
                            disabled={isMapLocked}
                            value={formState.lat !== undefined ? formState.lat : ''}
                            onChange={(e) =>
                              setFormState({
                                ...formState,
                                lat: e.target.value === '' ? undefined : Number(e.target.value),
                              })
                            }
                            placeholder="e.g. 14.1686"
                            className={`w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all placeholder:text-gray-400 text-xs ${
                              isMapLocked ? 'opacity-60 cursor-not-allowed bg-gray-100/50' : ''
                            }`}
                          />
                        </div>
                        <div className="flex-1">
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">
                            Longitude <span className="text-rose-500 font-bold ml-0.5">*</span>
                          </label>
                          <input
                            type="number"
                            step="any"
                            required
                            disabled={isMapLocked}
                            value={formState.lng !== undefined ? formState.lng : ''}
                            onChange={(e) =>
                              setFormState({
                                ...formState,
                                lng: e.target.value === '' ? undefined : Number(e.target.value),
                              })
                            }
                            placeholder="e.g. 121.3253"
                            className={`w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all placeholder:text-gray-400 text-xs ${
                              isMapLocked ? 'opacity-60 cursor-not-allowed bg-gray-100/50' : ''
                            }`}
                          />
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between mt-1 px-1">
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                              isMapLocked ? 'text-gray-400' : 'text-amber-600 animate-pulse'
                            }`}
                          >
                            {isMapLocked ? '🔒 Coordinates Locked' : '🔓 Coordinates Editable'}
                          </span>
                          {isMapLocked && (
                            <button
                              type="button"
                              onClick={() => setIsMapLocked(false)}
                              className="text-[10px] font-bold text-[#D4AF37] hover:underline hover:text-[#B5952F] transition-all"
                            >
                              Unlock manual pinning
                            </button>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setIsMapLocked(false);
                              setIsLargeMapOpen(true);
                            }}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-all border border-gray-200"
                          >
                            <Maximize2 className="w-3.5 h-3.5 text-gray-500" />
                            <span>Fullscreen Map</span>
                          </button>
                        </div>
                        {geocodingStatus && (
                          <div
                            className={`text-[10px] font-bold px-3 py-2 rounded-xl border leading-relaxed ${
                              geocodingStatus.includes('Retrieving')
                                ? 'text-gray-600 bg-gray-50/50 border-gray-100'
                                : geocodingStatus.includes('not found') ||
                                    geocodingStatus.includes('Could not') ||
                                    geocodingStatus.includes('Please enter')
                                  ? 'text-rose-700 bg-rose-50/50 border-rose-100'
                                  : 'text-emerald-700 bg-emerald-50/50 border-emerald-100'
                            }`}
                          >
                            {geocodingStatus}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="w-full h-[220px] rounded-xl overflow-hidden border border-gray-200 relative z-20 shrink-0">
                      <MapContainer
                        center={[
                          formState.lat !== undefined ? formState.lat : 14.1686,
                          formState.lng !== undefined ? formState.lng : 121.3253,
                        ]}
                        zoom={13}
                        style={{ height: '100%', width: '100%' }}
                        zoomControl={true}
                        maxBounds={[
                          [13.9, 120.9],
                          [14.45, 121.75],
                        ]}
                      >
                        <UpdateMapCenter
                          center={[
                            formState.lat !== undefined ? formState.lat : 14.1686,
                            formState.lng !== undefined ? formState.lng : 121.3253,
                          ]}
                        />
                        <TileLayer
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        />
                        <DraggableMarker
                          position={[
                            formState.lat !== undefined ? formState.lat : 14.1686,
                            formState.lng !== undefined ? formState.lng : 121.3253,
                          ]}
                          onDragEnd={(lat, lng) => {
                            // Clamp manual pinning coordinates to Laguna Province bounds
                            const clampedLat = Math.max(13.9, Math.min(14.45, lat));
                            const clampedLng = Math.max(120.9, Math.min(121.75, lng));
                            setFormState((prev) => ({ ...prev, lat: clampedLat, lng: clampedLng }));
                          }}
                          draggable={!isMapLocked}
                        />
                      </MapContainer>
                    </div>
                  </div>
                </div>
              ) : (
                /* Non-parish: 3-column layout with map (Seminaries / Schools) */
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-8 flex-1 overflow-y-auto pr-2 scrollbar-thin items-stretch">
                  {/* Left Column: Main Fields */}
                  <div className="space-y-5">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">
                        Name <span className="text-rose-500 font-bold ml-0.5">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formState.name}
                        onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                        placeholder={`e.g. ${activeSubTab === 'seminaries' ? 'Holy Cross Seminary' : 'San Pablo School'}`}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all placeholder:text-gray-400"
                      />
                    </div>

                    {activeSubTab === 'schools' && (
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">
                          Cluster <span className="text-rose-500 font-bold ml-0.5">*</span>
                        </label>
                        <div className="relative">
                          <select
                            required
                            value={formState.cluster}
                            onChange={(e) => setFormState((prev) => ({ ...prev, cluster: Number(e.target.value) as 1 | 2 | 3 }))}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all appearance-none"
                          >
                            <option value="" disabled hidden>
                              Select Cluster...
                            </option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                          </select>
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                            <ArrowRight className="w-4 h-4 text-gray-400 rotate-90" />
                          </div>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">
                        Address <span className="text-rose-500 font-bold ml-0.5">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formState.address}
                        onChange={(e) => setFormState({ ...formState, address: e.target.value })}
                        placeholder="Full address"
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all placeholder:text-gray-400"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">
                        Subsidy Type <span className="text-rose-500 font-bold ml-0.5">*</span>
                      </label>
                      <div className="relative">
                        <select
                          required
                          value={formState.subsidyType}
                          onChange={(e) => setFormState({ ...formState, subsidyType: e.target.value as 'subsidized' | 'independent' })}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all appearance-none"
                        >
                          <option value="subsidized">Subsidized</option>
                          <option value="independent">Independent</option>
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                          <ArrowRight className="w-4 h-4 text-gray-400 rotate-90" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Middle Column: Divider Line */}
                  <div className="hidden md:block w-px bg-gray-200 self-stretch my-2"></div>

                  {/* Right Column: Coordinates & Map */}
                  <div className="space-y-5 flex flex-col justify-between">
                    <div className="space-y-4">
                      <div className="flex gap-4">
                        <div className="flex-1">
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">
                            Latitude <span className="text-rose-500 font-bold ml-0.5">*</span>
                          </label>
                          <input
                            type="number"
                            step="any"
                            required
                            disabled={isMapLocked}
                            value={formState.lat !== undefined ? formState.lat : ''}
                            onChange={(e) =>
                              setFormState({
                                ...formState,
                                lat: e.target.value === '' ? undefined : Number(e.target.value),
                              })
                            }
                            placeholder="e.g. 14.1686"
                            className={`w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all placeholder:text-gray-400 text-xs ${
                              isMapLocked ? 'opacity-60 cursor-not-allowed bg-gray-100/50' : ''
                            }`}
                          />
                        </div>
                        <div className="flex-1">
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">
                            Longitude <span className="text-rose-500 font-bold ml-0.5">*</span>
                          </label>
                          <input
                            type="number"
                            step="any"
                            required
                            disabled={isMapLocked}
                            value={formState.lng !== undefined ? formState.lng : ''}
                            onChange={(e) =>
                              setFormState({
                                ...formState,
                                lng: e.target.value === '' ? undefined : Number(e.target.value),
                              })
                            }
                            placeholder="e.g. 121.3253"
                            className={`w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all placeholder:text-gray-400 text-xs ${
                              isMapLocked ? 'opacity-60 cursor-not-allowed bg-gray-100/50' : ''
                            }`}
                          />
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between mt-1 px-1">
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                              isMapLocked ? 'text-gray-400' : 'text-amber-600 animate-pulse'
                            }`}
                          >
                            {isMapLocked ? '🔒 Coordinates Locked' : '🔓 Coordinates Editable'}
                          </span>
                          {isMapLocked && (
                            <button
                              type="button"
                              onClick={() => setIsMapLocked(false)}
                              className="text-[10px] font-bold text-[#D4AF37] hover:underline hover:text-[#B5952F] transition-all"
                            >
                              Unlock manual pinning
                            </button>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setIsMapLocked(false);
                              setIsLargeMapOpen(true);
                            }}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-all border border-gray-200"
                          >
                            <Maximize2 className="w-3.5 h-3.5 text-gray-500" />
                            <span>Fullscreen Map</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="w-full h-[220px] rounded-xl overflow-hidden border border-gray-200 relative z-20 shrink-0">
                      <MapContainer
                        center={[
                          formState.lat !== undefined ? formState.lat : 14.1686,
                          formState.lng !== undefined ? formState.lng : 121.3253,
                        ]}
                        zoom={13}
                        style={{ height: '100%', width: '100%' }}
                        zoomControl={true}
                        maxBounds={[
                          [13.9, 120.9],
                          [14.45, 121.75],
                        ]}
                      >
                        <UpdateMapCenter
                          center={[
                            formState.lat !== undefined ? formState.lat : 14.1686,
                            formState.lng !== undefined ? formState.lng : 121.3253,
                          ]}
                        />
                        <TileLayer
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        />
                        <DraggableMarker
                          position={[
                            formState.lat !== undefined ? formState.lat : 14.1686,
                            formState.lng !== undefined ? formState.lng : 121.3253,
                          ]}
                          onDragEnd={(lat, lng) => {
                            const clampedLat = Math.max(13.9, Math.min(14.45, lat));
                            const clampedLng = Math.max(120.9, Math.min(121.75, lng));
                            setFormState((prev) => ({ ...prev, lat: clampedLat, lng: clampedLng }));
                          }}
                          draggable={!isMapLocked}
                        />
                      </MapContainer>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-gray-100 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-6 py-3 border border-gray-200 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 px-6 py-3 bg-[#D4AF37] text-white rounded-xl font-bold hover:bg-[#B5952F] transition-colors shadow-lg shadow-[#D4AF37]/20 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving
                    ? 'Processing…'
                    : editingEntity
                      ? 'Update'
                      : activeSubTab === 'parishes'
                        ? renumberingPreview
                          ? 'Confirm and Create Parish'
                          : 'Review Renumbering'
                        : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fullscreen Precision Map Modal */}
      <EntityLocationMapModal
        isOpen={isLargeMapOpen}
        onClose={() => setIsLargeMapOpen(false)}
        lat={formState.lat}
        lng={formState.lng}
        onDragEnd={(lat, lng) => {
          // Clamp manual pinning coordinates to Laguna Province bounds
          const clampedLat = Math.max(13.9, Math.min(14.45, lat));
          const clampedLng = Math.max(120.9, Math.min(121.75, lng));
          setFormState((prev) => ({ ...prev, lat: clampedLat, lng: clampedLng }));
        }}
      />

      {historyOpen && (
        <div className="fixed inset-0 z-[190] flex items-center justify-center bg-black/55 p-6 backdrop-blur-sm">
          <div className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-slate-950 px-6 py-5 text-white">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-400">Parish Management</p>
                <h3 className="mt-1 font-serif text-2xl font-bold">Renumbering History</h3>
              </div>
              <button type="button" onClick={() => setHistoryOpen(false)} className="rounded-xl p-2 text-white/60 hover:bg-white/10 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-6">
              {historyLoading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm font-bold text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin" /> Loading history…
                </div>
              ) : renumberingHistory.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm font-semibold text-slate-400">
                  No parish renumbering operations have been recorded yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {renumberingHistory.map((entry) => (
                    <div key={entry.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-mono text-base font-black text-slate-950">
                            {entry.operation_type === 'bulk_reorder'
                              ? `Bulk reorder · ${String(entry.requested_source_code || '').replace('BULK-D', 'District ')}`
                              : `Inserted at ${entry.requested_source_code}`}
                          </p>
                        </div>
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-700">
                          {entry.status}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] font-semibold text-slate-500">
                        <span>{entry.affected_parish_count} code(s) updated</span>
                        <span>{new Date(entry.executed_at).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {bulkReorderOpen && (
        <div className="fixed inset-0 z-[195] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm md:p-6">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-slate-950 px-6 py-5 text-white">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gold-400">Parish Management</p>
                <h3 className="mt-1 font-serif text-2xl font-bold">Bulk Reorder Parishes</h3>
                <p className="mt-1 text-xs font-medium text-white/50">Drag parishes into their official order. Codes are calculated automatically.</p>
              </div>
              <button type="button" onClick={() => setBulkReorderOpen(false)} className="rounded-xl p-2 text-white/60 hover:bg-white/10 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="flex min-h-0 flex-col border-r border-slate-100 p-5">
                <label className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">District to reorder</label>
                <select
                  value={bulkDistrict}
                  onChange={(event) => changeBulkDistrict(event.target.value)}
                  className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-gold-500"
                >
                  {DISTRICTS.map((district) => <option key={district}>{district}</option>)}
                </select>

                <div className="mt-4 flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-600">Official order</p>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black text-slate-500">{bulkOrder.length} parishes</span>
                </div>

                <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                  {bulkOrder.map((parish, index) => (
                    <div
                      key={parish.id}
                      draggable
                      onDragStart={() => setDraggedParishId(parish.id)}
                      onDragEnd={() => setDraggedParishId(null)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => {
                        if (draggedParishId) moveBulkParish(draggedParishId, parish.id);
                        setDraggedParishId(null);
                      }}
                      className={`flex cursor-grab items-center gap-3 rounded-2xl border px-3 py-3 transition-all active:cursor-grabbing ${
                        draggedParishId === parish.id ? 'border-gold-400 bg-gold-50 opacity-60' : 'border-slate-200 bg-white hover:border-gold-300 hover:shadow-sm'
                      }`}
                    >
                      <GripVertical className="h-5 w-5 shrink-0 text-slate-300" />
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-xs font-black text-white">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-900">{parish.name}</p>
                        <p className="text-[10px] font-semibold text-slate-400">{parish.vicariate}</p>
                      </div>
                      <span className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-xs font-black text-slate-700">{getInstitutionCode(parish)}</span>
                      <div className="flex shrink-0 flex-col">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => index > 0 && moveBulkParish(parish.id, bulkOrder[index - 1].id)}
                          className="rounded px-2 py-0.5 text-[10px] font-black text-slate-400 hover:bg-slate-100 disabled:opacity-20"
                          aria-label={`Move ${parish.name} up`}
                        >
                          UP
                        </button>
                        <button
                          type="button"
                          disabled={index === bulkOrder.length - 1}
                          onClick={() => index < bulkOrder.length - 1 && moveBulkParish(parish.id, bulkOrder[index + 1].id)}
                          className="rounded px-2 py-0.5 text-[10px] font-black text-slate-400 hover:bg-slate-100 disabled:opacity-20"
                          aria-label={`Move ${parish.name} down`}
                        >
                          DOWN
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="overflow-y-auto bg-slate-50 p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Reorder details</p>
                {bulkPreview ? (
                  <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <div className="flex gap-2">
                      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
                      <div>
                        <p className="text-sm font-black text-amber-950">{bulkPreview.affectedParishCount} code(s) will change</p>
                        <p className="mt-1 text-[11px] font-medium leading-relaxed text-amber-800">Review the complete mapping before confirming.</p>
                      </div>
                    </div>
                    <div className="mt-3 max-h-48 space-y-1.5 overflow-y-auto rounded-xl bg-white/80 p-3">
                      {(bulkPreview.changes || []).filter((change: any) => change.changed).map((change: any) => (
                        <div key={change.institutionId} className="text-[11px]">
                          <p className="truncate font-bold text-slate-700">{change.parishName}</p>
                          <p className="font-mono font-black text-slate-950">{change.oldSourceCode} → {change.newSourceCode}</p>
                        </div>
                      ))}
                    </div>
                    <label className="mt-3 block text-[10px] font-black uppercase tracking-wider text-amber-900">Type REORDER to confirm</label>
                    <input
                      value={bulkConfirmation}
                      onChange={(event) => {
                        setBulkConfirmation(event.target.value.toUpperCase());
                        setBulkError('');
                      }}
                      className="mt-1.5 w-full rounded-xl border border-amber-300 bg-white px-3 py-2 font-mono text-sm font-black outline-none focus:border-amber-500"
                    />
                  </div>
                ) : (
                  <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs font-medium leading-relaxed text-blue-800">
                    Move the parishes into the desired order, then select <strong>Review Changes</strong>. Nothing is changed during preview.
                  </div>
                )}

                {bulkError && <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">{bulkError}</div>}
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-white px-6 py-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setBulkReorderOpen(false)} className="rounded-xl border border-slate-200 px-5 py-2.5 text-xs font-black text-slate-500 hover:bg-slate-50">Cancel</button>
              <button
                type="button"
                disabled={bulkSaving || bulkOrder.length === 0}
                onClick={bulkPreview ? executeBulkReorder : previewBulkReorder}
                className="rounded-xl bg-gold-500 px-5 py-2.5 text-xs font-black text-slate-950 shadow-lg shadow-gold-500/20 hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {bulkSaving ? 'Processing…' : bulkPreview ? 'Confirm and Apply Reorder' : 'Review Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="relative overflow-hidden rounded-[28px] bg-slate-950 px-6 py-7 text-white shadow-[0_24px_60px_rgba(15,23,42,0.18)] md:px-8">
        <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full border border-gold-500/15" />
        <div className="absolute -right-4 -top-10 h-40 w-40 rounded-full bg-gold-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-gold-500/25 bg-gold-500/10 text-gold-400"><Building2 className="h-5 w-5" /></span>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold-400">Institution Registry</p>
            </div>
            <h3 className="font-serif text-3xl font-bold tracking-tight md:text-4xl">Entity Management</h3>
            <p className="mt-3 max-w-xl text-sm font-medium leading-relaxed text-white/50">Maintain the diocesan directory, classifications, source codes, and institutional contact records from one workspace.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-[420px]">
            {[
              { label: 'Parishes', value: activeCounts.parishes, icon: ENTITY_TYPE_ICON.parish },
              { label: 'Seminaries', value: activeCounts.seminaries, icon: GraduationCap },
              { label: 'Schools', value: activeCounts.schools, icon: School },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3">
                <Icon className="h-4 w-4 text-gold-400" />
                <p className="mt-2 font-serif text-2xl font-bold leading-none">{value}</p>
                <p className="mt-1 text-[9px] font-black uppercase tracking-[0.16em] text-white/35">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-3 shadow-[0_16px_45px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-100 p-1">
            <button
              onClick={() => setActiveSubTab('parishes')}
              className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black transition-all ${
                activeSubTab === 'parishes' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              <ENTITY_TYPE_ICON.parish className="w-3.5 h-3.5" />
              Parishes
            </button>
            <button
              onClick={() => setActiveSubTab('seminaries')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeSubTab === 'seminaries'
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              Seminaries
            </button>
            <button
              onClick={() => setActiveSubTab('schools')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeSubTab === 'schools' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              <School className="w-3.5 h-3.5" />
              Schools
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {activeSubTab === 'parishes' && (
              <button
                type="button"
                onClick={openBulkReorder}
                className="flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.12em] text-slate-600 transition-all hover:bg-slate-50"
              >
                <ArrowUpDown className="h-4 w-4" /> Bulk Reorder
              </button>
            )}
            {activeSubTab === 'parishes' && (
              <button
                type="button"
                onClick={openRenumberingHistory}
                className="flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.12em] text-slate-600 transition-all hover:bg-slate-50"
              >
                <History className="h-4 w-4" /> History
              </button>
            )}
            <button
              onClick={() => handleOpenModal()}
              className="flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-gold-500 px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-slate-950 shadow-lg shadow-gold-500/20 transition-all hover:bg-gold-400"
            >
              <Plus className="w-4 h-4" />
              Add {activeSubTab === 'parishes' ? 'Parish' : activeSubTab === 'seminaries' ? 'Seminary' : 'School'}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(260px,1fr)_repeat(3,minmax(160px,190px))]">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder={`Search ${activeSubTab}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={roundedField(Boolean(searchQuery.trim()), 'w-full pl-12 pr-4 py-4 rounded-2xl text-sm font-medium')}
          />
        </div>

        {/* Only parishes have vicariates/classes/districts. Seminaries have none
            of these; schools are organized by cluster only. */}
        {activeSubTab === 'parishes' && (
          <select
            value={vicariateFilter}
            onChange={(e) => setVicariateFilter(e.target.value)}
            className={selectField(vicariateFilter !== 'all', 'rounded-2xl px-4 py-4 text-sm font-bold')}
            aria-label="Filter by vicariate"
          >
            <option value="all">All vicariates</option>
            {VICARIATES.map((vicariate) => (
              <option key={vicariate} value={vicariate}>
                {stripVicariatePrefix(vicariate)}
              </option>
            ))}
          </select>
        )}

        {activeSubTab === 'schools' && (
          <select
            value={clusterFilter}
            onChange={(e) => setClusterFilter(e.target.value)}
            className={selectField(clusterFilter !== 'all', 'rounded-2xl px-4 py-4 text-sm font-bold')}
            aria-label="Filter by school cluster"
          >
            <option value="all">All clusters</option>
            {[1, 2, 3].map((cluster) => (
              <option key={cluster} value={String(cluster)}>
                Cluster {cluster}
              </option>
            ))}
          </select>
        )}

        {activeSubTab === 'parishes' && (
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className={selectField(classFilter !== 'all', 'rounded-2xl px-4 py-4 text-sm font-bold')}
            aria-label="Filter by class"
          >
            <option value="all">All classes</option>
            {CLASSES.map((entityClass) => (
              <option key={entityClass} value={entityClass}>
                {entityClass}
              </option>
            ))}
          </select>
        )}

        {activeSubTab === 'parishes' && (
          <select
            value={districtFilter}
            onChange={(e) => setDistrictFilter(e.target.value)}
            className={selectField(districtFilter !== 'all', 'rounded-2xl px-4 py-4 text-sm font-bold')}
            aria-label="Filter by district"
          >
            <option value="all">All districts</option>
            {DISTRICTS.map((district) => (
              <option key={district} value={district}>
                {district}
              </option>
            ))}
          </select>
        )}
      </div>
      </section>

      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_55px_rgba(15,23,42,0.07)]">
        <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-gold-400"><CurrentTypeIcon className="h-5 w-5" /></span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gold-600">Current directory</p>
              <h4 className="font-serif text-xl font-bold text-slate-950">{currentTypeLabel}</h4>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{visibleEntities.length} shown</span>
            {(searchQuery || vicariateFilter !== 'all' || classFilter !== 'all' || districtFilter !== 'all' || clusterFilter !== 'all') && (
              <button onClick={() => { setSearchQuery(''); setVicariateFilter('all'); setClassFilter('all'); setDistrictFilter('all'); setClusterFilter('all'); }} className="rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-rose-600 hover:bg-rose-50">Clear filters</button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            {/* Column set per type: parishes have vicariate/class/district,
                schools have cluster/level (no class), seminaries have neither. */}
            <tr className="border-b border-gray-100">
              <th className="pb-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-4">
                <button
                  type="button"
                  onClick={() => toggleSort('name')}
                  className="inline-flex items-center gap-1.5 hover:text-gray-700 transition-colors"
                >
                  Name & Address
                  <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              {activeSubTab === 'parishes' && (
                <th className="pb-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  <button
                    type="button"
                    onClick={() => toggleSort('iafrSourceCode')}
                    className="inline-flex items-center gap-1.5 hover:text-gray-700 transition-colors"
                  >
                    IAFR Source Code
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
              )}
              {activeSubTab === 'parishes' && (
                <th className="pb-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Vicariate</th>
              )}
              {activeSubTab === 'schools' && (
                <th className="pb-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Cluster</th>
              )}
              {activeSubTab === 'parishes' && (
                <th className="pb-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Class</th>
              )}
              {activeSubTab === 'parishes' && (
                <th className="pb-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">District</th>
              )}
              {activeSubTab === 'schools' && (
                <th className="pb-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Level</th>
              )}
              <th className="pb-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right pr-4">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {visibleEntities.map((item: any, index: number) => (
              <tr
                key={item.id || `item-${index}`}
                onClick={() => setViewEntity({ ...item, __kind: activeSubTab })}
                className="group cursor-pointer transition-colors hover:bg-gold-50/30"
              >
                <td className="py-5 pl-4">
                  <div className="flex flex-col">
                    <span className="text-gray-900 font-bold text-sm flex items-center gap-1.5">
                      {item.name}
                      {activeSubTab === 'parishes' && item.lat && item.lng && (
                        <span
                          className="inline-flex items-center text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-bold border border-emerald-100"
                          title={`Geocoded: ${item.lat}, ${item.lng}`}
                        >
                          🧭 GEO
                        </span>
                      )}
                    </span>
                    <span className="text-gray-400 text-[11px] mt-0.5">{item.address}</span>
                  </div>
                </td>
                {activeSubTab === 'parishes' && (
                  <td className="py-5">
                    <span className="inline-flex min-w-[74px] justify-center rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-1 font-mono text-xs font-black text-emerald-700">
                      {getInstitutionCode(item) || '-'}
                    </span>
                  </td>
                )}
                {activeSubTab === 'parishes' && (
                  <td className="py-5">
                    <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-[10px] font-bold uppercase tracking-wider">
                      {stripVicariatePrefix(item.vicariate)}
                    </span>
                  </td>
                )}
                {activeSubTab === 'schools' && (
                  <td className="py-5">
                    <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-[10px] font-bold uppercase tracking-wider">
                      {`Cluster ${item.cluster}`}
                    </span>
                  </td>
                )}
                {activeSubTab === 'parishes' && (
                  <td className="py-5">
                    <span className="px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-[10px] font-bold uppercase tracking-wider">
                      {item.class || item.entityClass || '-'}
                    </span>
                  </td>
                )}
                {activeSubTab === 'parishes' && (
                  <td className="py-5">
                    <span className="text-xs font-bold text-gray-500">
                      {item.district || VICARIATE_TO_DISTRICT[item.vicariate] || '-'}
                    </span>
                  </td>
                )}
                {activeSubTab === 'schools' && (
                  <td className="py-5">
                    <span className="text-xs font-bold text-gray-500">{item.level || '-'}</span>
                  </td>
                )}
                <td className="py-5 text-right pr-4">
                  <div className="flex items-center justify-end gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenModal(item);
                      }}
                      className="text-[#D4AF37] hover:bg-[#FDF6E3] p-2 rounded-xl transition-all"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEntityToDelete(item);
                        setIsDeleteModalOpen(true);
                      }}
                      className="text-amber-500 hover:bg-amber-50 p-2 rounded-xl transition-all"
                      title="Archive"
                    >
                      <Archive className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {visibleEntities.length === 0 && (
              <tr key="no-entities">
                <td colSpan={activeSubTab === 'parishes' ? 6 : activeSubTab === 'schools' ? 4 : 2} className="py-20 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center">
                      <Search className="w-8 h-8 text-gray-300" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-gray-900 font-bold">No entities found</p>
                      <p className="text-sm text-gray-500">Try adjusting your search or add a new one.</p>
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </section>

      {/* ── Read-only entity detail modal (Edit / Archive in the corner) ── */}
      {viewEntity &&
        (() => {
          const kind: 'parishes' | 'seminaries' | 'schools' = viewEntity.__kind || activeSubTab;
          const typeLabel = kind === 'parishes' ? 'Parish' : kind === 'seminaries' ? 'Seminary' : 'School';
          const KindIcon =
            kind === 'parishes'
              ? ENTITY_TYPE_ICON.parish
              : kind === 'seminaries'
                ? ENTITY_TYPE_ICON.seminary
                : ENTITY_TYPE_ICON.school;
          const leader =
            kind === 'parishes' ? viewEntity.pastor : kind === 'seminaries' ? viewEntity.rector : viewEntity.principal;
          const leaderLabel = kind === 'parishes' ? 'Pastor' : kind === 'seminaries' ? 'Rector' : 'Principal';
          const isInactive = viewEntity.status === 'inactive';

          const Field = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: any }) => (
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                <Icon className="h-3.5 w-3.5" /> {label}
              </p>
              <p className="mt-1.5 text-sm font-bold text-gray-900 break-words">
                {value === undefined || value === null || value === '' ? '—' : value}
              </p>
            </div>
          );

          return (
            <div
              className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
              onClick={() => setViewEntity(null)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
              >
                {/* Dark header */}
                <div className="flex items-start justify-between gap-4 bg-slate-900 p-6 text-white">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-gold-500/25 bg-white/5">
                      <KindIcon className="h-6 w-6 text-gold-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="rounded-md border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white/70">
                          {typeLabel}
                        </span>
                        <span
                          className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                            isInactive ? 'bg-rose-500/20 text-rose-200' : 'bg-emerald-500/20 text-emerald-200'
                          }`}
                        >
                          {isInactive ? 'Archived' : 'Active'}
                        </span>
                      </div>
                      <h3 className="mt-1.5 truncate font-serif text-2xl font-bold">{viewEntity.name}</h3>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => {
                        const entity = viewEntity;
                        setViewEntity(null);
                        handleOpenModal(entity);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-white hover:text-slate-900"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                    {!isInactive && (
                      <button
                        onClick={() => {
                          setEntityToDelete(viewEntity);
                          setIsDeleteModalOpen(true);
                          setViewEntity(null);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-white/70 transition-colors hover:bg-rose-500 hover:text-white"
                      >
                        <Archive className="h-3.5 w-3.5" /> Archive
                      </button>
                    )}
                    <button
                      onClick={() => setViewEntity(null)}
                      className="rounded-xl p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                {/* Body */}
                <div className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto p-6 sm:grid-cols-2">
                  <Field icon={MapPin} label="Address" value={viewEntity.address} />
                  {kind === 'parishes' && (
                    <Field icon={Database} label="IAFR Source Code" value={getInstitutionCode(viewEntity)} />
                  )}
                  {/* Only parishes have vicariate/district/class; schools have a
                      cluster; seminaries have none of these classifications. */}
                  {kind === 'parishes' && <Field icon={KindIcon} label="Vicariate" value={viewEntity.vicariate} />}
                  {kind === 'schools' && (
                    <Field icon={KindIcon} label="Cluster" value={`Cluster ${viewEntity.cluster}`} />
                  )}
                  {kind === 'parishes' && viewEntity.district && (
                    <Field icon={Layers} label="District" value={viewEntity.district} />
                  )}
                  {kind === 'parishes' && <Field icon={Layers} label="Class" value={viewEntity.class} />}
                  <Field icon={Users} label={leaderLabel} value={leader} />
                  <Field icon={Phone} label="Contact Number" value={viewEntity.contactNumber} />
                  <Field icon={Mail} label="Email" value={viewEntity.email} />
                  {kind === 'parishes' && (
                    <Field icon={Database} label="Subsidy Type" value={viewEntity.subsidyType} />
                  )}
                  {(kind === 'seminaries' || kind === 'schools') && (
                    <>
                      <Field icon={Users} label="Enrollment" value={viewEntity.enrollment} />
                      <Field icon={Users} label="Capacity" value={viewEntity.capacity} />
                      <Field icon={Users} label="Staff" value={viewEntity.staff} />
                    </>
                  )}
                  {kind === 'schools' && <Field icon={Layers} label="Level" value={viewEntity.level} />}
                  {viewEntity.lat && viewEntity.lng && (
                    <Field icon={MapPin} label="Coordinates" value={`${viewEntity.lat}, ${viewEntity.lng}`} />
                  )}
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
