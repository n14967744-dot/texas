'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { clearProjectCache } from '@/lib/project-cache';
import { parseHereLocation, type HereLocation } from '@/lib/here-location';

const SESSION_KEY = 'ctwp-here:v1';

export function useMyLocation() {
  const [here, setHere] = useState<HereLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setMessage] = useState('');
  // Ignore callbacks after cancellation, another request, or unmount.
  const generation = useRef(0);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) {
        const value = JSON.parse(saved) as HereLocation;
        setHere(parseHereLocation(new URLSearchParams({ lat: String(value.lat), lng: String(value.lng) })));
      }
    } catch {
      try { sessionStorage.removeItem(SESSION_KEY); } catch { /* Storage may be blocked. */ }
    }
    return () => { generation.current += 1; };
  }, []);

  const turnOffLocation = useCallback(() => {
    generation.current += 1;
    setHere(null);
    setLocating(false);
    setMessage('');
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* Storage may be blocked. */ }
    // Cached GPS queries also contain coordinates: remove them when turning location off.
    clearProjectCache();
  }, []);

  function enableLocation() {
    if (!navigator.geolocation) {
      setMessage('Location is unavailable in this browser.');
      return;
    }
    const request = ++generation.current;
    setLocating(true);
    setMessage('');
    try {
      navigator.geolocation.getCurrentPosition((position) => {
        if (request !== generation.current) return;
        setLocating(false);
        try {
          const next = parseHereLocation(new URLSearchParams({ lat: String(position.coords.latitude), lng: String(position.coords.longitude) }))!;
          setHere(next);
          try {
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
          } catch {
            setMessage('Location is on for this page; session storage is unavailable.');
          }
        } catch {
          setMessage('Your location is outside the supported Texas area.');
        }
      }, (error) => {
        if (request !== generation.current) return;
        setLocating(false);
        setMessage(error.code === 1
          ? 'Location permission was denied. Allow location in your browser settings to try again.'
          : error.code === 3
            ? 'Location timed out. Please try again.'
            : 'Your location is unavailable. Please try again.');
      }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
    } catch {
      setLocating(false);
      setMessage('Your location is unavailable. Please try again.');
    }
  }

  return { here, locating, locationMessage, enableLocation, turnOffLocation };
}
