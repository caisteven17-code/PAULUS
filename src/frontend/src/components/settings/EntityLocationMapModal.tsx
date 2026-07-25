'use client';

import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const DEFAULT_LAT = 14.1686;
const DEFAULT_LNG = 121.3253;
const LAGUNA_MAP_BOUNDS: [[number, number], [number, number]] = [
  [13.9, 120.9],
  [14.45, 121.75],
];

interface DraggableMarkerProps {
  position: [number, number];
  onDragEnd: (lat: number, lng: number) => void;
  draggable?: boolean;
}

export function DraggableMarker({ position, onDragEnd, draggable = true }: DraggableMarkerProps) {
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

export function UpdateMapCenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom() || 13);
  }, [center, map]);
  return null;
}

interface EntityLocationMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  lat?: number;
  lng?: number;
  onDragEnd: (lat: number, lng: number) => void;
}

export function EntityLocationMapModal({ isOpen, onClose, lat, lng, onDragEnd }: EntityLocationMapModalProps) {
  if (!isOpen) return null;

  const center: [number, number] = [lat !== undefined ? lat : DEFAULT_LAT, lng !== undefined ? lng : DEFAULT_LNG];

  return (
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
            center={center}
            zoom={14}
            style={{ height: '100%', width: '100%' }}
            zoomControl={true}
            maxBounds={LAGUNA_MAP_BOUNDS}
          >
            <UpdateMapCenter center={center} />
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            <DraggableMarker position={center} onDragEnd={onDragEnd} draggable={true} />
          </MapContainer>

          {/* Floating coordinates indicator in large map */}
          <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur shadow-xl border border-gray-100 rounded-2xl p-4 z-[1000] flex gap-4 text-xs font-bold text-gray-800">
            <div>
              <span className="text-[10px] text-gray-400 block uppercase mb-0.5">Latitude</span>
              <span>{lat !== undefined ? lat.toFixed(6) : 'N/A'}</span>
            </div>
            <div className="w-px bg-gray-200"></div>
            <div>
              <span className="text-[10px] text-gray-400 block uppercase mb-0.5">Longitude</span>
              <span>{lng !== undefined ? lng.toFixed(6) : 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3 shrink-0 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 border border-gray-200 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-colors text-xs"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 bg-[#D4AF37] hover:bg-[#B5952F] text-white rounded-xl font-bold transition-colors shadow-lg shadow-[#D4AF37]/20 text-xs"
          >
            Apply Coordinates
          </button>
        </div>
      </div>
    </div>
  );
}
