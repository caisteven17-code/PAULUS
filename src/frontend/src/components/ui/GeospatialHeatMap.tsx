'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap, CircleMarker, Tooltip as LeafletTooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Layers, MapPin, TrendingUp, Info } from 'lucide-react';
import * as turf from '@turf/turf';
import parishesData from '../../data/parishes-geocoded.json';

// --- DATA MAPPINGS ---

const MUNICIPALITY_TO_VICARIATE: Record<string, string> = {
  // 1. Vicariate of San Pedro Apostol
  'San Pedro': 'Vicariate of San Pedro Apostol',
  'City of San Pedro': 'Vicariate of San Pedro Apostol',
  'San Pedro City': 'Vicariate of San Pedro Apostol',

  // 2. Vicariate of San Isidro Labrador
  Biñan: 'Vicariate of San Isidro Labrador',
  'City of Biñan': 'Vicariate of San Isidro Labrador',
  'Biñan City': 'Vicariate of San Isidro Labrador',

  // 3. Vicariate of Holy Family
  // Overlaps with San Pedro/Biñan, mapping to San Pedro for now

  // 4. Vicariate of Sta. Rosa De Lima
  'Santa Rosa': 'Vicariate of Sta. Rosa De Lima',
  'City of Santa Rosa': 'Vicariate of Sta. Rosa De Lima',
  'Santa Rosa City': 'Vicariate of Sta. Rosa De Lima',

  // 5. Vicariate of St. Polycarp
  Cabuyao: 'Vicariate of St. Polycarp',
  'City of Cabuyao': 'Vicariate of St. Polycarp',
  'Cabuyao City': 'Vicariate of St. Polycarp',

  // 6. Vicariate of St. John the Baptist
  Calamba: 'Vicariate of St. John the Baptist',
  'City of Calamba': 'Vicariate of St. John the Baptist',
  'Calamba City': 'Vicariate of St. John the Baptist',

  // 7. Vicariate of Immaculate Conception
  Bay: 'Vicariate of Immaculate Conception',
  'Los Baños': 'Vicariate of Immaculate Conception',
  'Santa Cruz': 'Vicariate of Immaculate Conception',

  // 8. Vicariate of St. Paul the First Hermit
  'San Pablo': 'Vicariate of St. Paul the First Hermit',
  'San Pablo City': 'Vicariate of St. Paul the First Hermit',
  'City of San Pablo': 'Vicariate of St. Paul the First Hermit',
  Alaminos: 'Vicariate of St. Paul the First Hermit',
  Rizal: 'Vicariate of St. Paul the First Hermit',
  Calauan: 'Vicariate of St. Paul the First Hermit',

  // 9. Vicariate of San Bartolome
  Nagcarlan: 'Vicariate of San Bartolome',
  Liliw: 'Vicariate of San Bartolome',
  Majayjay: 'Vicariate of San Bartolome',
  Magdalena: 'Vicariate of San Bartolome',
  Luisiana: 'Vicariate of San Bartolome',
  Cavinti: 'Vicariate of San Bartolome',

  // 10. Vicariate of San Antonio De Padua
  Pila: 'Vicariate of San Antonio De Padua',
  Victoria: 'Vicariate of San Antonio De Padua',

  // 11. Vicariate of Our Lady of Guadalupe
  Pagsanjan: 'Vicariate of Our Lady of Guadalupe',
  Lumban: 'Vicariate of Our Lady of Guadalupe',
  Kalayaan: 'Vicariate of Our Lady of Guadalupe',
  Paete: 'Vicariate of Our Lady of Guadalupe',

  // 12. Vicariate of St. James
  Pakil: 'Vicariate of St. James',
  Pangil: 'Vicariate of St. James',

  // 13. Vicariate of Sts. Peter and Paul
  Siniloan: 'Vicariate of Sts. Peter and Paul',
  Famy: 'Vicariate of Sts. Peter and Paul',
  Mabitac: 'Vicariate of Sts. Peter and Paul',
  'Santa Maria': 'Vicariate of Sts. Peter and Paul',
};

// --- COLOR SCALE ---
const COLOR_SCALE = [
  'rgb(212,237,218)', // Lightest
  'rgb(178,219,191)',
  'rgb(139,198,163)',
  'rgb(95,175,133)',
  'rgb(52,149,103)',
  'rgb(22,117,75)',
  'rgb(10,76,42)', // Darkest
];

