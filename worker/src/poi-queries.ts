// Overpass QL query templates for expanded POI categories
// Each query fetches nodes + ways with `out center` for way centroids

export type POICategoryGroup =
  | 'heritage' | 'monuments' | 'worship' | 'tourism' | 'nature'
  | 'transport' | 'food_drink' | 'sports' | 'services'
  | 'nightlife' | 'shopping' | 'accommodation'
  | 'culture' | 'wellness' | 'education' | 'quirky'

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

  // Culture (Arts & Culture)
  { key: 'theatre',            group: 'culture',       label: 'Theatres' },
  { key: 'arts_centre',        group: 'culture',       label: 'Arts Centres' },
  { key: 'music_venue',        group: 'culture',       label: 'Music Venues' },
  { key: 'community_centre',   group: 'culture',       label: 'Community Centres' },

  // Wellness
  { key: 'sauna',              group: 'wellness',      label: 'Saunas' },
  { key: 'spa',                group: 'wellness',      label: 'Spas' },

  // Education
  { key: 'university',         group: 'education',     label: 'Universities' },
  { key: 'language_school',    group: 'education',     label: 'Language Schools' },
  { key: 'kindergarten',       group: 'education',     label: 'Kindergartens' },

  // Quirky (Weird & Wonderful)
  { key: 'photo_booth',        group: 'quirky',        label: 'Photo Booths' },
  { key: 'public_bookcase',    group: 'quirky',        label: 'Book Exchanges' },
  { key: 'drinking_water',     group: 'quirky',        label: 'Water Fountains' },
  { key: 'public_piano',       group: 'quirky',        label: 'Public Pianos' },
  { key: 'bbq_area',           group: 'quirky',        label: 'BBQ Areas' },
  { key: 'nudist_area',        group: 'quirky',        label: 'FKK Areas' },
  { key: 'defibrillator',      group: 'quirky',        label: 'Defibrillators' },

  // Additions to existing groups
  { key: 'stolperstein',       group: 'heritage',      label: 'Stolpersteine' },
  { key: 'industrial_heritage',group: 'heritage',      label: 'Industrial Heritage' },
  { key: 'historic_cemetery',  group: 'heritage',      label: 'Historic Cemeteries' },
  { key: 'community_garden',   group: 'nature',        label: 'Community Gardens' },
  { key: 'bathing_spot',       group: 'nature',        label: 'Bathing Spots' },
  { key: 'brewery',            group: 'food_drink',    label: 'Breweries' },
  { key: 'kebab',              group: 'food_drink',    label: 'Kebab' },
  { key: 'vietnamese',         group: 'food_drink',    label: 'Vietnamese' },
  { key: 'vegan',              group: 'food_drink',    label: 'Vegan' },
  { key: 'wochenmarkt',        group: 'food_drink',    label: 'Weekly Markets' },
  { key: 'table_tennis',       group: 'sports',        label: 'Table Tennis' },
  { key: 'bowling',            group: 'sports',        label: 'Bowling' },
  { key: 'escape_room',        group: 'sports',        label: 'Escape Rooms' },
  { key: 'mini_golf',          group: 'sports',        label: 'Mini Golf' },
  { key: 'outdoor_gym',        group: 'sports',        label: 'Outdoor Gyms' },
  { key: 'atm',                group: 'services',      label: 'ATMs' },
  { key: 'laundry',            group: 'services',      label: 'Laundry' },
  { key: 'veterinary',         group: 'services',      label: 'Veterinary' },
  { key: 'recycling',          group: 'services',      label: 'Recycling' },
  { key: 'social_facility',    group: 'services',      label: 'Social Services' },
  { key: 'nette_toilette',     group: 'services',      label: 'Nette Toilette' },
  { key: 'cocktail_bar',       group: 'nightlife',     label: 'Cocktail Bars' },
  { key: 'live_music_poi',     group: 'nightlife',     label: 'Live Music' },
  { key: 'karaoke',            group: 'nightlife',     label: 'Karaoke' },
  { key: 'rooftop_bar',        group: 'nightlife',     label: 'Rooftop Bars' },
  { key: 'organic_shop',       group: 'shopping',      label: 'Organic Shops' },
  { key: 'wine_shop',          group: 'shopping',      label: 'Wine Shops' },
  { key: 'charity_shop',       group: 'shopping',      label: 'Charity Shops' },
  { key: 'pet_shop',           group: 'shopping',      label: 'Pet Shops' },
  { key: 'scooter_rental',     group: 'transport',     label: 'Scooter Rental' },
  { key: 'taxi',               group: 'transport',     label: 'Taxi Stands' },
  { key: 'bus_stop',           group: 'transport',     label: 'Bus Stops' },
  { key: 'bicycle_parking',    group: 'transport',     label: 'Bike Parking' },
  { key: 'outdoor_cinema',     group: 'culture',       label: 'Outdoor Cinemas' },
  { key: 'spaeti',             group: 'quirky',        label: 'Spätis' },
  { key: 'tattoo',             group: 'quirky',        label: 'Tattoo Shops' },
  { key: 'repair_cafe',        group: 'quirky',        label: 'Repair Cafés' },
  { key: 'mural',              group: 'quirky',        label: 'Murals' },
  // Shopping batch 2
  { key: 'clothes',            group: 'shopping',      label: 'Clothing' },
  { key: 'electronics',        group: 'shopping',      label: 'Electronics' },
  { key: 'hardware',           group: 'shopping',      label: 'Hardware' },
  { key: 'shoes',              group: 'shopping',      label: 'Shoes' },
  { key: 'jewelry',            group: 'shopping',      label: 'Jewelry' },
  { key: 'furniture',          group: 'shopping',      label: 'Furniture' },
  { key: 'deli',               group: 'food_drink',    label: 'Delis' },
  { key: 'butcher',            group: 'food_drink',    label: 'Butchers' },
  { key: 'mobile_phone',       group: 'shopping',      label: 'Phone Shops' },
  { key: 'optician',           group: 'services',      label: 'Opticians' },
  // Services batch 2
  { key: 'bank',               group: 'services',      label: 'Banks' },
  { key: 'fuel',               group: 'services',      label: 'Gas Stations' },
  { key: 'car_rental',         group: 'transport',     label: 'Car Rental' },
  { key: 'car_wash',           group: 'services',      label: 'Car Wash' },
  { key: 'clinic',             group: 'services',      label: 'Clinics' },
  { key: 'fire_station',       group: 'services',      label: 'Fire Stations' },
  { key: 'townhall',           group: 'services',      label: 'Town Halls' },
  { key: 'hairdresser',        group: 'services',      label: 'Hairdressers' },
  { key: 'beauty_salon',       group: 'services',      label: 'Beauty Salons' },
  // Entertainment
  { key: 'yoga',               group: 'sports',        label: 'Yoga' },
  { key: 'dance_studio',       group: 'sports',        label: 'Dance Studios' },
  { key: 'amusement_arcade',   group: 'quirky',        label: 'Arcades' },
  // Education additions
  { key: 'school',             group: 'education',     label: 'Schools' },
  { key: 'college',            group: 'education',     label: 'Colleges' },
  { key: 'driving_school',     group: 'education',     label: 'Driving Schools' },
  { key: 'music_school',       group: 'education',     label: 'Music Schools' },
  // Nature additions
  { key: 'picnic_site',        group: 'nature',        label: 'Picnic Sites' },
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

  // Culture (Arts & Culture)
  theatre: `[out:json][timeout:30];(node[amenity=theatre]({BBOX});way[amenity=theatre]({BBOX}););out center;`,
  arts_centre: `[out:json][timeout:30];(node[amenity=arts_centre]({BBOX});way[amenity=arts_centre]({BBOX}););out center;`,
  music_venue: `[out:json][timeout:30];(node[amenity=music_venue]({BBOX});way[amenity=music_venue]({BBOX});node[amenity=concert_hall]({BBOX});way[amenity=concert_hall]({BBOX}););out center;`,
  community_centre: `[out:json][timeout:30];(node[amenity=community_centre]({BBOX});way[amenity=community_centre]({BBOX}););out center;`,

  // Wellness
  sauna: `[out:json][timeout:30];(node[leisure=sauna]({BBOX});way[leisure=sauna]({BBOX}););out center;`,
  spa: `[out:json][timeout:30];(node[amenity=spa]({BBOX});way[amenity=spa]({BBOX});node[leisure=spa]({BBOX});way[leisure=spa]({BBOX}););out center;`,

  // Education
  university: `[out:json][timeout:30];(node[amenity=university]({BBOX});way[amenity=university]({BBOX}););out center;`,
  language_school: `[out:json][timeout:30];(node[amenity=language_school]({BBOX});way[amenity=language_school]({BBOX}););out center;`,
  kindergarten: `[out:json][timeout:60];(node[amenity=kindergarten]({BBOX});way[amenity=kindergarten]({BBOX}););out center;`,

  // Quirky (Weird & Wonderful)
  photo_booth: `[out:json][timeout:30];(node[amenity=photo_booth]({BBOX});way[amenity=photo_booth]({BBOX}););out center;`,
  public_bookcase: `[out:json][timeout:30];(node[amenity=public_bookcase]({BBOX});way[amenity=public_bookcase]({BBOX}););out center;`,
  drinking_water: `[out:json][timeout:60];(node[amenity=drinking_water]({BBOX}););out center;`,
  public_piano: `[out:json][timeout:30];(node[musical_instrument=piano][access=yes]({BBOX}););out center;`,
  bbq_area: `[out:json][timeout:30];(node[amenity=bbq]({BBOX});way[amenity=bbq]({BBOX}););out center;`,
  nudist_area: `[out:json][timeout:30];(node[nudism=yes]({BBOX});way[nudism=yes]({BBOX});node[nudism=designated]({BBOX});way[nudism=designated]({BBOX}););out center;`,
  defibrillator: `[out:json][timeout:30];(node[emergency=defibrillator]({BBOX}););out center;`,

  // Heritage additions
  stolperstein: `[out:json][timeout:60];(node[historic=memorial]["memorial:type"=stolperstein]({BBOX}););out center;`,
  industrial_heritage: `[out:json][timeout:30];(node[historic=industrial]({BBOX});way[historic=industrial]({BBOX});node[man_made=watermill]({BBOX});way[man_made=watermill]({BBOX}););out center;`,
  historic_cemetery: `[out:json][timeout:30];(way[landuse=cemetery][historic]({BBOX});way[landuse=cemetery][heritage]({BBOX}););out center;`,

  // Nature additions
  community_garden: `[out:json][timeout:30];(node[leisure=garden]["garden:type"=community]({BBOX});way[leisure=garden]["garden:type"=community]({BBOX}););out center;`,
  bathing_spot: `[out:json][timeout:30];(node[leisure=bathing_place]({BBOX});way[leisure=bathing_place]({BBOX});node[sport=swimming][natural]({BBOX}););out center;`,

  // Food & Drink additions
  brewery: `[out:json][timeout:30];(node[craft=brewery]({BBOX});way[craft=brewery]({BBOX});node[microbrewery=yes]({BBOX}););out center;`,
  kebab: `[out:json][timeout:60];(node[cuisine~"kebab|döner|doner",i]({BBOX});way[cuisine~"kebab|döner|doner",i]({BBOX}););out center;`,
  vietnamese: `[out:json][timeout:30];(node[cuisine=vietnamese]({BBOX});way[cuisine=vietnamese]({BBOX}););out center;`,
  vegan: `[out:json][timeout:30];(node["diet:vegan"=only]({BBOX});way["diet:vegan"=only]({BBOX});node[cuisine=vegan]({BBOX});way[cuisine=vegan]({BBOX}););out center;`,
  wochenmarkt: `[out:json][timeout:30];(node[amenity=marketplace][name~"[Ww]ochen",i]({BBOX});way[amenity=marketplace][name~"[Ww]ochen",i]({BBOX}););out center;`,

  // Sports additions
  table_tennis: `[out:json][timeout:30];(node[sport=table_tennis]({BBOX});way[sport=table_tennis]({BBOX});node[leisure=pitch][sport=table_tennis]({BBOX}););out center;`,
  bowling: `[out:json][timeout:30];(node[sport=bowling]({BBOX});way[sport=bowling]({BBOX});node[leisure=bowling_alley]({BBOX});way[leisure=bowling_alley]({BBOX}););out center;`,
  escape_room: `[out:json][timeout:30];(node[leisure=escape_game]({BBOX});way[leisure=escape_game]({BBOX}););out center;`,
  mini_golf: `[out:json][timeout:30];(node[leisure=miniature_golf]({BBOX});way[leisure=miniature_golf]({BBOX}););out center;`,
  outdoor_gym: `[out:json][timeout:30];(node[leisure=fitness_station]({BBOX});way[leisure=fitness_station]({BBOX}););out center;`,

  // Services additions
  atm: `[out:json][timeout:60];(node[amenity=atm]({BBOX}););out center;`,
  laundry: `[out:json][timeout:30];(node[shop=laundry]({BBOX});way[shop=laundry]({BBOX});node[amenity=laundry]({BBOX}););out center;`,
  veterinary: `[out:json][timeout:30];(node[amenity=veterinary]({BBOX});way[amenity=veterinary]({BBOX}););out center;`,
  recycling: `[out:json][timeout:60];(node[amenity=recycling]({BBOX}););out center;`,
  social_facility: `[out:json][timeout:30];(node[social_facility]({BBOX});way[social_facility]({BBOX}););out center;`,
  nette_toilette: `[out:json][timeout:30];(node[amenity=toilets]["toilets:scheme"=nette_toilette]({BBOX}););out center;`,

  // Nightlife additions
  cocktail_bar: `[out:json][timeout:30];(node[amenity=bar][cocktails=yes]({BBOX});way[amenity=bar][cocktails=yes]({BBOX});node[amenity=bar][name~"[Cc]ocktail",i]({BBOX}););out center;`,
  live_music_poi: `[out:json][timeout:30];(node[amenity=bar][live_music=yes]({BBOX});way[amenity=bar][live_music=yes]({BBOX});node[amenity=pub][live_music=yes]({BBOX}););out center;`,
  karaoke: `[out:json][timeout:30];(node[amenity=bar][karaoke=yes]({BBOX});way[amenity=bar][karaoke=yes]({BBOX});node[leisure=karaoke_box]({BBOX}););out center;`,
  rooftop_bar: `[out:json][timeout:30];(node[amenity=bar][outdoor_seating=rooftop]({BBOX});way[amenity=bar][outdoor_seating=rooftop]({BBOX});node[amenity=restaurant][outdoor_seating=rooftop]({BBOX});way[amenity=restaurant][outdoor_seating=rooftop]({BBOX}););out center;`,

  // Shopping additions
  organic_shop: `[out:json][timeout:30];(node[shop=organic]({BBOX});way[shop=organic]({BBOX});node[shop=supermarket][organic=only]({BBOX}););out center;`,
  wine_shop: `[out:json][timeout:30];(node[shop=wine]({BBOX});way[shop=wine]({BBOX}););out center;`,
  charity_shop: `[out:json][timeout:30];(node[shop=charity]({BBOX});way[shop=charity]({BBOX});node[shop=second_hand][charity=yes]({BBOX}););out center;`,
  pet_shop: `[out:json][timeout:30];(node[shop=pet]({BBOX});way[shop=pet]({BBOX}););out center;`,

  // Transport additions
  scooter_rental: `[out:json][timeout:30];(node[amenity=kick-scooter_rental]({BBOX});way[amenity=kick-scooter_rental]({BBOX}););out center;`,
  taxi: `[out:json][timeout:30];(node[amenity=taxi]({BBOX});way[amenity=taxi]({BBOX}););out center;`,
  bus_stop: `[out:json][timeout:60];(node[highway=bus_stop]({BBOX}););out center;`,
  bicycle_parking: `[out:json][timeout:60];(node[amenity=bicycle_parking]({BBOX}););out center;`,

  // Culture additions
  outdoor_cinema: `[out:json][timeout:30];(node[amenity=cinema][open_air=yes]({BBOX});way[amenity=cinema][open_air=yes]({BBOX}););out center;`,

  // Quirky additions
  spaeti: `[out:json][timeout:60];(node[shop=kiosk]({BBOX});way[shop=kiosk]({BBOX});node[shop=convenience][name~"[Ss]pät",i]({BBOX}););out center;`,
  tattoo: `[out:json][timeout:30];(node[shop=tattoo]({BBOX});way[shop=tattoo]({BBOX}););out center;`,
  repair_cafe: `[out:json][timeout:30];(node[leisure=hackerspace]({BBOX});way[leisure=hackerspace]({BBOX});node[repair=yes]({BBOX});way[repair=yes]({BBOX}););out center;`,
  mural: `[out:json][timeout:30];(node[artwork_type=mural]({BBOX});way[artwork_type=mural]({BBOX}););out center;`,

  // Shopping additions (batch 2)
  clothes: `[out:json][timeout:60];(node[shop=clothes]({BBOX});way[shop=clothes]({BBOX}););out center;`,
  electronics: `[out:json][timeout:30];(node[shop=electronics]({BBOX});way[shop=electronics]({BBOX}););out center;`,
  hardware: `[out:json][timeout:30];(node[shop=hardware]({BBOX});way[shop=hardware]({BBOX});node[shop=doityourself]({BBOX});way[shop=doityourself]({BBOX}););out center;`,
  shoes: `[out:json][timeout:30];(node[shop=shoes]({BBOX});way[shop=shoes]({BBOX}););out center;`,
  jewelry: `[out:json][timeout:30];(node[shop=jewelry]({BBOX});way[shop=jewelry]({BBOX});node[shop=jewellery]({BBOX});way[shop=jewellery]({BBOX}););out center;`,
  furniture: `[out:json][timeout:30];(node[shop=furniture]({BBOX});way[shop=furniture]({BBOX}););out center;`,
  deli: `[out:json][timeout:30];(node[shop=deli]({BBOX});way[shop=deli]({BBOX});node[shop=delicatessen]({BBOX});way[shop=delicatessen]({BBOX}););out center;`,
  butcher: `[out:json][timeout:30];(node[shop=butcher]({BBOX});way[shop=butcher]({BBOX}););out center;`,
  mobile_phone: `[out:json][timeout:30];(node[shop=mobile_phone]({BBOX});way[shop=mobile_phone]({BBOX}););out center;`,
  optician: `[out:json][timeout:30];(node[shop=optician]({BBOX});way[shop=optician]({BBOX}););out center;`,

  // Services additions (batch 2)
  bank: `[out:json][timeout:60];(node[amenity=bank]({BBOX});way[amenity=bank]({BBOX}););out center;`,
  fuel: `[out:json][timeout:30];(node[amenity=fuel]({BBOX});way[amenity=fuel]({BBOX}););out center;`,
  car_rental: `[out:json][timeout:30];(node[amenity=car_rental]({BBOX});way[amenity=car_rental]({BBOX}););out center;`,
  car_wash: `[out:json][timeout:30];(node[amenity=car_wash]({BBOX});way[amenity=car_wash]({BBOX}););out center;`,
  clinic: `[out:json][timeout:30];(node[amenity=clinic]({BBOX});way[amenity=clinic]({BBOX}););out center;`,
  fire_station: `[out:json][timeout:30];(node[amenity=fire_station]({BBOX});way[amenity=fire_station]({BBOX}););out center;`,
  townhall: `[out:json][timeout:30];(node[amenity=townhall]({BBOX});way[amenity=townhall]({BBOX}););out center;`,
  hairdresser: `[out:json][timeout:60];(node[shop=hairdresser]({BBOX});way[shop=hairdresser]({BBOX}););out center;`,
  beauty_salon: `[out:json][timeout:30];(node[shop=beauty]({BBOX});way[shop=beauty]({BBOX}););out center;`,

  // Entertainment additions
  yoga: `[out:json][timeout:30];(node[sport=yoga]({BBOX});way[sport=yoga]({BBOX});node[leisure=yoga]({BBOX}););out center;`,
  dance_studio: `[out:json][timeout:30];(node[leisure=dance]({BBOX});way[leisure=dance]({BBOX});node[amenity=dance_school]({BBOX});way[amenity=dance_school]({BBOX}););out center;`,
  amusement_arcade: `[out:json][timeout:30];(node[leisure=amusement_arcade]({BBOX});way[leisure=amusement_arcade]({BBOX}););out center;`,

  // Education additions
  school: `[out:json][timeout:60];(way[amenity=school]({BBOX});node[amenity=school]({BBOX}););out center;`,
  college: `[out:json][timeout:30];(node[amenity=college]({BBOX});way[amenity=college]({BBOX}););out center;`,
  driving_school: `[out:json][timeout:30];(node[amenity=driving_school]({BBOX});way[amenity=driving_school]({BBOX}););out center;`,
  music_school: `[out:json][timeout:30];(node[amenity=music_school]({BBOX});way[amenity=music_school]({BBOX}););out center;`,

  // Nature additions (batch 2)
  picnic_site: `[out:json][timeout:30];(node[tourism=picnic_site]({BBOX});way[tourism=picnic_site]({BBOX});node[leisure=picnic_table]({BBOX}););out center;`,
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
  { key: 'culture',       label: 'Arts & Culture' },
  { key: 'wellness',      label: 'Wellness' },
  { key: 'education',     label: 'Education' },
  { key: 'quirky',        label: 'Weird & Wonderful' },
]
