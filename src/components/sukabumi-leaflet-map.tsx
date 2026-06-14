'use client'

import L from 'leaflet'
import { useEffect, useMemo, useRef } from 'react'
import { AREA_STATUS_COLORS, markerBounds, markerPopupLabel, SUKABUMI_MAP } from '@/lib/map'
import type { AreaMarker, SurveyorLocation } from '@/types'

export function SukabumiLeafletMap({
  focusLocationRequest = 0,
  markers,
  surveyorLocation,
}: {
  focusLocationRequest?: number
  markers: AreaMarker[]
  surveyorLocation?: SurveyorLocation | null
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const bounds = useMemo(() => markerBounds(markers), [markers])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center: SUKABUMI_MAP.center,
      zoom: SUKABUMI_MAP.zoom,
      zoomControl: true,
      scrollWheelZoom: true,
      fadeAnimation: false,
      markerZoomAnimation: false,
      zoomAnimation: false,
    })

    L.tileLayer(SUKABUMI_MAP.tileUrl, {
      attribution: SUKABUMI_MAP.attribution,
      maxZoom: 19,
    }).addTo(map)

    const layer = L.layerGroup().addTo(map)
    mapRef.current = map
    layerRef.current = layer

    return () => {
      layer.clearLayers()
      map.off()
      map.remove()
      mapRef.current = null
      layerRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return

    layer.clearLayers()
    markers.forEach((marker) => {
      L.circleMarker([marker.latitude, marker.longitude], {
        radius: 10,
        color: '#fffaf0',
        weight: 3,
        fillColor: AREA_STATUS_COLORS[marker.status],
        fillOpacity: 0.95,
      })
        .bindPopup(`<strong>${markerPopupLabel(marker)}</strong><br/>${marker.latitude.toFixed(5)}, ${marker.longitude.toFixed(5)}`)
        .addTo(layer)
    })

    if (surveyorLocation) {
      L.circleMarker([surveyorLocation.latitude, surveyorLocation.longitude], {
        radius: 12,
        color: '#fffaf0',
        weight: 4,
        fillColor: '#276d86',
        fillOpacity: 1,
      })
        .bindPopup(
          `<strong>Posisi surveyor live</strong><br/>Akurasi: ${surveyorLocation.accuracy_meters?.toFixed(0) ?? '-'} m<br/>${surveyorLocation.latitude.toFixed(5)}, ${surveyorLocation.longitude.toFixed(5)}`
        )
        .addTo(layer)

      L.circle([surveyorLocation.latitude, surveyorLocation.longitude], {
        radius: surveyorLocation.accuracy_meters ?? 30,
        color: '#276d86',
        weight: 1,
        fillColor: '#276d86',
        fillOpacity: 0.12,
      }).addTo(layer)
    }

    if (surveyorLocation) {
      map.setView([surveyorLocation.latitude, surveyorLocation.longitude], 16)
    } else if (bounds) {
      map.fitBounds(bounds, { padding: [44, 44], maxZoom: 15 })
    } else {
      map.setView(SUKABUMI_MAP.center, SUKABUMI_MAP.zoom)
    }
  }, [bounds, focusLocationRequest, markers, surveyorLocation])

  return (
    <div className="relative h-[58vh] min-h-[360px] overflow-hidden rounded-lg border border-ink/10 bg-field sm:h-[520px]">
      <div ref={containerRef} className="h-full w-full" aria-label="Peta OpenStreetMap area Sukabumi" />
      <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded-lg bg-white/95 px-3 py-2 text-xs font-black shadow-line sm:left-4 sm:top-4 sm:text-sm">
        Sukabumi · OpenStreetMap
      </div>
    </div>
  )
}
