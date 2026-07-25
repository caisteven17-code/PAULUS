declare module 'echarts-for-react' {
  import type { ComponentType } from 'react';

  const ReactECharts: ComponentType<any>;
  export default ReactECharts;
}

declare module 'react-leaflet' {
  import type { ComponentType } from 'react';

  export const MapContainer: ComponentType<any>;
  export const TileLayer: ComponentType<any>;
  export const Marker: ComponentType<any>;
  export const Popup: ComponentType<any>;
  export const Circle: ComponentType<any>;
  export const CircleMarker: ComponentType<any>;
  export const Polyline: ComponentType<any>;
  export const Polygon: ComponentType<any>;
  export const Rectangle: ComponentType<any>;
  export const GeoJSON: ComponentType<any>;
  export const LayersControl: ComponentType<any> & {
    BaseLayer: ComponentType<any>;
    Overlay: ComponentType<any>;
  };
  export const LayerGroup: ComponentType<any>;
  export const FeatureGroup: ComponentType<any>;
  export const Tooltip: ComponentType<any>;
  export const useMap: () => any;
  export const useMapEvents: (handlers: any) => any;
  export const useMapEvent: (type: string, handler: any) => any;
}
