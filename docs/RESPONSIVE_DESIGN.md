# Responsive Design Patterns Documentation

This document outlines the responsive design patterns and strategies implemented in the Priest and Bishop Dashboards.

## 1. Core Principles

- **Mobile-First Approach:** Layouts are designed for mobile by default and enhanced for larger screens using Tailwind's responsive prefixes (`md:`, `lg:`, `xl:`).
- **CSS-Driven Responsiveness:** Replaced JavaScript-based `window.innerWidth` checks with CSS media queries to improve performance and reduce layout shifts.
- **Fluid Grid Layouts:** Used Tailwind's `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` patterns to ensure content flows naturally across different viewports.

## 2. Responsive Chart Containers

Charts are wrapped in a generic `ChartContainer` component that manages their height and spacing responsively.

### Pattern: Responsive Minimum Heights
Instead of fixed heights (e.g., `h-[300px]`), we use responsive minimum heights:
- **Mobile (< 768px):** `min-h-80` (320px)
- **Tablet (768px - 1024px):** `md:min-h-96` (384px)
- **Desktop (> 1024px):** `lg:min-h-[400px]` (400px)

### Implementation (Tailwind CSS)
```tsx
<CardContent className="p-6 pt-0 min-h-80 md:min-h-96 lg:min-h-[400px]">
  <ResponsiveContainer width="100%" height="100%">
    {/* Chart Component */}
  </ResponsiveContainer>
</CardContent>
```

## 3. Dashboard Layout Strategy

### Priest Dashboard
- **Mobile:** Single-column layout for all cards.
- **Tablet/Desktop:** 2-column grid for key metrics and charts.
- **Breakpoints:**
  - `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` for top-level KPI cards.
  - `grid-cols-1 md:grid-cols-2` for main chart sections.

### Bishop Dashboard
- **Mobile:** Single-column layout.
- **Tablet:** 2-column grid for most charts.
- **Desktop:** 3-column grid for smaller metrics, 2-column for larger charts.
- **Breakpoints:**
  - `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` for parish metrics.
  - `grid-cols-1 md:grid-cols-2` for trend analysis charts.

## 4. Component-Specific Optimizations

### Financial Health Gauge
- **Size:** Standardized to a fixed `size={280}`.
- **Responsiveness:** Centered within its container using `flex justify-center`. The container itself scales responsively.

### Geospatial HeatMap
- **Performance:** Wrapped in `React.memo()` to prevent unnecessary re-renders when the parent dashboard updates.
- **Sizing:** Uses `h-[500px] md:h-[600px] lg:h-[700px]` to provide a larger view on desktop while remaining usable on mobile.

### Health Dimension Bars
- **Spacing:** Reduced vertical margin from `mb-5` to `mb-3` to improve visual density on smaller screens.

## 5. Testing Strategy

- **Unit Tests:** Verify that responsive classes are correctly applied to containers.
- **Visual Regression:** Capture snapshots at 375px, 768px, and 1440px widths.
- **Performance Benchmarks:** Measure re-render times for complex components like the HeatMap.