// Helper to format currency
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
    notation: 'compact',
    compactDisplay: 'short',
  }).format(value);
};

// --- COMPONENT ---

// Component to handle map zooming from outside
function MapController({ bounds, center }: { bounds: any; center: any }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    } else if (center) {
      map.setView(center, 10);
    }
  }, [bounds, center, map]);
  return null;
}

export const GeospatialHeatMap = React.memo(function GeospatialHeatMapComponent({ data }: { data?: any[] }) {
  const [geoJsonData, setGeoJsonData] = useState<any>(null);
  const [vicariateGeoJsonData, setVicariateGeoJsonData] = useState<any>(null);
  const [parishGeoJsonData, setParishGeoJsonData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'vicariate' | 'parish'>('vicariate');
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);
  const [selectedBounds, setSelectedBounds] = useState<any>(null);
  const [selectedCenter, setSelectedCenter] = useState<any>(null);
  const geoJsonLayerRef = useRef<any>(null);

  // Calculate dynamic vicariate data based on provided data or parishesData
  const dynamicVicariateData = useMemo(() => {
    const totals: Record<string, { collections: number; parishes: number }> = {};
    const sourceData = data && data.length > 0 ? data : parishesData;

    sourceData.forEach((p) => {
      if (!p.vicariate) return;
      if (!totals[p.vicariate]) {
        totals[p.vicariate] = { collections: 0, parishes: 0 };
      }
      totals[p.vicariate].collections += p.collections || 0;
      totals[p.vicariate].parishes += 1;
    });
    return totals;
  }, [data]);

  // Fetch GeoJSON data
  useEffect(() => {
    const fetchGeoJson = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          'https://raw.githubusercontent.com/faeldon/philippines-json-maps/master/2019/geojson/municties/medres/municities-province-ph043400000.0.01.json',
        );
        if (!response.ok) throw new Error('Failed to load map data');
        const data = await response.json();

        // Filter out features with null geometry just in case
        if (data && data.features) {
          data.features = data.features.filter((f: any) => f.geometry !== null);
        }

        setGeoJsonData(data);

        // Generate a single province polygon for clipping
        let provincePolygon: any = null;
        try {
          // @ts-ignore - turf.union signature changed in v7
          provincePolygon = turf.union(turf.featureCollection(data.features));
        } catch (e) {
          console.error('Error generating province polygon:', e);
        }

        // Generate Vicariate polygons by unioning municipalities
        try {
          const vicariateGroups: Record<string, any[]> = {};
          data.features.forEach((muni: any) => {
            const muniName = muni.properties.ADM3_EN;
            const normalizedName =
              muniName === 'City of San Pablo'
                ? 'San Pablo'
                : muniName === 'City of Calamba'
                  ? 'Calamba'
                  : muniName === 'City of Biñan'
                    ? 'Biñan'
                    : muniName === 'City of Cabuyao'
                      ? 'Cabuyao'
                      : muniName === 'City of San Pedro'
                        ? 'San Pedro'
                        : muniName === 'City of Santa Rosa'
                          ? 'Santa Rosa'
                          : muniName === 'San Pablo City'
                            ? 'San Pablo'
                            : muniName === 'Calamba City'
                              ? 'Calamba'
                              : muniName === 'Biñan City'
                                ? 'Biñan'
                                : muniName === 'Cabuyao City'
                                  ? 'Cabuyao'
                                  : muniName === 'San Pedro City'
                                    ? 'San Pedro'
                                    : muniName === 'Santa Rosa City'
                                      ? 'Santa Rosa'
                                      : muniName;

            const vicariate = MUNICIPALITY_TO_VICARIATE[normalizedName] || MUNICIPALITY_TO_VICARIATE[muniName];
            if (vicariate) {
              if (!vicariateGroups[vicariate]) vicariateGroups[vicariate] = [];
              vicariateGroups[vicariate].push(muni);
            }
          });

          const vicariateFeatures = Object.entries(vicariateGroups)
            .map(([name, features]) => {
              if (features.length === 1) {
                const feat = JSON.parse(JSON.stringify(features[0]));
                feat.properties = { name, isVicariate: true };
                return feat;
              }
              // @ts-ignore - turf.union signature changed in v7
              const union = turf.union(turf.featureCollection(features));
              if (union) {
                union.properties = { name, isVicariate: true };
                return union;
              }
              return null;
            })
            .filter((f) => f !== null);

          setVicariateGeoJsonData(turf.featureCollection(vicariateFeatures));
        } catch (e) {
          console.error('Error generating vicariate polygons:', e);
        }

        // Generate Voronoi polygons for parishes
        try {
          const sourceData = data && data.length > 0 ? data : parishesData;
          // 1. Create points for parishes
          const fallbackParishes = sourceData.filter((p: any) => p.lat === 14.1686 && p.lng === 121.3253);
          const fallbackCount = fallbackParishes.length;
          let fallbackIndex = 0;

          const points = sourceData.map((p: any) => {
            // Add small offset for overlapping points (like the fallback coordinates)
            const isFallback = p.lat === 14.1686 && p.lng === 121.3253;
            let offsetLat = 0;
            let offsetLng = 0;

            if (isFallback) {
              const angle = (fallbackIndex / fallbackCount) * 2 * Math.PI;
              // Use a slightly larger radius (0.08 degrees ~ 8.8km) to give them more space
              offsetLat = Math.sin(angle) * 0.08;
              offsetLng = Math.cos(angle) * 0.08;
              fallbackIndex++;
            } else {
              // Add a tiny random offset to prevent exact overlapping of other points
              offsetLat = (Math.random() - 0.5) * 0.001;
              offsetLng = (Math.random() - 0.5) * 0.001;
            }

            return turf.point([p.lng + offsetLng, p.lat + offsetLat], {
              ...p,
              id: p.name,
              isParish: true,
            });
          });

          const pointsCollection = turf.featureCollection(points);

          // 2. Get bounding box of the province
          const bbox = turf.bbox(data);

          // 3. Generate Voronoi polygons
          const voronoiPolygons = turf.voronoi(pointsCollection as any, { bbox });

          // 4. Clip each Voronoi polygon to the province boundary
          const clippedFeatures: any[] = [];

          if (provincePolygon) {
            turf.featureEach(voronoiPolygons, (voronoiPoly, featureIndex) => {
              if (!voronoiPoly) return;

              try {
                // Intersect with the single province polygon
                const intersection = turf.intersect(turf.featureCollection([voronoiPoly, provincePolygon]));
                if (intersection) {
                  // Assign properties from the original point
                  intersection.properties = { ...points[featureIndex].properties };
                  clippedFeatures.push(intersection);
                }
              } catch (e) {
                // Fallback: if intersection fails, at least keep the polygon with properties
                const fallback = JSON.parse(JSON.stringify(voronoiPoly));
                fallback.properties = { ...points[featureIndex].properties };
                clippedFeatures.push(fallback);
              }
            });
          }

          if (clippedFeatures.length > 0) {
            setParishGeoJsonData(turf.featureCollection(clippedFeatures));
          }
        } catch (e) {
          console.error('Error generating parish polygons:', e);
        }
      } catch (err) {
        console.error('Error loading GeoJSON:', err);
        setError('Failed to load map boundaries.');
      } finally {
        setLoading(false);
      }
    };

    fetchGeoJson();
  }, [data]);

  // Calculate total diocese collections
  const totalDioceseCollections = useMemo(() => {
    const sourceData = data && data.length > 0 ? data : parishesData;
    const total = sourceData.reduce((sum, p) => sum + (p.collections || 0), 0);
    return total > 0 ? total : 1; // Guard against division by zero
  }, [data]);

  // Get color based on value and max value
  const getColor = (value: number, max: number) => {
    if (!value || !max) return '#f3f4f6'; // Gray for no data
    const index = Math.min(Math.floor((value / max) * COLOR_SCALE.length), COLOR_SCALE.length - 1);
    return COLOR_SCALE[index];
  };

  // Prepare data for the sidebar list
  const listData = useMemo(() => {
    const sourceData = data && data.length > 0 ? data : parishesData;

    if (viewMode === 'vicariate') {
      const maxVal = Math.max(...Object.values(dynamicVicariateData).map((v) => v.collections), 0);
      return Object.entries(dynamicVicariateData)
        .map(([name, data]) => ({
          id: name,
          name,
          value: data.collections,
          percentage: (data.collections / totalDioceseCollections) * 100,
          color: getColor(data.collections, maxVal),
          parishes: data.parishes,
        }))
        .sort((a, b) => b.value - a.value);
    } else {
      const maxVal = Math.max(...sourceData.map((p) => p.collections || 0), 0);
      return sourceData
        .map((p) => ({
          id: p.name,
          name: p.name,
          vicariate: p.vicariate,
          value: p.collections || 0,
          percentage: ((p.collections || 0) / totalDioceseCollections) * 100,
          color: getColor(p.collections || 0, maxVal),
          lat: p.lat,
          lng: p.lng,
        }))
        .sort((a, b) => b.value - a.value);
    }
  }, [viewMode, totalDioceseCollections, data, dynamicVicariateData]);

  // Map style function
  const style = (feature: any) => {
    let fillColor = '#f3f4f6';
    let fillOpacity = 0.7;
    let isHovered = false;

    if (feature.properties.isParish) {
      const parishName = feature.properties.name;
      const collections = feature.properties.collections;
      const sourceData = data && data.length > 0 ? data : parishesData;
      const maxVal = Math.max(...sourceData.map((p) => p.collections || 0), 0);

      fillColor = getColor(collections, maxVal);
      isHovered = hoveredRegion === parishName;
      fillOpacity = isHovered ? 0.9 : 0.7;
    } else if (feature.properties.isVicariate) {
      const vicariateName = feature.properties.name;
      isHovered = hoveredRegion === vicariateName;

      if (dynamicVicariateData[vicariateName]) {
        const maxVal = Math.max(...Object.values(dynamicVicariateData).map((v) => v.collections), 0);
        fillColor = getColor(dynamicVicariateData[vicariateName].collections, maxVal);
      }

      fillOpacity = isHovered ? 0.9 : 0.7;
    } else {
      const muniName = feature.properties.ADM3_EN;
      // Handle naming differences between GeoJSON and our mapping
      const normalizedName =
        muniName === 'City of San Pablo'
          ? 'San Pablo'
          : muniName === 'City of Calamba'
            ? 'Calamba'
            : muniName === 'City of Biñan'
              ? 'Biñan'
              : muniName === 'City of Cabuyao'
                ? 'Cabuyao'
                : muniName === 'City of San Pedro'
                  ? 'San Pedro'
                  : muniName === 'City of Santa Rosa'
                    ? 'Santa Rosa'
                    : muniName === 'San Pablo City'
                      ? 'San Pablo'
                      : muniName === 'Calamba City'
                        ? 'Calamba'
                        : muniName === 'Biñan City'
                          ? 'Biñan'
                          : muniName === 'Cabuyao City'
                            ? 'Cabuyao'
                            : muniName === 'San Pedro City'
                              ? 'San Pedro'
                              : muniName === 'Santa Rosa City'
                                ? 'Santa Rosa'
                                : muniName;

      const vicariate = MUNICIPALITY_TO_VICARIATE[normalizedName] || MUNICIPALITY_TO_VICARIATE[muniName];
      isHovered = hoveredRegion === (viewMode === 'vicariate' ? vicariate : normalizedName);

      if (viewMode === 'vicariate' && vicariate && dynamicVicariateData[vicariate]) {
        const maxVal = Math.max(...Object.values(dynamicVicariateData).map((v) => v.collections), 0);
        fillColor = getColor(dynamicVicariateData[vicariate].collections, maxVal);
      } else if (viewMode === 'parish') {
        fillColor = '#e5e7eb'; // Neutral gray for municipality boundaries
        fillOpacity = 0.2; // Make it very transparent in parish view
      }

      if (isHovered && (viewMode === 'vicariate' || feature.properties.isVicariate)) {
        fillOpacity = 0.9;
      }
    }

    return {
      fillColor,
      weight: isHovered ? 2.5 : feature.properties.isParish ? 1 : feature.properties.isVicariate ? 2 : 1.5,
      opacity: 1,
      color: 'white',
      fillOpacity,
    };
  };

  // Map interaction handlers
  const onEachFeature = (feature: any, layer: any) => {
    let popupContent = '';
    let name = '';

    if (feature.properties.isVicariate) {
      name = feature.properties.name;
      const value = dynamicVicariateData[name]?.collections || 0;
      const percentage = (value / totalDioceseCollections) * 100;
      const parishes = dynamicVicariateData[name]?.parishes || 0;

      popupContent = `
        <div style="font-family: inherit; min-width: 200px;">
          <h3 style="margin: 0 0 4px 0; font-size: 16px; font-weight: bold; color: #111827;">${name}</h3>
          <p style="margin: 0 0 12px 0; font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Vicariate</p>
          
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;">
            <span style="font-size: 12px; color: #4b5563;">Collections</span>
            <span style="font-size: 16px; font-weight: 900; color: #1a472a;">${formatCurrency(value)}</span>
          </div>
          
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;">
            <span style="font-size: 12px; color: #4b5563;">Diocese Share</span>
            <span style="font-size: 13px; font-weight: bold; color: #111827;">${percentage.toFixed(1)}%</span>
          </div>
          
          <div style="display: flex; justify-content: space-between; align-items: baseline;">
            <span style="font-size: 12px; color: #4b5563;">Parishes</span>
            <span style="font-size: 13px; font-weight: bold; color: #111827;">${parishes}</span>
          </div>
        </div>
      `;
    } else if (feature.properties.isParish) {
      name = feature.properties.name;
      const vicariate = feature.properties.vicariate;
      const collections = feature.properties.collections;
      const percentage = (collections / totalDioceseCollections) * 100;

      popupContent = `
        <div style="font-family: inherit; min-width: 200px;">
          <h3 style="margin: 0 0 4px 0; font-size: 16px; font-weight: bold; color: #111827;">${name}</h3>
          <p style="margin: 0 0 12px 0; font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">${(vicariate || '').replace('Vicariate of ', '')}</p>
          
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;">
            <span style="font-size: 12px; color: #4b5563;">Collections</span>
            <span style="font-size: 16px; font-weight: 900; color: #1a472a;">${formatCurrency(collections)}</span>
          </div>
          
          <div style="display: flex; justify-content: space-between; align-items: baseline;">
            <span style="font-size: 12px; color: #4b5563;">Diocese Share</span>
            <span style="font-size: 13px; font-weight: bold; color: #111827;">${percentage.toFixed(1)}%</span>
          </div>
        </div>
      `;
    } else {
      // Municipality
      const muniName = feature.properties.ADM3_EN;
      const normalizedName =
        muniName === 'City of San Pablo'
          ? 'San Pablo'
          : muniName === 'City of Calamba'
            ? 'Calamba'
            : muniName === 'City of Biñan'
              ? 'Biñan'
              : muniName === 'City of Cabuyao'
                ? 'Cabuyao'
                : muniName === 'City of San Pedro'
                  ? 'San Pedro'
                  : muniName === 'City of Santa Rosa'
                    ? 'Santa Rosa'
                    : muniName === 'San Pablo City'
                      ? 'San Pablo'
                      : muniName === 'Calamba City'
                        ? 'Calamba'
                        : muniName === 'Biñan City'
                          ? 'Biñan'
                          : muniName === 'Cabuyao City'
                            ? 'Cabuyao'
                            : muniName === 'San Pedro City'
                              ? 'San Pedro'
                              : muniName === 'Santa Rosa City'
                                ? 'Santa Rosa'
                                : muniName;

      name = normalizedName;
      const vicariate = MUNICIPALITY_TO_VICARIATE[normalizedName] || MUNICIPALITY_TO_VICARIATE[muniName] || 'Unknown';

      if (viewMode === 'parish') {
        // Don't bind popups to municipalities in parish view
        return;
      }

      const value = dynamicVicariateData[vicariate]?.collections || 0;
      const percentage = (value / totalDioceseCollections) * 100;
      const parishes = dynamicVicariateData[vicariate]?.parishes || 0;

      popupContent = `
        <div style="font-family: inherit; min-width: 200px;">
          <h3 style="margin: 0 0 4px 0; font-size: 16px; font-weight: bold; color: #111827;">${normalizedName}</h3>
          <p style="margin: 0 0 12px 0; font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">${(vicariate || '').replace('Vicariate of ', '')}</p>
          
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;">
            <span style="font-size: 12px; color: #4b5563;">Collections</span>
            <span style="font-size: 16px; font-weight: 900; color: #1a472a;">${formatCurrency(value)}</span>
          </div>
          
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;">
            <span style="font-size: 12px; color: #4b5563;">Diocese Share</span>
            <span style="font-size: 13px; font-weight: bold; color: #111827;">${percentage.toFixed(1)}%</span>
          </div>
          
          <div style="display: flex; justify-content: space-between; align-items: baseline;">
            <span style="font-size: 12px; color: #4b5563;">Parishes</span>
            <span style="font-size: 13px; font-weight: bold; color: #111827;">${parishes}</span>
          </div>
        </div>
      `;
    }

    layer.bindPopup(popupContent, {
      className: 'custom-popup',
      closeButton: false,
      minWidth: 220,
    });

    layer.on({
      mouseover: () => {
        setHoveredRegion(name);
        if (feature.properties.isVicariate || feature.properties.isParish) {
          layer.bringToFront();
        }
      },
      mouseout: () => {
        setHoveredRegion(null);
      },
      click: (e: any) => {
        const map = e.target._map;
        map.fitBounds(e.target.getBounds(), { padding: [50, 50], maxZoom: 13 });
      },
    });
  };

  // Handle sidebar click
  const handleSidebarClick = (id: string) => {
    if (viewMode === 'vicariate' && vicariateGeoJsonData) {
      vicariateGeoJsonData.features.forEach((feat: any) => {
        if (feat.properties.name === id) {
          const bbox = turf.bbox(feat);
          const bounds: any = [
            [bbox[1], bbox[0]],
            [bbox[3], bbox[2]],
          ];
          setSelectedBounds(bounds);
          setSelectedCenter(null);
        }
      });
      return;
    }

    if (viewMode === 'parish') {
      const sourceData = data && data.length > 0 ? data : parishesData;
      const parishIndex = sourceData.findIndex((p) => p.name === id);
      const parish = sourceData[parishIndex];

      if (parish) {
        const isFallback = parish.lat === 14.1686 && parish.lng === 121.3253;
        let offsetLat = 0;
        let offsetLng = 0;

        if (isFallback) {
          // Recalculate the offset angle for this specific fallback point
          const fallbackParishes = sourceData.filter((p: any) => p.lat === 14.1686 && p.lng === 121.3253);
          const fallbackCount = fallbackParishes.length;
          // Find the index of this parish among the fallback parishes
          const fallbackIndex = fallbackParishes.findIndex((p) => p.name === id);

          if (fallbackIndex !== -1) {
            const angle = (fallbackIndex / fallbackCount) * 2 * Math.PI;
            offsetLat = Math.sin(angle) * 0.08;
            offsetLng = Math.cos(angle) * 0.08;
          }
        }

        setSelectedCenter([parish.lat + offsetLat, parish.lng + offsetLng]);
        setSelectedBounds(null);
      }
      return;
    }

    if (!geoJsonLayerRef.current) return;

    let boundsToZoom: any = null;

    geoJsonLayerRef.current.eachLayer((layer: any) => {
      const muniName = layer.feature.properties.ADM3_EN;
      const normalizedName =
        muniName === 'City of San Pablo'
          ? 'San Pablo'
          : muniName === 'City of Calamba'
            ? 'Calamba'
            : muniName === 'City of Biñan'
              ? 'Biñan'
              : muniName === 'City of Cabuyao'
                ? 'Cabuyao'
                : muniName === 'City of San Pedro'
                  ? 'San Pedro'
                  : muniName === 'City of Santa Rosa'
                    ? 'Santa Rosa'
                    : muniName;

      const vicariate = MUNICIPALITY_TO_VICARIATE[normalizedName];

      if (viewMode === 'vicariate' && vicariate === id) {
        if (!boundsToZoom) {
          boundsToZoom = layer.getBounds();
        } else {
          boundsToZoom.extend(layer.getBounds());
        }
      }
    });

    if (boundsToZoom) {
      setSelectedBounds(boundsToZoom);
      setSelectedCenter(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-gray-50 rounded-xl border border-gray-200">
        <div className="flex flex-col items-center text-church-green">
          <div className="w-8 h-8 border-4 border-current border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="font-bold">Loading Map Data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-red-50 rounded-xl border border-red-200 text-red-600 p-6 text-center">
        <div>
          <Info className="w-8 h-8 mx-auto mb-2" />
          <p className="font-bold">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      {/* TOOLBAR */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white z-10">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-church-green" />
            Diocese of San Pablo — Collection Map
          </h2>
          <p className="text-sm text-gray-500 font-medium ml-7">Laguna Province</p>
        </div>

        <div className="flex bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setViewMode('vicariate')}
            className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${
              viewMode === 'vicariate' ? 'bg-white text-church-green shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Vicariate View
          </button>
          <button
            onClick={() => setViewMode('parish')}
            className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${
              viewMode === 'parish' ? 'bg-white text-church-green shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Parish View
          </button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex flex-1 min-h-0 relative">
        {/* MAP AREA */}
        <div className="flex-1 relative bg-[#dde8e4]">
          <MapContainer
            center={[14.1686, 121.3253]} // Center of Laguna
            zoom={10}
            style={{ height: '100%', width: '100%', background: 'transparent' }}
            zoomControl={false}
          >
            <MapController bounds={selectedBounds} center={selectedCenter} />

            {/* Base Map - No Labels */}
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            />

            {/* GeoJSON Layer for Vicariates */}
            {viewMode === 'vicariate' && vicariateGeoJsonData && (
              <GeoJSON
                key="vicariate-layer"
                ref={geoJsonLayerRef}
                data={vicariateGeoJsonData}
                style={style}
                onEachFeature={onEachFeature}
              />
            )}

            {/* GeoJSON Layer for Municipalities (Only in Parish View as background) */}
            {viewMode === 'parish' && geoJsonData && (
              <GeoJSON key="muni-layer" data={geoJsonData} style={style} onEachFeature={onEachFeature} />
            )}

            {/* GeoJSON Layer for Parishes (Voronoi Polygons) */}
            {viewMode === 'parish' && parishGeoJsonData && (
              <GeoJSON key="parish-layer" data={parishGeoJsonData} style={style} onEachFeature={onEachFeature} />
            )}

            {/* Labels Only Layer (on top of GeoJSON) */}
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png"
              pane="markerPane" // Ensures labels are above the GeoJSON polygons
            />
          </MapContainer>

          {/* Custom CSS for Leaflet Popups to match Tailwind styling */}
          <style
            dangerouslySetInnerHTML={{
              __html: `
            .custom-popup .leaflet-popup-content-wrapper {
              border-radius: 8px;
              box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
              padding: 4px;
            }
            .custom-popup .leaflet-popup-tip {
              background: white;
            }
            .leaflet-container {
              font-family: inherit;
            }
          `,
            }}
          />
        </div>

        {/* SIDEBAR */}
        <div className="w-[280px] bg-white border-l border-gray-100 flex flex-col z-10 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)]">
          <div className="p-4 border-b border-gray-50 bg-gray-50/50">
            <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" />
              Ranked by {viewMode === 'vicariate' ? 'Vicariate' : 'Parish'}
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-light">
            {listData.map((item, index) => (
              <div
                key={`${item.id}-${index}`}
                onClick={() => handleSidebarClick(item.id)}
                onMouseEnter={() => setHoveredRegion(item.id)}
                onMouseLeave={() => setHoveredRegion(null)}
                className={`p-2.5 rounded-lg cursor-pointer transition-all duration-200 border border-transparent ${
                  hoveredRegion === item.id ? 'bg-gray-50 border-gray-200 shadow-sm' : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex justify-between items-baseline mb-1.5">
                  <span className="text-sm font-bold text-gray-800 truncate pr-2" title={item.name}>
                    {index + 1}. {(item.name || '').replace('Vicariate of ', '').replace(/ Parish$/, '')}
                  </span>
                  <span className="text-xs font-black text-church-green shrink-0">{formatCurrency(item.value)}</span>
                </div>

                {'vicariate' in item && viewMode === 'parish' && item.vicariate && (
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-2 truncate">
                    {(item.vicariate as string).replace('Vicariate of ', '')}
                  </p>
                )}

                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(2, item.percentage)}%`,
                        backgroundColor: item.color,
                      }}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-gray-500 w-8 text-right">
                    {item.percentage.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* LEGEND */}
          <div className="p-4 border-t border-gray-100 bg-gray-50/50">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 text-center">
              Collection Volume
            </p>
            <div className="flex h-2 w-full rounded-full overflow-hidden mb-1.5">
              {COLOR_SCALE.map((color, i) => (
                <div key={i} className="flex-1 h-full" style={{ backgroundColor: color }} />
              ))}
            </div>
            <div className="flex justify-between text-[10px] font-bold text-gray-400">
              <span>Low</span>
              <span>High</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
