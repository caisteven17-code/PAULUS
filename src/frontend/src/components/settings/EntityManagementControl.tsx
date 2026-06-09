'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
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
} from 'lucide-react';
import { Parish, Seminary, DiocesanSchool, EntityClass } from '../../types';
import { VICARIATES, CLASSES, ALL_PARISHES, INITIAL_PARISHES } from '../../constants';
import { dataService } from '../../services/dataService';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface EntityManagementControlProps {
  parishes: Parish[];
  seminaries: Seminary[];
  schools: DiocesanSchool[];
  onUpdateParishes: (parishes: Parish[]) => void;
  onUpdateSeminaries: (seminaries: Seminary[]) => void;
  onUpdateSchools: (schools: DiocesanSchool[]) => void;
  onNavigate?: (page: string) => void;
  accounts?: any[];
}

const stripVicariatePrefix = (name: string) => name.replace('Vicariate of ', '');

const DISTRICTS = ['District I', 'District II', 'District III', 'District IV'];

const VICARIATE_TO_DISTRICT: Record<string, string> = {
  'Holy Family': 'District I',
  'San Isidro Labrador': 'District I',
  'San Pedro Apostol': 'District I',
  'Sta. Rosa De Lima': 'District II',
  'St. Polycarp': 'District II',
  'St. John the Baptist': 'District II',
  'Immaculate Conception': 'District III',
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

interface DraggableMarkerProps {
  position: [number, number];
  onDragEnd: (lat: number, lng: number) => void;
  draggable?: boolean;
}

function DraggableMarker({ position, onDragEnd, draggable = true }: DraggableMarkerProps) {
  const markerRef = useRef<any>(null);

  // Custom gold pin matching the app's brand colors (#D4AF37 and #1A1A1A)
  const goldPinIcon = useMemo(() => {
    return L.divIcon({
      className: 'custom-gold-pin',
      html: `
        <div style="
          background-color: #D4AF37;
          width: 28px;
          height: 28px;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          border: 2px solid white;
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.15), 0 2px 4px -1px rgba(0,0,0,0.1);
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <div style="
            background-color: #1A1A1A;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            transform: rotate(45deg);
          "></div>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 28],
    });
  }, []);

  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker != null) {
          const latLng = marker.getLatLng();
          onDragEnd(latLng.lat, latLng.lng);
        }
      },
    }),
    [onDragEnd],
  );

  return (
    <Marker
      draggable={draggable}
      eventHandlers={eventHandlers}
      position={position}
      icon={goldPinIcon}
      ref={markerRef}
    />
  );
}

function UpdateMapCenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom() || 13);
  }, [center, map]);
  return null;
}

export function EntityManagementControl({
  parishes,
  seminaries,
  schools,
  onUpdateParishes,
  onUpdateSeminaries,
  onUpdateSchools,
  onNavigate,
  accounts = [],
}: EntityManagementControlProps) {
  const [activeSubTab, setActiveSubTab] = useState<'parishes' | 'seminaries' | 'schools'>('parishes');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<any | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [entityToDelete, setEntityToDelete] = useState<any | null>(null);
  const [showSuccess, setShowSuccess] = useState<{ show: boolean; message: string }>({ show: false, message: '' });

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
    if (entity) {
      setEditingEntity(entity);
      const rawAddress = entity.address || '';
      let extractedCity = rawAddress.replace(', Laguna', '').trim();
      if (extractedCity.toLowerCase() === 'laguna') {
        extractedCity = '';
      }
      setFormState({
        name: entity.name || '',
        vicariate: entity.vicariate || VICARIATES[0],
        cluster: entity.cluster || 1,
        class: entity.class || CLASSES[0],
        address: rawAddress,
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

    const baseData = {
      name: formState.name,
      vicariate: formState.vicariate,
      class: formState.class,
      address: formState.address,
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
        subsidy_type: formState.subsidyType,
        status: 'active',
      };
    } else if (activeSubTab === 'seminaries') {
      payload = {
        ...payload,
        ...baseData,
        class: formState.class,
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
      payload = {
        ...payload,
        name: formState.name,
        cluster: formState.cluster,
        class: formState.class,
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
        headers: { 'Content-Type': 'application/json' },
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
        status: savedEntity.status || 'active',
        district: savedEntity.district,
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
    const query = searchQuery.toLowerCase();
    if (activeSubTab === 'parishes') {
      return dedupeEntities(parishes)
        .filter((p) => p.status !== 'inactive')
        .filter((p) => p.name.toLowerCase().includes(query) || p.vicariate.toLowerCase().includes(query));
    } else if (activeSubTab === 'seminaries') {
      return dedupeEntities(seminaries)
        .filter((s) => s.status !== 'inactive')
        .filter((s) => s.name.toLowerCase().includes(query) || s.vicariate.toLowerCase().includes(query));
    } else {
      return dedupeEntities(schools)
        .filter((s) => s.status !== 'inactive')
        .filter((s) => s.name.toLowerCase().includes(query) || s.cluster.toString().includes(query));
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-[120] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100">
            {deleteState.isChecking ? (
              <div className="p-8 text-center space-y-6">
                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto border border-gray-100">
                  <Loader2 className="w-8 h-8 text-[#D4AF37] animate-spin" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-gray-900">Analyzing Dependencies</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Checking financial reports, historical collections, projects, and active personnel assignments for{' '}
                    <span className="font-bold text-gray-900">"{entityToDelete?.name}"</span>...
                  </p>
                </div>
              </div>
            ) : deleteState.hasAny ? (
              /* Soft Delete (Archive) Warning Flow */
              <div className="p-8 text-center space-y-6">
                <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto border border-amber-100">
                  <ShieldAlert className="w-8 h-8 text-amber-500 animate-pulse" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold text-gray-900">Safe Archive Required</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Historical dependency records were detected for{' '}
                    <span className="font-bold text-gray-900">"{entityToDelete?.name}"</span>. To protect multi-year
                    aggregates, audit history, and reporting integrity, this entry will be safely archived and hidden
                    from active views.
                  </p>
                </div>

                <div className="bg-amber-50/50 rounded-2xl p-4 border border-amber-100 text-left space-y-2 max-h-[160px] overflow-y-auto scrollbar-thin">
                  <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest block mb-1">
                    Detected Dependencies:
                  </span>
                  {deleteState.hasPastor && (
                    <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                      <span className="text-amber-500 text-xs">⛪</span>
                      <span>
                        Assigned Pastor:{' '}
                        <span className="text-gray-900 font-bold">
                          {entityToDelete.pastor || entityToDelete.rector || entityToDelete.principal}
                        </span>
                      </span>
                    </div>
                  )}
                  {deleteState.hasCollections && (
                    <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                      <span className="text-amber-500 text-xs">📊</span>
                      <span>Historical Financial Records & Collections</span>
                    </div>
                  )}
                  {deleteState.hasAccounts && (
                    <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                      <span className="text-amber-500 text-xs">👤</span>
                      <span>Assigned User Account / Profile</span>
                    </div>
                  )}
                  {deleteState.hasProjects && (
                    <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                      <span className="text-amber-500 text-xs">🏗️</span>
                      <span>Active or Completed Special Projects</span>
                    </div>
                  )}
                  {deleteState.isPredefined && (
                    <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                      <span className="text-amber-500 text-xs">🛡️</span>
                      <span>Predefined Diocesan Seed Institution</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setIsDeleteModalOpen(false)}
                    className="flex-1 px-6 py-3 border border-gray-200 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    className="flex-1 px-6 py-3 bg-[#D4AF37] hover:bg-[#B5952F] text-white rounded-xl font-bold transition-colors shadow-lg shadow-[#D4AF37]/20 text-sm"
                  >
                    Archive Entity
                  </button>
                </div>
              </div>
            ) : (
              /* Hard Delete clean Flow */
              <div className="p-8 text-center space-y-6">
                <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto border border-rose-100">
                  <Trash2 className="w-8 h-8 text-rose-500" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold text-gray-900">Delete Permanently</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    No active dependencies, projects, or historical financial records were detected for{' '}
                    <span className="font-bold text-gray-900">"{entityToDelete?.name}"</span>.
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                    Since this entry appears to be a clean record (e.g. created by accident due to a typo), it will be
                    **permanently erased** from the system. This cannot be undone.
                  </p>
                </div>

                <div className="bg-emerald-50/50 rounded-2xl p-4 border border-emerald-100/50 text-left">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-700">
                    <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <span>Eligible for clean hard deletion</span>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setIsDeleteModalOpen(false)}
                    className="flex-1 px-6 py-3 border border-gray-200 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    className="flex-1 px-6 py-3 bg-rose-500 text-white rounded-xl font-bold hover:bg-rose-600 transition-colors shadow-lg shadow-rose-500/20 text-sm"
                  >
                    Delete Permanently
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
                  className="flex-1 px-6 py-3 bg-[#D4AF37] text-white rounded-xl font-bold hover:bg-[#B5952F] transition-colors shadow-lg shadow-[#D4AF37]/20 text-sm"
                >
                  {editingEntity ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fullscreen Precision Map Modal */}
      {isLargeMapOpen && (
        <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-6 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 border border-gray-100">
            {/* Header */}
            <div className="bg-[#1A1A1A] p-6 text-white relative overflow-hidden shrink-0 flex items-center justify-between">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#D4AF37]/10 rounded-full -mr-16 -mt-16 blur-2xl"></div>
              <div>
                <h3 className="text-xl font-bold relative z-10">Fullscreen Precision Pinning</h3>
                <p className="text-white/50 text-xs mt-0.5 relative z-10">
                  Drag the gold pin to precisely locate the parish. Scroll to zoom.
                </p>
              </div>
              <div className="bg-[#D4AF37]/10 border border-[#D4AF37]/20 text-[#D4AF37] px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider">
                🔓 Editing Active
              </div>
            </div>

            {/* Map Area */}
            <div className="flex-1 w-full h-full relative z-10 bg-gray-50">
              <MapContainer
                center={[
                  formState.lat !== undefined ? formState.lat : 14.1686,
                  formState.lng !== undefined ? formState.lng : 121.3253,
                ]}
                zoom={14}
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
                  draggable={true}
                />
              </MapContainer>

              {/* Floating coordinates indicator in large map */}
              <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur shadow-xl border border-gray-100 rounded-2xl p-4 z-[1000] flex gap-4 text-xs font-bold text-gray-800">
                <div>
                  <span className="text-[10px] text-gray-400 block uppercase mb-0.5">Latitude</span>
                  <span>{formState.lat !== undefined ? formState.lat.toFixed(6) : 'N/A'}</span>
                </div>
                <div className="w-px bg-gray-200"></div>
                <div>
                  <span className="text-[10px] text-gray-400 block uppercase mb-0.5">Longitude</span>
                  <span>{formState.lng !== undefined ? formState.lng.toFixed(6) : 'N/A'}</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3 shrink-0 justify-end">
              <button
                type="button"
                onClick={() => setIsLargeMapOpen(false)}
                className="px-6 py-2.5 border border-gray-200 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-colors text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setIsLargeMapOpen(false)}
                className="px-6 py-2.5 bg-[#D4AF37] hover:bg-[#B5952F] text-white rounded-xl font-bold transition-colors shadow-lg shadow-[#D4AF37]/20 text-xs"
              >
                Apply Coordinates
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-10">
        <div className="space-y-1">
          <h3 className="text-2xl font-bold text-gray-900">Entity Management</h3>
          <p className="text-sm text-gray-500">Manage parishes, seminaries, and schools.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex p-1 bg-gray-100 rounded-xl">
            <button
              onClick={() => setActiveSubTab('parishes')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeSubTab === 'parishes' ? 'bg-white text-[#D4AF37] shadow-sm' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              Parishes
            </button>
            <button
              onClick={() => setActiveSubTab('seminaries')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeSubTab === 'seminaries'
                  ? 'bg-white text-[#D4AF37] shadow-sm'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              Seminaries
            </button>
            <button
              onClick={() => setActiveSubTab('schools')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeSubTab === 'schools' ? 'bg-white text-[#D4AF37] shadow-sm' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <School className="w-3.5 h-3.5" />
              Schools
            </button>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="bg-[#D4AF37] hover:bg-[#B5952F] text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-[#D4AF37]/20 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Add {activeSubTab === 'parishes' ? 'Parish' : activeSubTab === 'seminaries' ? 'Seminary' : 'School'}
          </button>
        </div>
      </div>

      <div className="relative mb-8">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder={`Search ${activeSubTab}...`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-gray-900 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all placeholder:text-gray-400"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="pb-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-4">
                Name & Address
              </th>
              <th className="pb-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                {activeSubTab === 'schools' ? 'Cluster' : 'Vicariate'}
              </th>
              <th className="pb-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right pr-4">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filteredData().map((item: any, index: number) => (
              <tr key={item.id || `item-${index}`} className="group hover:bg-gray-50/50 transition-colors">
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
                <td className="py-5">
                  <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-[10px] font-bold uppercase tracking-wider">
                    {activeSubTab === 'schools' ? `Cluster ${item.cluster}` : stripVicariatePrefix(item.vicariate)}
                  </span>
                </td>
                <td className="py-5 text-right pr-4">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleOpenModal(item)}
                      className="text-[#D4AF37] hover:bg-[#FDF6E3] p-2 rounded-xl transition-all"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setEntityToDelete(item);
                        setIsDeleteModalOpen(true);
                      }}
                      className="text-rose-500 hover:bg-rose-50 p-2 rounded-xl transition-all"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredData().length === 0 && (
              <tr key="no-entities">
                <td colSpan={3} className="py-20 text-center">
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
    </div>
  );
}
