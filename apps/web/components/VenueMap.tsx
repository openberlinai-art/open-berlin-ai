'use client'
import Map, { Marker, NavigationControl } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'

interface Props {
  lat: number
  lng: number
  name: string
}

export default function VenueMap({ lat, lng, name }: Props) {
  return (
    <div className="w-full h-[180px] border-2 border-black overflow-hidden">
      <Map
        initialViewState={{ longitude: lng, latitude: lat, zoom: 15 }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={MAP_STYLE}
        interactive={true}
      >
        <NavigationControl position="top-right" />
        <Marker longitude={lng} latitude={lat} anchor="bottom">
          <div className="w-3 h-3 bg-black border-2 border-white shadow" title={name} />
        </Marker>
      </Map>
    </div>
  )
}
