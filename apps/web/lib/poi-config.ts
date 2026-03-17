// POI category group definitions with labels, icons, and per-category colors

export interface POICategoryConfig {
  key:    string
  label:  string
  color:  string
  stroke: string
}

export interface POIGroupConfig {
  key:        string
  label:      string
  icon:       string // Lucide icon name
  categories: POICategoryConfig[]
}

export const POI_GROUPS: POIGroupConfig[] = [
  {
    key: 'heritage', label: 'Heritage', icon: 'Castle',
    categories: [
      { key: 'castle',              label: 'Castles',              color: '#854d0e', stroke: '#713f12' },
      { key: 'palace',              label: 'Palaces',              color: '#a16207', stroke: '#854d0e' },
      { key: 'manor',               label: 'Manors',               color: '#b45309', stroke: '#92400e' },
      { key: 'historic_house',      label: 'Historic Houses',      color: '#c2410c', stroke: '#9a3412' },
      { key: 'ruins',               label: 'Ruins',                color: '#78716c', stroke: '#57534e' },
      { key: 'archaeological_site', label: 'Archaeological',       color: '#92400e', stroke: '#78350f' },
      { key: 'city_gate',           label: 'City Gates',           color: '#a16207', stroke: '#854d0e' },
      { key: 'bunker',              label: 'Bunkers',              color: '#525252', stroke: '#404040' },
      { key: 'berlin_wall',         label: 'Berlin Wall',          color: '#475569', stroke: '#334155' },
      { key: 'windmill',            label: 'Windmills',            color: '#65a30d', stroke: '#4d7c0f' },
    ],
  },
  {
    key: 'monuments', label: 'Monuments', icon: 'Milestone',
    categories: [
      { key: 'monument',     label: 'Monuments',     color: '#b91c1c', stroke: '#991b1b' },
      { key: 'memorial',     label: 'Memorials',     color: '#9f1239', stroke: '#881337' },
      { key: 'war_memorial', label: 'War Memorials', color: '#6b7280', stroke: '#4b5563' },
      { key: 'statue',       label: 'Statues',       color: '#7c3aed', stroke: '#6d28d9' },
      { key: 'fountain',     label: 'Fountains',     color: '#0284c7', stroke: '#0369a1' },
      { key: 'artwork',      label: 'Public Art',    color: '#e879f9', stroke: '#d946ef' },
    ],
  },
  {
    key: 'worship', label: 'Worship', icon: 'Church',
    categories: [
      { key: 'church',    label: 'Churches',    color: '#a16207', stroke: '#854d0e' },
      { key: 'cathedral', label: 'Cathedrals',  color: '#854d0e', stroke: '#713f12' },
      { key: 'synagogue', label: 'Synagogues',  color: '#1d4ed8', stroke: '#1e40af' },
      { key: 'mosque',    label: 'Mosques',     color: '#059669', stroke: '#047857' },
      { key: 'chapel',    label: 'Chapels',     color: '#b45309', stroke: '#92400e' },
    ],
  },
  {
    key: 'tourism', label: 'Tourism', icon: 'Camera',
    categories: [
      { key: 'sight',              label: 'Sights',      color: '#dc2626', stroke: '#b91c1c' },
      { key: 'viewpoint',          label: 'Viewpoints',  color: '#16a34a', stroke: '#15803d' },
      { key: 'observation_tower',  label: 'Towers',      color: '#7c3aed', stroke: '#6d28d9' },
      { key: 'information',        label: 'Info Points', color: '#2563eb', stroke: '#1d4ed8' },
      { key: 'zoo',                label: 'Zoos',        color: '#ca8a04', stroke: '#a16207' },
      { key: 'aquarium',           label: 'Aquariums',   color: '#0891b2', stroke: '#0e7490' },
      { key: 'theme_park',         label: 'Theme Parks', color: '#e11d48', stroke: '#be123c' },
      { key: 'osm_museum',         label: 'Museums',     color: '#b45309', stroke: '#92400e' },
      { key: 'osm_gallery',        label: 'Galleries',   color: '#7c3aed', stroke: '#6d28d9' },
      { key: 'osm_cinema',         label: 'Cinemas',     color: '#0891b2', stroke: '#0e7490' },
    ],
  },
  {
    key: 'nature', label: 'Nature', icon: 'TreePine',
    categories: [
      { key: 'lake',            label: 'Lakes',     color: '#0284c7', stroke: '#0369a1' },
      { key: 'beach',           label: 'Beaches',   color: '#eab308', stroke: '#ca8a04' },
      { key: 'forest',          label: 'Forests',   color: '#15803d', stroke: '#166534' },
      { key: 'nature_reserve',  label: 'Reserves',  color: '#16a34a', stroke: '#15803d' },
      { key: 'garden',          label: 'Gardens',   color: '#65a30d', stroke: '#4d7c0f' },
      { key: 'cemetery_park',   label: 'Cemeteries',color: '#6b7280', stroke: '#4b5563' },
      { key: 'allotment_garden',label: 'Kleingarten',color:'#4d7c0f', stroke: '#365314' },
      { key: 'pond',            label: 'Ponds',     color: '#0284c7', stroke: '#0369a1' },
    ],
  },
  {
    key: 'transport', label: 'Transport', icon: 'Train',
    categories: [
      { key: 'sbahn',       label: 'S-Bahn',       color: '#16a34a', stroke: '#15803d' },
      { key: 'ubahn',       label: 'U-Bahn',       color: '#2563eb', stroke: '#1d4ed8' },
      { key: 'bike_rental', label: 'Bike Rental',  color: '#ea580c', stroke: '#c2410c' },
      { key: 'ev_charging', label: 'EV Charging',  color: '#0891b2', stroke: '#0e7490' },
      { key: 'ferry',       label: 'Ferries',      color: '#0369a1', stroke: '#075985' },
      { key: 'parking',     label: 'Parking',      color: '#6b7280', stroke: '#4b5563' },
      { key: 'tram_stop',   label: 'Tram Stops',   color: '#dc2626', stroke: '#b91c1c' },
      { key: 'car_sharing', label: 'Car Sharing',  color: '#059669', stroke: '#047857' },
    ],
  },
  {
    key: 'food_drink', label: 'Food & Drink', icon: 'UtensilsCrossed',
    categories: [
      { key: 'restaurant',  label: 'Restaurants',  color: '#dc2626', stroke: '#b91c1c' },
      { key: 'cafe',        label: 'Cafes',        color: '#b45309', stroke: '#92400e' },
      { key: 'beer_garden', label: 'Beer Gardens', color: '#ca8a04', stroke: '#a16207' },
      { key: 'market',      label: 'Markets',      color: '#65a30d', stroke: '#4d7c0f' },
      { key: 'bakery',      label: 'Bakeries',     color: '#d97706', stroke: '#b45309' },
      { key: 'ice_cream',   label: 'Ice Cream',    color: '#ec4899', stroke: '#db2777' },
      { key: 'fast_food',   label: 'Fast Food',    color: '#ea580c', stroke: '#c2410c' },
      { key: 'food_court',  label: 'Food Courts',  color: '#d97706', stroke: '#b45309' },
    ],
  },
  {
    key: 'sports', label: 'Sports', icon: 'Dumbbell',
    categories: [
      { key: 'gym',            label: 'Gyms',           color: '#dc2626', stroke: '#b91c1c' },
      { key: 'pool',           label: 'Pools',          color: '#0284c7', stroke: '#0369a1' },
      { key: 'climbing',       label: 'Climbing',       color: '#ea580c', stroke: '#c2410c' },
      { key: 'sports_centre',  label: 'Sports Centres', color: '#16a34a', stroke: '#15803d' },
      { key: 'boat_rental',    label: 'Boat Rental',    color: '#0891b2', stroke: '#0e7490' },
      { key: 'stadium',        label: 'Stadiums',       color: '#7c3aed', stroke: '#6d28d9' },
      { key: 'playground',      label: 'Playgrounds',    color: '#f59e0b', stroke: '#d97706' },
      { key: 'skatepark',       label: 'Skateparks',     color: '#6366f1', stroke: '#4f46e5' },
      { key: 'dog_park',        label: 'Dog Parks',      color: '#65a30d', stroke: '#4d7c0f' },
    ],
  },
  {
    key: 'services', label: 'Services', icon: 'Building2',
    categories: [
      { key: 'pharmacy',      label: 'Pharmacies',    color: '#dc2626', stroke: '#b91c1c' },
      { key: 'post_office',   label: 'Post Offices',  color: '#eab308', stroke: '#ca8a04' },
      { key: 'hospital',      label: 'Hospitals',     color: '#e11d48', stroke: '#be123c' },
      { key: 'embassy',       label: 'Embassies',     color: '#1d4ed8', stroke: '#1e40af' },
      { key: 'public_toilet', label: 'Toilets',       color: '#6b7280', stroke: '#4b5563' },
      { key: 'library',       label: 'Libraries',     color: '#0369a1', stroke: '#075985' },
      { key: 'coworking',     label: 'Coworking',     color: '#7c3aed', stroke: '#6d28d9' },
      { key: 'dentist',      label: 'Dentists',      color: '#0891b2', stroke: '#0e7490' },
      { key: 'doctor',       label: 'Doctors',       color: '#0284c7', stroke: '#0369a1' },
      { key: 'police',       label: 'Police',        color: '#1d4ed8', stroke: '#1e40af' },
    ],
  },
  {
    key: 'nightlife', label: 'Nightlife', icon: 'Wine',
    categories: [
      { key: 'bar',           label: 'Bars',           color: '#dc2626', stroke: '#b91c1c' },
      { key: 'pub',           label: 'Pubs',           color: '#b45309', stroke: '#92400e' },
      { key: 'wine_bar',      label: 'Wine Bars',      color: '#9f1239', stroke: '#881337' },
      { key: 'hookah_lounge', label: 'Hookah Lounges', color: '#6b7280', stroke: '#4b5563' },
      { key: 'nightclub',     label: 'Clubs',          color: '#9333ea', stroke: '#7e22ce' },
    ],
  },
  {
    key: 'shopping', label: 'Shopping', icon: 'ShoppingBag',
    categories: [
      { key: 'supermarket',  label: 'Supermarkets', color: '#16a34a', stroke: '#15803d' },
      { key: 'flea_market',  label: 'Flea Markets', color: '#d97706', stroke: '#b45309' },
      { key: 'mall',         label: 'Malls',        color: '#7c3aed', stroke: '#6d28d9' },
      { key: 'bookshop',     label: 'Bookshops',    color: '#0369a1', stroke: '#075985' },
      { key: 'record_shop',  label: 'Record Shops', color: '#7c3aed', stroke: '#4c1d95' },
      { key: 'vintage_shop', label: 'Vintage',      color: '#d97706', stroke: '#92400e' },
      { key: 'convenience',  label: 'Convenience',  color: '#059669', stroke: '#047857' },
      { key: 'florist',      label: 'Florists',     color: '#ec4899', stroke: '#db2777' },
    ],
  },
  {
    key: 'accommodation', label: 'Accommodation', icon: 'Bed',
    categories: [
      { key: 'hotel',    label: 'Hotels',    color: '#7c3aed', stroke: '#6d28d9' },
      { key: 'hostel',   label: 'Hostels',   color: '#2563eb', stroke: '#1d4ed8' },
      { key: 'campsite',    label: 'Campsites',    color: '#16a34a', stroke: '#15803d' },
      { key: 'apartment',   label: 'Apartments',   color: '#ea580c', stroke: '#c2410c' },
      { key: 'guest_house', label: 'Guest Houses', color: '#0891b2', stroke: '#0e7490' },
    ],
  },
]

// Lookup helpers
export function getPOIColor(group: string, category: string): { color: string; stroke: string } {
  const g = POI_GROUPS.find(g => g.key === group)
  const c = g?.categories.find(c => c.key === category)
  return c ? { color: c.color, stroke: c.stroke } : { color: '#6b7280', stroke: '#4b5563' }
}

export function getPOILabel(group: string, category: string): string {
  const g = POI_GROUPS.find(g => g.key === group)
  const c = g?.categories.find(c => c.key === category)
  return c?.label ?? category
}
