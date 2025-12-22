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
  const [isSearching, setIsSearching] = useState(false);
  const [routePath, setRoutePath] = useState([]);
  const [selectedTransport, setSelectedTransport] = useState('flight');
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationProgress, setAnimationProgress] = useState(0);
  const markerRef = useRef(null);
  const mapRef = useRef(null);
  const animationRef = useRef(null);
  
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
    }, 4500); // gather (0.8s) + flight (2.6s) + brief orbit (0.3s) + scroll (0.8s)
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

  const addDestination = async () => {
    if (!searchQuery.trim()) {
      toast.error('Enter a city name');
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`,
        { headers: { 'User-Agent': 'TravelAnimator/1.0' } }
      );
      
      const data = await response.json();
      
      if (data && data.length > 0) {
        const newDest = {
          id: Date.now(),
          name: data[0].display_name.split(',')[0],
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
        };
        const updatedDestinations = [...destinations, newDest];
        setDestinations(updatedDestinations);
        setSearchQuery('');
        // Removed toast notification - it was hiding the input box
        
        // Calculate route path
        if (updatedDestinations.length > 1) {
          calculateRoute(updatedDestinations);
        }
      }
    } catch (error) {
      // Silent fail - no toast
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
      {/* Map */}
      <MapContainer
        center={defaultCenter}
        zoom={4}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        ref={(map) => { if (map) mapRef.current = map; }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        />
        
        <MapController destinations={destinations} defaultCenter={defaultCenter} />
        
        {/* Route line - dotted style like reference image */}
        {routePath.length > 1 && (
          <>
            {/* Shadow/glow effect */}
            <Polyline
              positions={routePath}
              pathOptions={{
                color: '#94a3b8',
                weight: 5,
                opacity: 0.4,
                lineCap: 'round',
              }}
            />
            {/* Main dotted line */}
            <Polyline
              positions={routePath}
              pathOptions={{
                color: '#475569',
                weight: 2.5,
                opacity: 0.9,
                dashArray: '6, 10',
                lineCap: 'round',
              }}
            />
          </>
        )}
        
        {/* Destination markers - red pins like reference */}
        {destinations.map((dest, index) => (
          <Marker
            key={dest.id}
            position={[dest.lat, dest.lng]}
            icon={L.divIcon({
              className: 'custom-marker',
              html: `<div style="
                width: 24px;
                height: 24px;
                border-radius: 50%;
                background: #ef4444;
                border: 3px solid white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
              "></div>`,
              iconSize: [24, 24],
              iconAnchor: [12, 12],
            })}
          />
        ))}
      </MapContainer>

      {/* Floating search box */}
      <div className="absolute top-4 left-4 right-4 md:left-1/2 md:right-auto md:transform md:-translate-x-1/2 z-[1000]">
        <div className="bg-white/95 backdrop-blur-md rounded-full shadow-xl px-3 md:px-4 py-2 md:py-3 flex items-center gap-2 border border-pink-100">
          <input
            type="text"
            placeholder="Search destination..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addDestination()}
            className="bg-transparent outline-none text-sm flex-1 min-w-0 placeholder-gray-400"
            style={{ fontSize: '16px' }}
          />
          <button
            onClick={addDestination}
            disabled={isSearching}
            className="bg-gradient-to-r from-pink-500 to-orange-400 text-white rounded-full w-8 h-8 flex-shrink-0 flex items-center justify-center hover:scale-110 transition-transform"
          >
            <Plus className="w-5 h-5" />
          </button>
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
    const flightDuration = 2600;
    
    // 11 icons total, evenly spaced at 32.727° apart
    const totalIcons = 11;
    const angleStep = 360 / totalIcons;
    
    // Get the actual position of plane in orbit for seamless transition
    // Orbit radius is min(40vmin, 200px), centered on screen
    // At 180° (left): x = center - radius, y = center
    // At 0° (right): x = center + radius, y = center
    // As viewport percentages: radius ≈ 10-12% of viewport width
    const getOrbitPosition = (angleDeg) => {
      const angleRad = (angleDeg * Math.PI) / 180;
      // Orbit appears roughly ±12% from center (50%) on a typical viewport
      const radiusPercent = 12;
      return {
        x: 50 + radiusPercent * Math.cos(angleRad),
        y: 50 + radiusPercent * Math.sin(angleRad)
      };
    };
    
    // Bezier curve starts from plane's actual orbit position (180°) to end position (0°)
    const startPos = getOrbitPosition(180); // Left side of orbit
    const endPos = getOrbitPosition(0);     // Right side of orbit
    
    const bezierStart = { x: startPos.x, y: startPos.y };
    const bezierControl = { x: 50, y: 25 }; // Arc above center
    const bezierEnd = { x: endPos.x, y: endPos.y };
    
    const quadraticBezier = (t, p0, p1, p2) => {
      const oneMinusT = 1 - t;
      return oneMinusT * oneMinusT * p0 + 2 * oneMinusT * t * p1 + t * t * p2;
    };
    
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
      
      // Start flight immediately after gather (no pause)
      if (!hasStartedFlight) {
        hasStartedFlight = true;
        
        // Smoothly redistribute other icons while plane leaves
        const spreadAngleStep = 360 / 10;
        orbitIcons.forEach((icon, index) => {
          const newAngle = index * spreadAngleStep;
          icon.style.transition = 'transform 0.8s ease-out';
          icon.style.setProperty('--angle', `${newAngle}deg`);
        });
        
        // Plane starts flying - position it at its current orbit location
        plane.style.animation = 'none';
        plane.classList.add('flying');
        plane.style.left = `${bezierStart.x}%`;
        plane.style.top = `${bezierStart.y}%`;
        plane.style.transform = `translate(-50%, -50%) rotate(45deg) scale(1)`;
      }
      
      // Flight animation
      const flightElapsed = elapsed - gatherDuration;
      const progress = Math.min(flightElapsed / flightDuration, 1);
      
      if (progress < 1) {
        const easedProgress = easeInOutCubic(progress);
        
        const x = quadraticBezier(easedProgress, bezierStart.x, bezierControl.x, bezierEnd.x);
        const y = quadraticBezier(easedProgress, bezierStart.y, bezierControl.y, bezierEnd.y);
        
        // Calculate rotation to point along curve
        const lookAhead = Math.min(easedProgress + 0.05, 1);
        const nextX = quadraticBezier(lookAhead, bezierStart.x, bezierControl.x, bezierEnd.x);
        const nextY = quadraticBezier(lookAhead, bezierStart.y, bezierControl.y, bezierEnd.y);
        const dx = nextX - x;
        const dy = nextY - y;
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        const adjustedRotation = angle + 45; // +45 because plane emoji points NE
        
        // Scale: grow to 1.6x at middle, back to 1x at end
        const scale = 1 + 0.6 * Math.sin(easedProgress * Math.PI);
        
        plane.style.left = `${x}%`;
        plane.style.top = `${y}%`;
        plane.style.transform = `translate(-50%, -50%) rotate(${adjustedRotation}deg) scale(${scale})`;
        
        animationId = requestAnimationFrame(animate);
      } else if (!hasJoinedOrbit) {
        hasJoinedOrbit = true;
        
        // Plane joins orbit at 0° (right side) - redistribute all 11 icons
        orbitIcons.forEach((icon, index) => {
          const newAngle = (index + 1) * angleStep;
          icon.style.transition = 'transform 0.5s ease-out';
          icon.style.setProperty('--angle', `${newAngle}deg`);
        });
        
        // Plane smoothly joins orbit at 0°
        plane.classList.remove('flying');
        plane.classList.add('in-orbit');
        plane.style.transition = 'none';
        plane.style.left = '50%';
        plane.style.top = '50%';
        plane.style.setProperty('--angle', '0deg');
        plane.style.transform = 'rotate(0deg) translateX(min(40vmin, 200px)) rotate(0deg) scale(1)';
        
        // Start scroll up after a brief moment of orbiting together
        setTimeout(() => {
          const container = document.querySelector('.landing-content');
          if (container) {
            container.classList.add('scroll-up-now');
          }
        }, 300);
      }
    };
    
    // Play sound when flight starts
    setTimeout(() => {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSl+zPLTgjMGHGS56+CZSwkPVanm7qxfHAU7ldj');
      audio.volume = 0.3;
      audio.play().catch(() => {});
    }, gatherDuration + orbitPause);
    
    animationId = requestAnimationFrame(animate);
    
    return () => {
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, []);

  // 10 regular icons + 1 plane = 11 total
  // Plane is fixed at 180° (true left), other 10 icons distribute evenly around it
  const circleIcons = ['🚗', '🚶', '🧳', '🎫', '🗺️', '🚂', '🎒', '🏖️', '🏔️', '🚢'];
  const totalIcons = 11;
  const angleStep = 360 / totalIcons; // ~32.727°
  const planeAngle = 180; // Plane at true left (180°)

  return (
    <div className="h-screen w-screen relative overflow-hidden flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #fff5f7 0%, #fef3c7 50%, #e0f2fe 100%)' }}>
      <div ref={containerRef} className="landing-content">
        <div className="bounding-box">
          <div className="circular-container" ref={iconsContainerRef}>
            {/* 10 icons evenly distributed, with plane at position index that equals ~180° */}
            {circleIcons.map((icon, index) => {
              // All 11 icons evenly spaced at 32.727° apart
              // Plane occupies index position that falls near 180°
              // Index 5 would be at 5 * 32.727 = 163.6° (too early)
              // Index 6 would be at 6 * 32.727 = 196.4° (just after 180°)
              // To have plane exactly at 180°, we offset all icons so plane sits at 180°
              // Plane at 180° means we calculate from there
              // Offset: if plane is at 180°, icon at index 0 should be at 180 + angleStep = 212.7°
              // Or: icon angles = 180 + (index + 1) * angleStep, wrapped
              const baseAngle = planeAngle + (index + 1) * angleStep;
              const iconAngle = baseAngle % 360;
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
            
            {/* Plane at 180° (true left side) */}
            <div 
              ref={planeRef}
              className="icon-orbit plane-icon"
              style={{ '--angle': `${planeAngle}deg`, '--delay': '0.3s' }}
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
          z-index: 25;
          filter: drop-shadow(0 8px 16px rgba(0,0,0,0.3));
        }
        
        .plane-icon.in-orbit {
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
