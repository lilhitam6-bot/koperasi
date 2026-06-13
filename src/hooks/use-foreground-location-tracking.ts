'use client'

import { useEffect, useRef, useState } from 'react'
import type { LocationTrackingStatus, SurveyorLocation } from '@/types'

export function useForegroundLocationTracking(surveyorId: string) {
  const watchIdRef = useRef<number | null>(null)
  const [status, setStatus] = useState<LocationTrackingStatus>('idle')
  const [location, setLocation] = useState<SurveyorLocation | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  function stopTracking() {
    if (watchIdRef.current !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current)
    }
    watchIdRef.current = null
    setStatus('idle')
  }

  function startTracking() {
    setErrorMessage(null)

    if (!('geolocation' in navigator)) {
      setStatus('unavailable')
      setErrorMessage('GPS tidak tersedia di browser ini.')
      return
    }

    if (watchIdRef.current !== null) return

    setStatus('requesting')
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setStatus('tracking')
        setLocation({
          surveyor_id: surveyorId,
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
          accuracy_meters: position.coords.accuracy ?? null,
          heading: position.coords.heading,
          speed_mps: position.coords.speed,
          captured_at: new Date().toISOString(),
        })
      },
      (error) => {
        watchIdRef.current = null
        if (error.code === error.PERMISSION_DENIED) {
          setStatus('denied')
          setErrorMessage('Izin lokasi ditolak. Aktifkan permission lokasi untuk tracking.')
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
        maximumAge: 10000,
        timeout: 15000,
      }
    )
  }

  useEffect(() => stopTracking, [])

  return {
    errorMessage,
    isTracking: status === 'requesting' || status === 'tracking',
    location,
    startTracking,
    status,
    stopTracking,
  }
}
