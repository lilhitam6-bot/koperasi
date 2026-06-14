'use client'

import { useState } from 'react'
import { locationAccuracyHint } from '@/lib/location'
import type { LocationTrackingStatus, SurveyorLocation } from '@/types'

export function useForegroundLocationTracking(surveyorId: string) {
  const [status, setStatus] = useState<LocationTrackingStatus>('idle')
  const [location, setLocation] = useState<SurveyorLocation | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  function readCurrentLocation() {
    setErrorMessage(null)

    if (!('geolocation' in navigator)) {
      setStatus('unavailable')
      setErrorMessage('GPS tidak tersedia di browser ini.')
      return
    }

    setStatus('requesting')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation: SurveyorLocation = {
          surveyor_id: surveyorId,
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
          accuracy_meters: position.coords.accuracy ?? null,
          heading: position.coords.heading,
          speed_mps: position.coords.speed,
          captured_at: new Date().toISOString(),
        }

        setLocation(nextLocation)
        setStatus('tracking')
        setErrorMessage(locationAccuracyHint(nextLocation))
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setStatus('denied')
          setErrorMessage('Izin lokasi ditolak. Aktifkan permission lokasi untuk mengambil titik.')
          return
        }
        if (error.code === error.POSITION_UNAVAILABLE) {
          setStatus('unavailable')
          setErrorMessage('Lokasi tidak tersedia dari device.')
          return
        }
        setStatus('error')
        setErrorMessage(error.message || 'Gagal membaca lokasi.')
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 12000,
      }
    )
  }

  return {
    errorMessage,
    isTracking: status === 'requesting',
    location,
    refreshLocation: readCurrentLocation,
    startTracking: readCurrentLocation,
    status,
    stopTracking: () => setStatus('idle'),
  }
}
