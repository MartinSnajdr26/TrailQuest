import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { supabase } from '../lib/supabase.js'
import ActivitySwitcher from '../components/ActivitySwitcher.jsx'
import RouteDetail from '../components/RouteDetail.jsx'

const API_KEY = import.meta.env.VITE_MAPYCZ_API_KEY

function getMapset(activity) {
  if (activity === 'skitouring') return 'winter'
  return 'outdoor'
}

function getRouteCoords(route) {
  if (route.start_lng != null && route.start_lat != null) {
    return [Number(route.start_lng), Number(route.start_lat)]
  }
  try {
    const geo = typeof route.gpx_data === 'string' ? JSON.parse(route.gpx_data) : route.gpx_data
    if (!geo) return null
    const coords = geo.coordinates ?? geo.geometry?.coordinates
    if (Array.isArray(coords) && coords.length > 0) {
      const first = coords[0]
      if (Array.isArray(first) && first.length >= 2) return [Number(first[0]), Number(first[1])]
      if (typeof first === 'number') return [Number(first), Number(coords[1])]
    }
  } catch { /* ignore */ }
  return null
}

export default function MapScreen({ onStartRoute }) {
  const mapContainer = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const geolocateRef = useRef(null)
  const [activity, setActivity] = useState('hiking')
  const [routes, setRoutes] = useState([])
  const [selectedRoute, setSelectedRoute] = useState(null)
  const [mapReady, setMapReady] = useState(false)

  // Init map
  useEffect(() => {
    if (mapRef.current) return
    const mapset = getMapset(activity)
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          mapy: {
            type: 'raster',
            url: `https://api.mapy.cz/v1/maptiles/${mapset}/tiles.json?apikey=${API_KEY}`,
            tileSize: 256,
            attribution: '© Mapy.cz',
          },
        },
        layers: [{ id: 'mapy-layer', type: 'raster', source: 'mapy' }],
      },
      center: [15.4, 49.8],
      zoom: 7,
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    const geoCtrl = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showAccuracyCircle: false,
    })
    map.addControl(geoCtrl, 'bottom-right')
    geolocateRef.current = geoCtrl

    map.on('load', () => setMapReady(true))
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Switch mapset when activity changes
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const mapset = getMapset(activity)
    const source = map.getSource('mapy')
    if (source) {
      source.setUrl(`https://api.mapy.cz/v1/maptiles/${mapset}/tiles.json?apikey=${API_KEY}`)
    }
  }, [activity, mapReady])

  // Load routes when activity changes
  useEffect(() => {
    async function loadRoutes() {
      const { data, error } = await supabase
        .from('routes')
        .select('id, name, description, distance_km, difficulty, activity_type, gpx_data, start_lat, start_lng, elevation_gain_m, region, rating_avg, is_loop')
        .eq('activity_type', activity)
        .limit(100)

      if (error) {
        console.error('Routes load error:', error)
        return
      }
      setRoutes(data ?? [])
    }
    loadRoutes()
  }, [activity])

  // Place markers
  const placeMarkers = useCallback(() => {
    if (!mapRef.current || !mapReady) return

    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    routes.forEach(route => {
      const coords = getRouteCoords(route)
      if (!coords) return

      const el = document.createElement('div')
      el.className = 'map-marker'
      el.innerHTML = `<div class="map-marker-inner"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg></div>`

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat(coords)
        .addTo(mapRef.current)

      el.addEventListener('click', () => setSelectedRoute(route))
      markersRef.current.push(marker)
    })
  }, [routes, mapReady])

  useEffect(() => {
    placeMarkers()
  }, [placeMarkers])

  return (
    <div className="map-screen">
      <ActivitySwitcher active={activity} onChange={setActivity} />
      <div ref={mapContainer} className="map-container" />
      {selectedRoute && (
        <RouteDetail
          route={selectedRoute}
          onClose={() => setSelectedRoute(null)}
          onStart={() => {
            const r = selectedRoute
            setSelectedRoute(null)
            onStartRoute?.(r)
          }}
        />
      )}
    </div>
  )
}
