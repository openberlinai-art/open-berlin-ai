// Zoom-level POI visibility tiers (currently all set to 0 — all categories visible at every zoom)

export const ZOOM_THRESHOLDS = { low: 0, medium: 0, high: 0 } as const

export type ZoomTier = keyof typeof ZOOM_THRESHOLDS

// Categories mapped to LOW tier
const LOW_TIER: Set<string> = new Set([
  'heritage:castle', 'heritage:palace',
  'tourism:sight', 'tourism:zoo', 'tourism:observation_tower',
  'monuments:monument',
  'outdoors:lake',       // nature:lake API group, but filter key is outdoors:lake
  'sports:stadium',
  'culture:museum', 'culture:theatre', 'culture:concert_hall',
])

// Categories mapped to HIGH tier
const HIGH_TIER: Set<string> = new Set([
  'transport:parking', 'transport:tram_stop', 'transport:ev_charging',
  'transport:car_sharing', 'transport:taxi', 'transport:scooter_rental',
  'monuments:memorial', 'monuments:artwork', 'monuments:fountain',
  'tourism:information',
  'food_drink:fast_food', 'food_drink:bakery',
  'services:dentist', 'services:doctor', 'services:public_toilet',
  'services:atm', 'services:laundry', 'services:recycling', 'services:veterinary',
  'shopping:convenience',
  'outdoors:allotment_garden', 'outdoors:playground_poi',
  'heritage:stolperstein',
  'sports:pool',
  'education:kindergarten',
  'quirky:drinking_water', 'quirky:defibrillator',
])

/** Get the zoom tier for a filter key like "group:category" */
export function getZoomTier(filterKey: string): ZoomTier {
  if (LOW_TIER.has(filterKey)) return 'low'
  if (HIGH_TIER.has(filterKey)) return 'high'
  return 'medium'
}

/** Get the minimum zoom level at which a category becomes visible */
export function getMinZoomForFilter(filterKey: string): number {
  return ZOOM_THRESHOLDS[getZoomTier(filterKey)]
}

/** Check if a category should be visible at the given zoom level */
export function isCategoryVisibleAtZoom(filterKey: string, zoom: number): boolean {
  return zoom >= getMinZoomForFilter(filterKey)
}
