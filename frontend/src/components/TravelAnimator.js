import React, { useState, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import { Plus, X, GripVertical, Play, Pause, Plane, Car, Train, Footprints } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default marker
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

// Map Controller component to handle zoom/pan - fits all destinations with margin
const MapController = ({ destinations, defaultCenter }) => {
  const map = useMap();
  
  useEffect(() => {
    if (destinations.length === 0) {
      // Default to USA
      map.flyTo(defaultCenter, 4, { duration: 1 });
    } else if (destinations.length === 1) {
      // Single destination - zoom to it
      map.flyTo([destinations[0].lat, destinations[0].lng], 6, { duration: 1.5 });
    } else {
      // Multiple destinations - fit bounds with padding
      const bounds = L.latLngBounds(
        destinations.map(d => [d.lat, d.lng])
      );
      map.flyToBounds(bounds, {
        padding: [80, 80], // Generous padding for centered look
        duration: 1.5,
        maxZoom: 8
      });
    }
  }, [destinations, map, defaultCenter]);
  
  return null;
};

const TravelAnimator = () => {
  const [showLanding, setShowLanding] = useState(true);
  const [destinations, setDestinations] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [routePath, setRoutePath] = useState([]);
  const [selectedTransport, setSelectedTransport] = useState('flight');
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationProgress, setAnimationProgress] = useState(0);
  const markerRef = useRef(null);
  const mapRef = useRef(null);
  const animationRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  
  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
  
  // Default center (USA)
  const defaultCenter = [39.8283, -98.5795];

  // Transport modes
  const transportModes = [
    { id: 'flight', icon: Plane, label: '✈️' },
    { id: 'car', icon: Car, label: '🚗' },
    { id: 'train', icon: Train, label: '🚂' },
    { id: 'walk', icon: Footprints, label: '🚶' },
  ];

  // Start animation after component mounts
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowLanding(false);
    }, 4700); // gather (0.8s) + flight (3.0s) + scroll (0.8s) + buffer
    return () => clearTimeout(timer);
  }, []);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  const searchDestinations = async (query) => {
    if (!query.trim() || query.length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(
        `${BACKEND_URL}/api/geocode?q=${encodeURIComponent(query)}&limit=5`
      );
      
      const data = await response.json();
      
      if (data && data.length > 0) {
        setSearchResults(data);
        setShowDropdown(true);
      } else {
        setSearchResults([]);
        setShowDropdown(false);
      }
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
      setShowDropdown(false);
    }
    setIsSearching(false);
  };

  const handleSearchInput = (e) => {
    const value = e.target.value;
    setSearchQuery(value);
    
    // Debounce search
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      searchDestinations(value);
    }, 300);
  };

  const selectDestination = (result) => {
    const newDest = {
      id: Date.now(),
      name: result.name,
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
    };
    const updatedDestinations = [...destinations, newDest];
    setDestinations(updatedDestinations);
    setSearchQuery('');
    setSearchResults([]);
    setShowDropdown(false);
    
    // Calculate route path
    if (updatedDestinations.length > 1) {
      calculateRoute(updatedDestinations);
    }
  };

  const addDestination = async () => {
    if (!searchQuery.trim()) {
      return;
    }

    // If there are search results, select the first one
    if (searchResults.length > 0) {
      selectDestination(searchResults[0]);
      return;
    }

    // Otherwise, do a search and add the first result
    setIsSearching(true);
    try {
      const response = await fetch(
        `${BACKEND_URL}/api/geocode?q=${encodeURIComponent(searchQuery)}&limit=1`
      );
      
      const data = await response.json();
      
      if (data && data.length > 0) {
        selectDestination(data[0]);
      }
    } catch (error) {
      console.error('Add destination error:', error);
    }
    setIsSearching(false);
  };

  // Curved path: offset perpendicular to the start->end line (not just latitude)
  const createCurvedPath = (start, end) => {
    const points = [];
    const numPoints = 100;

    const dLat = end.lat - start.lat;
    const dLng = end.lng - start.lng;

    const distance = Math.hypot(dLat, dLng);

    // "capped" gentle arc (tweak maxArc to reduce curve)
    const maxArc = 0.12;                 // <-- adjust (smaller = flatter)
    const arcHeight = Math.min(distance * 0.22, maxArc);

    // Perpendicular unit vector to the segment (dLat, dLng)
    const len = distance || 1;
    let pLat = -dLng / len;
    let pLng =  dLat / len;

    // FIX: flip perpendicular if curve dips downward
    if (pLat < 0) {
      pLat *= -1;
      pLng *= -1;
    }

    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;

      // point on straight line
      const lat0 = start.lat + dLat * t;
      const lng0 = start.lng + dLng * t;

      // smooth arc: 0 at ends, peak at middle
      const arcOffset = Math.sin(Math.PI * t) * arcHeight;

      points.push([lat0 + pLat * arcOffset, lng0 + pLng * arcOffset]);
    }

    return points;
  };

  // Calculate route based on destinations - always curved
  const calculateRoute = (dests) => {
    if (dests.length < 2) return;
    
    let allPoints = [];
    
    for (let i = 0; i < dests.length - 1; i++) {
      const start = dests[i];
      const end = dests[i + 1];
      
      // Always use curved path for visual appeal
      const curvedPath = createCurvedPath(start, end);
      allPoints = [...allPoints, ...curvedPath];
    }
    
    setRoutePath(allPoints);
  };

  const removeDestination = (id) => {
    const updated = destinations.filter(d => d.id !== id);
    setDestinations(updated);
    
    // Stop any ongoing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      setIsAnimating(false);
    }
    
    // Remove animated marker
    if (markerRef.current && mapRef.current) {
      mapRef.current.removeLayer(markerRef.current);
      markerRef.current = null;
    }
    
    if (updated.length > 1) {
      calculateRoute(updated);
    } else {
      setRoutePath([]);
    }
    setAnimationProgress(0);
  };

  // Get transport emoji for animated marker
  const getTransportEmoji = () => {
    const emojis = { flight: '✈️', car: '🚗', train: '🚂', walk: '🚶' };
    return emojis[selectedTransport] || '✈️';
  };

  // Calculate heading between two points
  const calculateHeading = (from, to) => {
    const lat1 = from[0] * Math.PI / 180;
    const lat2 = to[0] * Math.PI / 180;
    const dLng = (to[1] - from[1]) * Math.PI / 180;
    
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    const heading = Math.atan2(y, x) * 180 / Math.PI;
    
    return (heading + 360) % 360;
  };

  // Linear interpolation
  const lerp = (start, end, t) => start + (end - start) * t;

  // Start route animation
  const startAnimation = () => {
    if (routePath.length < 2) {
      return;
    }

    setIsAnimating(true);
    setAnimationProgress(0);
    
    // Remove existing marker
    if (markerRef.current && mapRef.current) {
      mapRef.current.removeLayer(markerRef.current);
    }

    // First, fit all destinations with padding so route is visible and centered
    const bounds = L.latLngBounds(routePath);
    mapRef.current.fitBounds(bounds, {
      padding: [100, 100],
      maxZoom: 6,
      animate: true,
      duration: 0.5
    });

    // Create animated marker
    const customIcon = L.divIcon({
      className: 'animated-transport-marker',
      html: `<div style="
        width: 50px;
        height: 50px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 32px;
        filter: drop-shadow(0 4px 8px rgba(0,0,0,0.3));
      ">${getTransportEmoji()}</div>`,
      iconSize: [50, 50],
      iconAnchor: [25, 25],
    });

    markerRef.current = L.marker(routePath[0], { icon: customIcon }).addTo(mapRef.current);
    
    // Animation loop using lerp - keeps icon centered
    const duration = 8000; // 8 seconds
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      if (progress >= 1) {
        setIsAnimating(false);
        setAnimationProgress(100);
        // Fit bounds again at the end
        mapRef.current.fitBounds(bounds, { padding: [80, 80], maxZoom: 8 });
        return;
      }

      const totalPoints = routePath.length;
      const targetIndex = Math.floor(progress * (totalPoints - 1));
      const nextIndex = Math.min(targetIndex + 1, totalPoints - 1);
      const segmentProgress = (progress * (totalPoints - 1)) - targetIndex;
      
      const currentPoint = routePath[targetIndex];
      const nextPoint = routePath[nextIndex];
      
      if (currentPoint && nextPoint && markerRef.current && mapRef.current) {
        const lat = lerp(currentPoint[0], nextPoint[0], segmentProgress);
        const lng = lerp(currentPoint[1], nextPoint[1], segmentProgress);
        
        // Update marker position directly (no React re-render)
        markerRef.current.setLatLng([lat, lng]);
        
        // Keep the animated icon in the center of the map
        mapRef.current.panTo([lat, lng], { animate: false });
        
        // Update rotation - ✈️ emoji points NORTHEAST (~45°) by default
        const heading = calculateHeading(currentPoint, nextPoint);
        const adjustedRotation = heading - 45;
        const rotatedIcon = L.divIcon({
          className: 'animated-transport-marker',
          html: `<div style="
            width: 50px;
            height: 50px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 32px;
            transform: rotate(${adjustedRotation}deg);
            filter: drop-shadow(0 4px 8px rgba(0,0,0,0.3));
          ">${getTransportEmoji()}</div>`,
          iconSize: [50, 50],
          iconAnchor: [25, 25],
        });
        markerRef.current.setIcon(rotatedIcon);
        
        setAnimationProgress(progress * 100);
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
  };

  // Pause animation
  const pauseAnimation = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      setIsAnimating(false);
    }
  };

  if (showLanding) {
    return <LandingPage />;
  }

  return (
    <div className="h-screen w-screen relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #fff5f7 0%, #fef3c7 50%, #e0f2fe 100%)' }}>
      {/* Map container with warm tint */}
      <div className="absolute inset-0 pastel-map-container" style={{
        filter: 'sepia(0.15) saturate(1.1) hue-rotate(-5deg)',
      }}>
        <MapContainer
          center={defaultCenter}
          zoom={4}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          ref={(map) => { if (map) mapRef.current = map; }}
        >
          {/* OpenStreetMap with nice blue water */}
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          
          <MapController destinations={destinations} defaultCenter={defaultCenter} isAnimating={isAnimating} />
          
          {/* Route line - dotted style with pastel colors */}
          {routePath.length > 1 && (
            <>
              {/* Shadow/glow effect */}
              <Polyline
                positions={routePath}
                pathOptions={{
                  color: '#ffffff',
                  weight: 8,
                  opacity: 0.9,
                  lineCap: 'round',
                }}
              />
              {/* Main dotted line */}
              <Polyline
                positions={routePath}
                pathOptions={{
                  color: '#e11d48',
                  weight: 3,
                  opacity: 1,
                  dashArray: '8, 12',
                  lineCap: 'round',
                }}
              />
            </>
          )}
          
          {/* Destination markers - pastel pink pins */}
          {destinations.map((dest, index) => (
            <Marker
              key={dest.id}
              position={[dest.lat, dest.lng]}
              icon={L.divIcon({
                className: 'custom-marker',
                html: `<div style="
                  width: 28px;
                  height: 28px;
                  border-radius: 50%;
                  background: linear-gradient(135deg, #ec4899, #f97316);
                  border: 4px solid white;
                  box-shadow: 0 3px 10px rgba(0,0,0,0.3);
                "></div>`,
                iconSize: [28, 28],
                iconAnchor: [14, 14],
              })}
            />
          ))}
        </MapContainer>
      </div>
      
      {/* Warm pink overlay for land */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{ 
          background: 'linear-gradient(135deg, rgba(255,182,193,0.12) 0%, rgba(255,218,185,0.1) 50%, rgba(255,228,225,0.12) 100%)',
        }}
      />

      {/* Floating search box with dropdown */}
      <div className="absolute top-4 left-4 right-4 md:left-1/2 md:right-auto md:transform md:-translate-x-1/2 z-[1000]">
        <div className="relative">
          <div className="bg-white/95 backdrop-blur-md rounded-full shadow-xl px-3 md:px-4 py-2 md:py-3 flex items-center gap-2 border border-pink-100">
            <input
              type="text"
              placeholder="Search destination..."
              value={searchQuery}
              onChange={handleSearchInput}
              onKeyPress={(e) => e.key === 'Enter' && addDestination()}
              onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
              className="bg-transparent outline-none text-sm flex-1 min-w-0 placeholder-gray-400"
              style={{ fontSize: '16px' }}
            />
            {isSearching ? (
              <div className="w-8 h-8 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : (
              <button
                onClick={addDestination}
                disabled={isSearching}
                className="bg-gradient-to-r from-pink-500 to-orange-400 text-white rounded-full w-8 h-8 flex-shrink-0 flex items-center justify-center hover:scale-110 transition-transform"
              >
                <Plus className="w-5 h-5" />
              </button>
            )}
          </div>
          
          {/* Search results dropdown */}
          {showDropdown && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-pink-100 overflow-hidden">
              {searchResults.map((result, index) => (
                <button
                  key={index}
                  onClick={() => selectDestination(result)}
                  className="w-full px-4 py-3 text-left hover:bg-pink-50 transition-colors border-b border-pink-50 last:border-b-0"
                >
                  <div className="font-medium text-gray-800">{result.name}</div>
                  <div className="text-xs text-gray-500 truncate">{result.display_name}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Transport selector */}
      <div className="absolute top-16 md:top-6 right-4 z-[1000]">
        <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xl p-1.5 md:p-2 flex gap-0.5 md:gap-1 border border-pink-100">
          {transportModes.map((mode) => (
            <button
              key={mode.id}
              onClick={() => {
                setSelectedTransport(mode.id);
                if (destinations.length > 1) calculateRoute(destinations);
              }}
              className={`w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center text-base md:text-lg transition-all ${
                selectedTransport === mode.id 
                  ? 'bg-gradient-to-r from-pink-500 to-orange-400 scale-110' 
                  : 'hover:bg-pink-50'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* Play/Pause button */}
      {destinations.length >= 2 && (
        <div className="absolute top-28 md:top-20 right-4 z-[1000]">
          <button
            onClick={isAnimating ? pauseAnimation : startAnimation}
            className={`w-12 h-12 md:w-14 md:h-14 rounded-full shadow-xl flex items-center justify-center transition-all hover:scale-110 ${
              isAnimating 
                ? 'bg-red-500 text-white' 
                : 'bg-gradient-to-r from-pink-500 to-orange-400 text-white'
            }`}
          >
            {isAnimating ? <Pause className="w-5 h-5 md:w-6 md:h-6" /> : <Play className="w-5 h-5 md:w-6 md:h-6 ml-0.5" />}
          </button>
        </div>
      )}

      {/* Progress bar */}
      {animationProgress > 0 && (
        <div className="absolute top-44 md:top-36 right-4 z-[1000] w-12 md:w-14">
          <div className="bg-white/90 rounded-full h-2 overflow-hidden shadow">
            <div 
              className="h-full bg-gradient-to-r from-pink-500 to-orange-400 transition-all"
              style={{ width: `${animationProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Floating destination list */}
      {destinations.length > 0 && (
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-[1000] max-w-md w-full px-4">
          <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xl p-4 border border-pink-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-700">Your Journey</h3>
              <span className="text-xs text-gray-500">{destinations.length} stops</span>
            </div>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {destinations.map((dest, index) => (
                <div
                  key={dest.id}
                  className="flex items-center gap-2 p-2 bg-white rounded-xl hover:bg-pink-50 transition-colors"
                >
                  <GripVertical className="w-4 h-4 text-gray-400 cursor-grab" />
                  <div className="w-6 h-6 rounded-full bg-gradient-to-r from-pink-500 to-orange-400 text-white flex items-center justify-center text-xs font-bold">
                    {index + 1}
                  </div>
                  <span className="flex-1 text-sm text-gray-700 truncate">{dest.name}</span>
                  <button
                    onClick={() => removeDestination(dest.id)}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const LandingPage = () => {
  const planeRef = useRef(null);
  const containerRef = useRef(null);
  const iconsContainerRef = useRef(null);
  
  useEffect(() => {
    const plane = planeRef.current;
    const iconsContainer = iconsContainerRef.current;
    if (!plane || !iconsContainer) return;
    
    const orbitIcons = iconsContainer.querySelectorAll('.icon-orbit:not(.plane-icon)');
    
    const gatherDuration = 800;
    const flightDuration = 3000; // Slightly longer for the orbit effect
    
    // 11 icons total, evenly spaced at 32.727° apart
    const totalIcons = 11;
    const angleStep = 360 / totalIcons;
    
    // 3D orbit path around the entire content (like Universal Studios logo)
    // The plane orbits in an ellipse that goes behind and in front of the content
    const orbitCenterX = 50;  // Center of screen
    const orbitCenterY = 50;
    const orbitRadiusX = 45;  // Horizontal radius (wider, further from icons)
    const orbitRadiusY = 18;  // Vertical radius (flatter ellipse for 3D effect)
    const startAngle = 180;   // Start from left (behind)
    const endAngle = 540;     // Full orbit + half (1.5 rotations for dramatic effect)
    
    const easeInOutCubic = (t) => {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    };
    
    let animationId;
    let startTime = null;
    let hasStartedFlight = false;
    let hasJoinedOrbit = false;
    
    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      
      // Wait for gather animation to complete
      if (elapsed < gatherDuration) {
        animationId = requestAnimationFrame(animate);
        return;
      }
      
      // Start flight
      if (!hasStartedFlight) {
        hasStartedFlight = true;
        
        // Redistribute other icons
        const spreadAngleStep = 360 / 10;
        orbitIcons.forEach((icon, index) => {
          const newAngle = index * spreadAngleStep;
          icon.style.transition = 'transform 0.5s ease-out';
          icon.style.setProperty('--angle', `${newAngle}deg`);
        });
        
        // Start flying
        plane.style.animation = 'none';
        plane.classList.add('flying');
        plane.style.opacity = '1';
      }
      
      // Flight animation - 3D orbit around content
      const flightElapsed = elapsed - gatherDuration;
      const progress = Math.min(flightElapsed / flightDuration, 1);
      
      if (progress < 1) {
        const easedProgress = easeInOutCubic(progress);
        
        // Calculate position on elliptical orbit
        const currentAngle = startAngle + (endAngle - startAngle) * easedProgress;
        const angleRad = (currentAngle * Math.PI) / 180;
        
        const x = orbitCenterX + orbitRadiusX * Math.cos(angleRad);
        const y = orbitCenterY + orbitRadiusY * Math.sin(angleRad);
        
        // 3D effect: scale and z-index based on position in orbit
        // When sin(angle) > 0, plane is "in front" (larger, higher z-index)
        // When sin(angle) < 0, plane is "behind" (smaller, lower z-index)
        const depthFactor = Math.sin(angleRad);
        const baseScale = 1.0;
        const scaleVariation = 0.5;
        const scale = baseScale + scaleVariation * depthFactor;
        
        // Opacity: dimmer when behind
        const opacity = depthFactor > 0 ? 1 : 0.5;
        
        // Z-index: behind content when in back half of orbit
        const zIndex = depthFactor > 0 ? 100 : 1;
        
        // Simple rotation: plane nose follows the orbit path (no sideways tilt)
        const nextAngle = currentAngle + 5;
        const nextAngleRad = (nextAngle * Math.PI) / 180;
        const nextX = orbitCenterX + orbitRadiusX * Math.cos(nextAngleRad);
        const nextY = orbitCenterY + orbitRadiusY * Math.sin(nextAngleRad);
        const dx = nextX - x;
        const dy = nextY - y;
        const pathRotation = Math.atan2(dy, dx) * (180 / Math.PI) + 45;
        
        plane.style.left = `${x}%`;
        plane.style.top = `${y}%`;
        plane.style.transform = `translate(-50%, -50%) rotate(${pathRotation}deg) scale(${scale})`;
        plane.style.opacity = String(opacity);
        plane.style.zIndex = String(zIndex);
        
        animationId = requestAnimationFrame(animate);
      } else if (!hasJoinedOrbit) {
        hasJoinedOrbit = true;
        
        // Redistribute all 11 icons
        orbitIcons.forEach((icon, index) => {
          const newAngle = (index + 1) * angleStep;
          icon.style.transition = 'transform 0.3s ease-out';
          icon.style.setProperty('--angle', `${newAngle}deg`);
        });
        
        // Plane joins orbit at position 0 (0°, right side)
        plane.classList.remove('flying');
        plane.classList.add('in-orbit');
        plane.style.left = '50%';
        plane.style.top = '50%';
        plane.style.zIndex = '15';
        plane.style.setProperty('--angle', '0deg');
        plane.style.transform = 'rotate(0deg) translateX(min(40vmin, 200px)) rotate(0deg) scale(1)';
        
        // Scroll up
        setTimeout(() => {
          const container = document.querySelector('.landing-content');
          if (container) {
            container.classList.add('scroll-up-now');
          }
        }, 100);
      }
    };
    
    animationId = requestAnimationFrame(animate);
    
    return () => {
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, []);

  // 10 regular icons + 1 plane = 11 total, evenly spaced
  const circleIcons = ['🚗', '🚶', '🧳', '🎫', '🗺️', '🚂', '🎒', '🏖️', '🏔️', '🚢'];
  const totalIcons = 11;
  const angleStep = 360 / totalIcons; // ~32.727°

  return (
    <div className="h-screen w-screen relative overflow-hidden flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #fff5f7 0%, #fef3c7 50%, #e0f2fe 100%)' }}>
      <div ref={containerRef} className="landing-content">
        <div className="bounding-box">
          <div className="circular-container" ref={iconsContainerRef}>
            {/* 10 icons at positions 1-10, plane at position 0 */}
            {circleIcons.map((icon, index) => {
              const iconAngle = (index + 1) * angleStep;
              return (
                <div 
                  key={index}
                  className="icon-orbit"
                  style={{ 
                    '--angle': `${iconAngle}deg`,
                    '--delay': `${index * 0.06}s`
                  }}
                >
                  {icon}
                </div>
              );
            })}
            
            {/* Plane at position 0 (0°, right side) */}
            <div 
              ref={planeRef}
              className="icon-orbit plane-icon"
              style={{ '--angle': '0deg', '--delay': '0s' }}
            >
              ✈️
            </div>
          </div>
        </div>
        
        <div className="title-overlay">
          <h1 className="title-text">Travel Animator</h1>
          <p className="subtitle-text">Plan your journey</p>
        </div>
      </div>

      <style jsx>{`
        .landing-content {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .landing-content.scroll-up-now {
          animation: scrollUp 0.8s ease-in-out forwards;
        }
        
        .bounding-box {
          position: relative;
          width: 85vmin;
          height: 85vmin;
          max-width: 500px;
          max-height: 500px;
          min-width: 300px;
          min-height: 300px;
        }
        
        .title-overlay {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          text-align: center;
          z-index: 5;
          pointer-events: none;
          width: 60%;
          max-width: 200px;
        }
        
        .title-text {
          font-size: clamp(1.3rem, 4.5vw, 2.2rem);
          font-weight: 700;
          background: linear-gradient(135deg, #ec4899 0%, #f97316 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          line-height: 1.2;
        }
        
        .subtitle-text {
          font-size: clamp(0.65rem, 1.8vw, 0.85rem);
          color: #6b7280;
          margin-top: 0.3rem;
        }

        .circular-container {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 100%;
          height: 100%;
        }

        .icon-orbit {
          position: absolute;
          top: 50%;
          left: 50%;
          font-size: clamp(1.4rem, 3.5vw, 2.2rem);
          transform-origin: center;
          animation: 
            gatherIn 0.8s ease-out var(--delay) forwards,
            orbit 12s linear 0.8s infinite;
          opacity: 0;
        }
        
        .plane-icon {
          z-index: 15;
          filter: drop-shadow(0 4px 8px rgba(0,0,0,0.2));
        }
        
        .plane-icon.flying {
          animation: none !important;
          position: fixed !important;
          z-index: 100;
          filter: drop-shadow(0 8px 16px rgba(0,0,0,0.3));
        }
        
        .plane-icon.in-orbit {
          position: absolute !important;
          animation: orbit 12s linear infinite !important;
          z-index: 15;
        }

        @keyframes gatherIn {
          0% {
            opacity: 0;
            transform: 
              rotate(var(--angle)) 
              translateX(calc(min(40vmin, 200px) + 120px)) 
              rotate(calc(-1 * var(--angle)))
              scale(0.3);
          }
          100% {
            opacity: 1;
            transform: 
              rotate(var(--angle)) 
              translateX(min(40vmin, 200px)) 
              rotate(calc(-1 * var(--angle)))
              scale(1);
          }
        }

        @keyframes orbit {
          0% {
            transform: 
              rotate(var(--angle)) 
              translateX(min(40vmin, 200px)) 
              rotate(calc(-1 * var(--angle)));
          }
          100% {
            transform: 
              rotate(calc(var(--angle) + 360deg)) 
              translateX(min(40vmin, 200px)) 
              rotate(calc(-1 * (var(--angle) + 360deg)));
          }
        }

        @keyframes scrollUp {
          0% {
            transform: translateY(0);
            opacity: 1;
          }
          100% {
            transform: translateY(-100vh);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};

export default TravelAnimator;
