// Overpass QL query templates for expanded POI categories
// Each query fetches nodes + ways with `out center` for way centroids

export type POICategoryGroup =
  | 'heritage' | 'monuments' | 'worship' | 'tourism' | 'nature'
  | 'transport' | 'food_drink' | 'sports' | 'services'
  | 'nightlife' | 'shopping' | 'accommodation'

export type POICategory = typeof POI_CATEGORIES[number]['key']

export interface POICategoryDef {
  key:   string
  group: POICategoryGroup
  label: string
}

export const POI_CATEGORIES: POICategoryDef[] = [
  // Heritage
  { key: 'castle',             group: 'heritage',      label: 'Castles' },
  { key: 'palace',             group: 'heritage',      label: 'Palaces' },
  { key: 'manor',              group: 'heritage',      label: 'Manor Houses' },
  { key: 'historic_house',     group: 'heritage',      label: 'Historic Houses' },
  { key: 'ruins',              group: 'heritage',      label: 'Ruins' },
  { key: 'archaeological_site',group: 'heritage',      label: 'Archaeological Sites' },
  { key: 'city_gate',          group: 'heritage',      label: 'City Gates' },
  { key: 'bunker',             group: 'heritage',      label: 'Bunkers' },
  { key: 'berlin_wall',        group: 'heritage',      label: 'Berlin Wall' },
  { key: 'windmill',           group: 'heritage',      label: 'Windmills' },

  // Monuments
  { key: 'monument',           group: 'monuments',     label: 'Monuments' },
  { key: 'memorial',           group: 'monuments',     label: 'Memorials' },
  { key: 'war_memorial',       group: 'monuments',     label: 'War Memorials' },
  { key: 'statue',             group: 'monuments',     label: 'Statues' },
  { key: 'fountain',           group: 'monuments',     label: 'Fountains' },
  { key: 'artwork',            group: 'monuments',     label: 'Public Art' },

  // Worship
  { key: 'church',             group: 'worship',       label: 'Churches' },
  { key: 'cathedral',          group: 'worship',       label: 'Cathedrals' },
  { key: 'synagogue',          group: 'worship',       label: 'Synagogues' },
  { key: 'mosque',             group: 'worship',       label: 'Mosques' },
  { key: 'chapel',             group: 'worship',       label: 'Chapels' },

  // Tourism
  { key: 'sight',              group: 'tourism',       label: 'Sights' },
  { key: 'viewpoint',          group: 'tourism',       label: 'Viewpoints' },
  { key: 'observation_tower',  group: 'tourism',       label: 'Towers' },
  { key: 'information',        group: 'tourism',       label: 'Info Points' },
  { key: 'zoo',                group: 'tourism',       label: 'Zoos' },
  { key: 'aquarium',           group: 'tourism',       label: 'Aquariums' },
  { key: 'theme_park',         group: 'tourism',       label: 'Theme Parks' },
  { key: 'osm_museum',         group: 'tourism',       label: 'Museums' },
  { key: 'osm_gallery',        group: 'tourism',       label: 'Galleries' },
  { key: 'osm_cinema',         group: 'tourism',       label: 'Cinemas' },

  // Nature
  { key: 'lake',               group: 'nature',        label: 'Lakes' },
  { key: 'beach',              group: 'nature',        label: 'Beaches' },
  { key: 'forest',             group: 'nature',        label: 'Forests' },
  { key: 'nature_reserve',     group: 'nature',        label: 'Nature Reserves' },
  { key: 'garden',             group: 'nature',        label: 'Gardens' },
  { key: 'cemetery_park',      group: 'nature',        label: 'Cemetery Parks' },
  { key: 'allotment_garden',   group: 'nature',        label: 'Kleingarten' },
  { key: 'pond',               group: 'nature',        label: 'Ponds' },

  // Transport
  { key: 'sbahn',              group: 'transport',     label: 'S-Bahn Stations' },
  { key: 'ubahn',              group: 'transport',     label: 'U-Bahn Stations' },
  { key: 'bike_rental',        group: 'transport',     label: 'Bike Rental' },
  { key: 'ev_charging',        group: 'transport',     label: 'EV Charging' },
  { key: 'ferry',              group: 'transport',     label: 'Ferries' },
  { key: 'parking',            group: 'transport',     label: 'Parking' },
  { key: 'tram_stop',          group: 'transport',     label: 'Tram Stops' },
  { key: 'car_sharing',        group: 'transport',     label: 'Car Sharing' },

  // Food & Drink
  { key: 'restaurant',         group: 'food_drink',    label: 'Restaurants' },
  { key: 'cafe',               group: 'food_drink',    label: 'Cafes' },
  { key: 'beer_garden',        group: 'food_drink',    label: 'Beer Gardens' },
  { key: 'market',             group: 'food_drink',    label: 'Markets' },
  { key: 'bakery',             group: 'food_drink',    label: 'Bakeries' },
  { key: 'ice_cream',          group: 'food_drink',    label: 'Ice Cream' },
  { key: 'fast_food',          group: 'food_drink',    label: 'Fast Food' },
  { key: 'food_court',         group: 'food_drink',    label: 'Food Courts' },

  // Sports
  { key: 'gym',                group: 'sports',        label: 'Gyms' },
  { key: 'pool',               group: 'sports',        label: 'Pools' },
  { key: 'climbing',           group: 'sports',        label: 'Climbing' },
  { key: 'sports_centre',      group: 'sports',        label: 'Sports Centres' },
  { key: 'boat_rental',        group: 'sports',        label: 'Boat Rental' },
  { key: 'stadium',            group: 'sports',        label: 'Stadiums' },
  { key: 'playground',         group: 'sports',        label: 'Playgrounds' },
  { key: 'skatepark',          group: 'sports',        label: 'Skateparks' },
  { key: 'dog_park',           group: 'sports',        label: 'Dog Parks' },

  // Services
  { key: 'pharmacy',           group: 'services',      label: 'Pharmacies' },
  { key: 'post_office',        group: 'services',      label: 'Post Offices' },
  { key: 'hospital',           group: 'services',      label: 'Hospitals' },
  { key: 'embassy',            group: 'services',      label: 'Embassies' },
  { key: 'public_toilet',      group: 'services',      label: 'Public Toilets' },
  { key: 'library',            group: 'services',      label: 'Libraries' },
  { key: 'coworking',          group: 'services',      label: 'Coworking' },
  { key: 'dentist',            group: 'services',      label: 'Dentists' },
  { key: 'doctor',             group: 'services',      label: 'Doctors' },
  { key: 'police',             group: 'services',      label: 'Police' },

  // Nightlife
  { key: 'bar',                group: 'nightlife',     label: 'Bars' },
  { key: 'pub',                group: 'nightlife',     label: 'Pubs' },
  { key: 'wine_bar',           group: 'nightlife',     label: 'Wine Bars' },
  { key: 'hookah_lounge',      group: 'nightlife',     label: 'Hookah Lounges' },
  { key: 'nightclub',          group: 'nightlife',     label: 'Clubs' },

  // Shopping
  { key: 'supermarket',        group: 'shopping',      label: 'Supermarkets' },
  { key: 'flea_market',        group: 'shopping',      label: 'Flea Markets' },
  { key: 'mall',               group: 'shopping',      label: 'Malls' },
  { key: 'bookshop',           group: 'shopping',      label: 'Bookshops' },
  { key: 'record_shop',        group: 'shopping',      label: 'Record Shops' },
  { key: 'vintage_shop',       group: 'shopping',      label: 'Vintage Shops' },
  { key: 'convenience',        group: 'shopping',      label: 'Convenience' },
  { key: 'florist',            group: 'shopping',      label: 'Florists' },
  { key: 'bicycle_shop',       group: 'shopping',      label: 'Bike Shops' },

  // Accommodation
  { key: 'hotel',              group: 'accommodation', label: 'Hotels' },
  { key: 'hostel',             group: 'accommodation', label: 'Hostels' },
  { key: 'campsite',           group: 'accommodation', label: 'Campsites' },
  { key: 'apartment',          group: 'accommodation', label: 'Apartments' },
  { key: 'guest_house',        group: 'accommodation', label: 'Guest Houses' },
]

// Map category key → Overpass QL body (use {BBOX} placeholder)
export function getOverpassQuery(category: string, bbox: string): string {
  const q = OVERPASS_QUERIES[category]
  if (!q) throw new Error(`Unknown POI category: ${category}`)
  return q.replace(/\{BBOX\}/g, bbox)
}

const OVERPASS_QUERIES: Record<string, string> = {
  // Heritage
  castle: `[out:json][timeout:30];(node[historic=castle]({BBOX});way[historic=castle]({BBOX}););out center;`,
  palace: `[out:json][timeout:30];(node[historic=palace]({BBOX});way[historic=palace]({BBOX});node[castle_type=palace]({BBOX});way[castle_type=palace]({BBOX}););out center;`,
  manor: `[out:json][timeout:30];(node[historic=manor]({BBOX});way[historic=manor]({BBOX});node[castle_type=manor]({BBOX});way[castle_type=manor]({BBOX}););out center;`,
  historic_house: `[out:json][timeout:30];(node[historic=house]({BBOX});way[historic=house]({BBOX});node[building=historic]({BBOX});way[building=historic]({BBOX}););out center;`,
  ruins: `[out:json][timeout:30];(node[historic=ruins]({BBOX});way[historic=ruins]({BBOX}););out center;`,
  archaeological_site: `[out:json][timeout:30];(node[historic=archaeological_site]({BBOX});way[historic=archaeological_site]({BBOX}););out center;`,
  city_gate: `[out:json][timeout:30];(node[historic=city_gate]({BBOX});way[historic=city_gate]({BBOX}););out center;`,
  bunker: `[out:json][timeout:30];(node[military=bunker]({BBOX});way[military=bunker]({BBOX});node[building=bunker]({BBOX});way[building=bunker]({BBOX}););out center;`,
  berlin_wall: `[out:json][timeout:30];(node[historic=berlin_wall]({BBOX});way[historic=berlin_wall]({BBOX});node[barrier=berlin_wall]({BBOX});way[barrier=berlin_wall]({BBOX});node["berlin_wall"="yes"]({BBOX});way["berlin_wall"="yes"]({BBOX});node[historic=memorial][name~"[Bb]erlin.?[Ww]all|[Bb]erliner.?[Mm]auer"]({BBOX}););out center;`,
  windmill: `[out:json][timeout:30];(node[man_made=windmill]({BBOX});way[man_made=windmill]({BBOX}););out center;`,

  // Monuments
  monument: `[out:json][timeout:30];(node[historic=monument]({BBOX});way[historic=monument]({BBOX}););out center;`,
  memorial: `[out:json][timeout:30];(node[historic=memorial]({BBOX});way[historic=memorial]({BBOX}););out center;`,
  war_memorial: `[out:json][timeout:30];(node[historic=memorial]["memorial:type"=war_memorial]({BBOX});way[historic=memorial]["memorial:type"=war_memorial]({BBOX}););out center;`,
  statue: `[out:json][timeout:30];(node[artwork_type=statue]({BBOX});way[artwork_type=statue]({BBOX});node[historic=statue]({BBOX}););out center;`,
  fountain: `[out:json][timeout:30];(node[amenity=fountain]({BBOX});way[amenity=fountain]({BBOX}););out center;`,
  artwork: `[out:json][timeout:30];(node[tourism=artwork]({BBOX});way[tourism=artwork]({BBOX}););out center;`,

  // Worship
  church: `[out:json][timeout:30];(node[amenity=place_of_worship][religion=christian]({BBOX});way[amenity=place_of_worship][religion=christian]({BBOX}););out center;`,
  cathedral: `[out:json][timeout:30];(node[building=cathedral]({BBOX});way[building=cathedral]({BBOX});node[amenity=place_of_worship][name~"[Dd]om|[Cc]athedral"]({BBOX});way[amenity=place_of_worship][name~"[Dd]om|[Cc]athedral"]({BBOX}););out center;`,
  synagogue: `[out:json][timeout:30];(node[amenity=place_of_worship][religion=jewish]({BBOX});way[amenity=place_of_worship][religion=jewish]({BBOX}););out center;`,
  mosque: `[out:json][timeout:30];(node[amenity=place_of_worship][religion=muslim]({BBOX});way[amenity=place_of_worship][religion=muslim]({BBOX}););out center;`,
  chapel: `[out:json][timeout:30];(node[building=chapel]({BBOX});way[building=chapel]({BBOX}););out center;`,

  // Tourism
  sight: `[out:json][timeout:30];(node[tourism=attraction]({BBOX});way[tourism=attraction]({BBOX}););out center;`,
  viewpoint: `[out:json][timeout:30];(node[tourism=viewpoint]({BBOX});way[tourism=viewpoint]({BBOX}););out center;`,
  observation_tower: `[out:json][timeout:30];(node["tower:type"=observation]({BBOX});way["tower:type"=observation]({BBOX});node[man_made=tower][tourism=yes]({BBOX}););out center;`,
  information: `[out:json][timeout:30];(node[tourism=information]({BBOX});way[tourism=information]({BBOX}););out center;`,
  zoo: `[out:json][timeout:30];(node[tourism=zoo]({BBOX});way[tourism=zoo]({BBOX}););out center;`,
  aquarium: `[out:json][timeout:30];(node[tourism=aquarium]({BBOX});way[tourism=aquarium]({BBOX}););out center;`,
  theme_park: `[out:json][timeout:30];(node[tourism=theme_park]({BBOX});way[tourism=theme_park]({BBOX}););out center;`,
  osm_museum: `[out:json][timeout:30];(node[tourism=museum]({BBOX});way[tourism=museum]({BBOX}););out center;`,
  osm_gallery: `[out:json][timeout:30];(node[tourism=gallery]({BBOX});way[tourism=gallery]({BBOX}););out center;`,
  osm_cinema: `[out:json][timeout:30];(node[amenity=cinema]({BBOX});way[amenity=cinema]({BBOX}););out center;`,

  // Nature
  lake: `[out:json][timeout:30];(node[natural=water][water=lake]({BBOX});way[natural=water][water=lake]({BBOX}););out center;`,
  beach: `[out:json][timeout:30];(node[natural=beach]({BBOX});way[natural=beach]({BBOX});node[leisure=beach_resort]({BBOX}););out center;`,
  forest: `[out:json][timeout:30];(way[landuse=forest][name]({BBOX});way[natural=wood][name]({BBOX}););out center;`,
  nature_reserve: `[out:json][timeout:30];(node[leisure=nature_reserve]({BBOX});way[leisure=nature_reserve]({BBOX}););out center;`,
  garden: `[out:json][timeout:30];(node[leisure=garden]({BBOX});way[leisure=garden]({BBOX}););out center;`,
  cemetery_park: `[out:json][timeout:30];(way[landuse=cemetery][tourism]({BBOX});way[landuse=cemetery][name]({BBOX}););out center;`,
  allotment_garden: `[out:json][timeout:30];(way[landuse=allotments][name]({BBOX}););out center;`,
  pond: `[out:json][timeout:30];(node[natural=water][water=pond]({BBOX});way[natural=water][water=pond]({BBOX}););out center;`,

  // Transport
  sbahn: `[out:json][timeout:30];(node[railway=station][station=light_rail]({BBOX});node[railway=halt][station=light_rail]({BBOX}););out center;`,
  ubahn: `[out:json][timeout:30];(node[railway=station][station=subway]({BBOX});node[railway=station]["network"~"U-Bahn"]({BBOX}););out center;`,
  bike_rental: `[out:json][timeout:30];(node[amenity=bicycle_rental]({BBOX});way[amenity=bicycle_rental]({BBOX}););out center;`,
  ev_charging: `[out:json][timeout:30];(node[amenity=charging_station]({BBOX});way[amenity=charging_station]({BBOX}););out center;`,
  ferry: `[out:json][timeout:30];(node[amenity=ferry_terminal]({BBOX});way[amenity=ferry_terminal]({BBOX}););out center;`,
  parking: `[out:json][timeout:30];(node[amenity=parking][fee=no]({BBOX});way[amenity=parking][fee=no]({BBOX}););out center;`,
  tram_stop: `[out:json][timeout:30];(node[railway=tram_stop]({BBOX}););out center;`,
  car_sharing: `[out:json][timeout:30];(node[amenity=car_sharing]({BBOX});way[amenity=car_sharing]({BBOX}););out center;`,

  // Food & Drink
  restaurant: `[out:json][timeout:60];(node[amenity=restaurant]({BBOX});way[amenity=restaurant]({BBOX}););out center;`,
  cafe: `[out:json][timeout:60];(node[amenity=cafe]({BBOX});way[amenity=cafe]({BBOX}););out center;`,
  beer_garden: `[out:json][timeout:30];(node[amenity=biergarten]({BBOX});way[amenity=biergarten]({BBOX});node[beer_garden=yes]({BBOX}););out center;`,
  market: `[out:json][timeout:30];(node[amenity=marketplace]({BBOX});way[amenity=marketplace]({BBOX}););out center;`,
  bakery: `[out:json][timeout:30];(node[shop=bakery]({BBOX});way[shop=bakery]({BBOX}););out center;`,
  ice_cream: `[out:json][timeout:30];(node[amenity=ice_cream]({BBOX});way[amenity=ice_cream]({BBOX});node[cuisine=ice_cream]({BBOX}););out center;`,
  fast_food: `[out:json][timeout:60];(node[amenity=fast_food]({BBOX});way[amenity=fast_food]({BBOX}););out center;`,
  food_court: `[out:json][timeout:30];(node[amenity=food_court]({BBOX});way[amenity=food_court]({BBOX}););out center;`,

  // Sports
  gym: `[out:json][timeout:30];(node[leisure=fitness_centre]({BBOX});way[leisure=fitness_centre]({BBOX}););out center;`,
  pool: `[out:json][timeout:30];(node[leisure=swimming_pool]({BBOX});way[leisure=swimming_pool]({BBOX});node[amenity=public_bath]({BBOX}););out center;`,
  climbing: `[out:json][timeout:30];(node[sport=climbing]({BBOX});way[sport=climbing]({BBOX}););out center;`,
  sports_centre: `[out:json][timeout:30];(node[leisure=sports_centre]({BBOX});way[leisure=sports_centre]({BBOX}););out center;`,
  boat_rental: `[out:json][timeout:30];(node[shop=boat_rental]({BBOX});way[shop=boat_rental]({BBOX});node[amenity=boat_rental]({BBOX}););out center;`,
  stadium: `[out:json][timeout:30];(node[leisure=stadium]({BBOX});way[leisure=stadium]({BBOX}););out center;`,
  playground: `[out:json][timeout:60];(node[leisure=playground]({BBOX});way[leisure=playground]({BBOX}););out center;`,
  skatepark: `[out:json][timeout:30];(node[sport=skateboard]({BBOX});way[sport=skateboard]({BBOX}););out center;`,
  dog_park: `[out:json][timeout:30];(node[leisure=dog_park]({BBOX});way[leisure=dog_park]({BBOX}););out center;`,

  // Services
  pharmacy: `[out:json][timeout:30];(node[amenity=pharmacy]({BBOX});way[amenity=pharmacy]({BBOX}););out center;`,
  post_office: `[out:json][timeout:30];(node[amenity=post_office]({BBOX});way[amenity=post_office]({BBOX}););out center;`,
  hospital: `[out:json][timeout:30];(node[amenity=hospital]({BBOX});way[amenity=hospital]({BBOX}););out center;`,
  embassy: `[out:json][timeout:30];(node[amenity=embassy]({BBOX});way[amenity=embassy]({BBOX});node[office=diplomatic]({BBOX});way[office=diplomatic]({BBOX}););out center;`,
  public_toilet: `[out:json][timeout:30];(node[amenity=toilets]({BBOX});way[amenity=toilets]({BBOX}););out center;`,
  library: `[out:json][timeout:30];(node[amenity=library]({BBOX});way[amenity=library]({BBOX}););out center;`,
  coworking: `[out:json][timeout:30];(node[office=coworking]({BBOX});way[office=coworking]({BBOX});node[amenity=coworking_space]({BBOX}););out center;`,
  dentist: `[out:json][timeout:30];(node[amenity=dentist]({BBOX});way[amenity=dentist]({BBOX}););out center;`,
  doctor: `[out:json][timeout:30];(node[amenity=doctors]({BBOX});way[amenity=doctors]({BBOX}););out center;`,
  police: `[out:json][timeout:30];(node[amenity=police]({BBOX});way[amenity=police]({BBOX}););out center;`,

  // Nightlife
  bar: `[out:json][timeout:30];(node[amenity=bar]({BBOX});way[amenity=bar]({BBOX}););out center;`,
  pub: `[out:json][timeout:30];(node[amenity=pub]({BBOX});way[amenity=pub]({BBOX}););out center;`,
  wine_bar: `[out:json][timeout:30];(node[amenity=bar][bar=wine]({BBOX});way[amenity=bar][bar=wine]({BBOX});node[amenity=bar][name~"[Ww]ein",i]({BBOX}););out center;`,
  hookah_lounge: `[out:json][timeout:30];(node[amenity=hookah_lounge]({BBOX});way[amenity=hookah_lounge]({BBOX});node[amenity=bar][hookah=yes]({BBOX}););out center;`,
  nightclub: `[out:json][timeout:30];(node[amenity=nightclub]({BBOX});way[amenity=nightclub]({BBOX}););out center;`,

  // Shopping
  supermarket: `[out:json][timeout:30];(node[shop=supermarket]({BBOX});way[shop=supermarket]({BBOX}););out center;`,
  flea_market: `[out:json][timeout:30];(node[amenity=marketplace][name~"[Ff]loh|[Tt]rödel|[Ff]lea",i]({BBOX});way[amenity=marketplace][name~"[Ff]loh|[Tt]rödel|[Ff]lea",i]({BBOX});node[shop=second_hand]({BBOX}););out center;`,
  mall: `[out:json][timeout:30];(node[shop=mall]({BBOX});way[shop=mall]({BBOX});node[shop=department_store]({BBOX});way[shop=department_store]({BBOX}););out center;`,
  bookshop: `[out:json][timeout:30];(node[shop=books]({BBOX});way[shop=books]({BBOX}););out center;`,
  record_shop: `[out:json][timeout:30];(node[shop=music]({BBOX});way[shop=music]({BBOX}););out center;`,
  vintage_shop: `[out:json][timeout:30];(node[shop=second_hand]({BBOX});way[shop=second_hand]({BBOX});node[shop=vintage]({BBOX}););out center;`,
  convenience: `[out:json][timeout:60];(node[shop=convenience]({BBOX});way[shop=convenience]({BBOX}););out center;`,
  florist: `[out:json][timeout:30];(node[shop=florist]({BBOX});way[shop=florist]({BBOX}););out center;`,
  bicycle_shop: `[out:json][timeout:30];(node[shop=bicycle]({BBOX});way[shop=bicycle]({BBOX}););out center;`,

  // Accommodation
  hotel: `[out:json][timeout:30];(node[tourism=hotel]({BBOX});way[tourism=hotel]({BBOX}););out center;`,
  hostel: `[out:json][timeout:30];(node[tourism=hostel]({BBOX});way[tourism=hostel]({BBOX}););out center;`,
  campsite: `[out:json][timeout:30];(node[tourism=camp_site]({BBOX});way[tourism=camp_site]({BBOX}););out center;`,
  apartment: `[out:json][timeout:30];(node[tourism=apartment]({BBOX});way[tourism=apartment]({BBOX}););out center;`,
  guest_house: `[out:json][timeout:30];(node[tourism=guest_house]({BBOX});way[tourism=guest_house]({BBOX}););out center;`,
}

// Group metadata
export const POI_GROUPS: Array<{ key: POICategoryGroup; label: string }> = [
  { key: 'heritage',      label: 'Heritage' },
  { key: 'monuments',     label: 'Monuments' },
  { key: 'worship',       label: 'Worship' },
  { key: 'tourism',       label: 'Tourism' },
  { key: 'nature',        label: 'Nature' },
  { key: 'transport',     label: 'Transport' },
  { key: 'food_drink',    label: 'Food & Drink' },
  { key: 'sports',        label: 'Sports' },
  { key: 'services',      label: 'Services' },
  { key: 'nightlife',     label: 'Nightlife' },
  { key: 'shopping',      label: 'Shopping' },
  { key: 'accommodation', label: 'Accommodation' },
]
