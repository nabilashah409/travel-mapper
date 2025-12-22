import React, { useState, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import { Plus, X, GripVertical, Play, Pause, Plane, Car, Train, Footprints } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default marker
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

// Map Controller component to handle zoom/pan
const MapController = ({ destinations, defaultCenter }) => {
  const map = useMap();
  
  useEffect(() => {
    if (destinations.length > 0) {
      // Zoom to first destination
      map.flyTo([destinations[0].lat, destinations[0].lng], 6, { duration: 1.5 });
    } else {
      // Default to USA
      map.flyTo(defaultCenter, 4, { duration: 1 });
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
    }, 4000); // 4 seconds of landing animation
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
        toast.success(`Added ${newDest.name}`);
        
        // Calculate route path
        if (updatedDestinations.length > 1) {
          calculateRoute(updatedDestinations);
        }
      } else {
        toast.error('City not found');
      }
    } catch (error) {
      toast.error('Search failed');
    }
    setIsSearching(false);
  };

  // Create curved path for flights
  const createCurvedPath = (start, end) => {
    const points = [];
    const numPoints = 100;
    const arcHeight = 0.15;

    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      const lat = start.lat + (end.lat - start.lat) * t;
      const lng = start.lng + (end.lng - start.lng) * t;
      const offsetLat = Math.sin(t * Math.PI) * arcHeight * Math.abs(end.lat - start.lat);
      points.push([lat + offsetLat, lng]);
    }
    return points;
  };

  // Calculate route based on destinations
  const calculateRoute = (dests) => {
    if (dests.length < 2) return;
    
    let allPoints = [];
    
    for (let i = 0; i < dests.length - 1; i++) {
      const start = dests[i];
      const end = dests[i + 1];
      
      if (selectedTransport === 'flight') {
        const curvedPath = createCurvedPath(start, end);
        allPoints = [...allPoints, ...curvedPath];
      } else {
        // Straight line for ground transport with intermediate points
        const numPoints = 50;
        for (let j = 0; j <= numPoints; j++) {
          const t = j / numPoints;
          allPoints.push([
            start.lat + (end.lat - start.lat) * t,
            start.lng + (end.lng - start.lng) * t
          ]);
        }
      }
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
      toast.error('Add at least 2 destinations first');
      return;
    }

    setIsAnimating(true);
    setAnimationProgress(0);
    
    // Remove existing marker
    if (markerRef.current && mapRef.current) {
      mapRef.current.removeLayer(markerRef.current);
    }

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
    
    // Animation loop using lerp
    const duration = 8000; // 8 seconds
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      if (progress >= 1) {
        setIsAnimating(false);
        setAnimationProgress(100);
        toast.success('Journey complete! 🎉');
        return;
      }

      const totalPoints = routePath.length;
      const targetIndex = Math.floor(progress * (totalPoints - 1));
      const nextIndex = Math.min(targetIndex + 1, totalPoints - 1);
      const segmentProgress = (progress * (totalPoints - 1)) - targetIndex;
      
      const currentPoint = routePath[targetIndex];
      const nextPoint = routePath[nextIndex];
      
      if (currentPoint && nextPoint && markerRef.current) {
        const lat = lerp(currentPoint[0], nextPoint[0], segmentProgress);
        const lng = lerp(currentPoint[1], nextPoint[1], segmentProgress);
        
        // Update marker position directly (no React re-render)
        markerRef.current.setLatLng([lat, lng]);
        
        // Update rotation for flights
        if (selectedTransport === 'flight') {
          const heading = calculateHeading(currentPoint, nextPoint);
          const rotatedIcon = L.divIcon({
            className: 'animated-transport-marker',
            html: `<div style="
              width: 50px;
              height: 50px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 32px;
              transform: rotate(${heading - 90}deg);
              filter: drop-shadow(0 4px 8px rgba(0,0,0,0.3));
            ">${getTransportEmoji()}</div>`,
            iconSize: [50, 50],
            iconAnchor: [25, 25],
          });
          markerRef.current.setIcon(rotatedIcon);
        }
        
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
      <Toaster position="top-center" />
      
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
        
        {/* Route line */}
        {routePath.length > 1 && (
          <>
            <Polyline
              positions={routePath}
              pathOptions={{
                color: '#ec4899',
                weight: 4,
                opacity: 0.8,
                lineCap: 'round',
              }}
            />
            <Polyline
              positions={routePath}
              pathOptions={{
                color: '#fbbf24',
                weight: 2,
                opacity: 0.9,
                dashArray: '8, 12',
              }}
            />
          </>
        )}
        
        {/* Destination markers */}
        {destinations.map((dest, index) => (
          <Marker
            key={dest.id}
            position={[dest.lat, dest.lng]}
            icon={L.divIcon({
              className: 'custom-marker',
              html: `<div style="
                width: 36px;
                height: 36px;
                border-radius: 50%;
                background: linear-gradient(135deg, #ec4899 0%, #f59e0b 100%);
                border: 3px solid white;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: bold;
                font-size: 14px;
                box-shadow: 0 4px 12px rgba(236,72,153,0.4);
              ">${index + 1}</div>`,
              iconSize: [36, 36],
              iconAnchor: [18, 18],
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
  
  useEffect(() => {
    // Play swoosh sound when plane flies
    const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSl+zPLTgjMGHGS56+CZSwkPVanm7qxfHAU7ldjzzn0pBSh6y/HTgjMGHGS56+CZSwkPVanm7qxfHAU7ldj');
    audio.volume = 0.3;
    audio.play().catch(() => {});
    
    // Smooth plane animation using lerp + requestAnimationFrame
    const plane = planeRef.current;
    if (!plane) return;
    
    const duration = 3000; // 3 seconds
    const startTime = Date.now();
    
    // Define curved path points (bezier-like curve from bottom-left to top-right)
    const pathPoints = [
      { x: -10, y: 85, rotation: -35, scale: 0.5 },
      { x: 15, y: 65, rotation: -25, scale: 0.8 },
      { x: 35, y: 45, rotation: -10, scale: 1.0 },
      { x: 55, y: 35, rotation: 5, scale: 1.1 },
      { x: 75, y: 28, rotation: 15, scale: 1.0 },
      { x: 95, y: 15, rotation: 25, scale: 0.9 },
      { x: 115, y: -5, rotation: 30, scale: 0.7 },
    ];
    
    // Lerp function
    const lerp = (start, end, t) => start + (end - start) * t;
    
    // Get interpolated position on path
    const getPositionOnPath = (progress) => {
      const numSegments = pathPoints.length - 1;
      const segmentIndex = Math.min(Math.floor(progress * numSegments), numSegments - 1);
      const segmentProgress = (progress * numSegments) - segmentIndex;
      
      const start = pathPoints[segmentIndex];
      const end = pathPoints[Math.min(segmentIndex + 1, numSegments)];
      
      return {
        x: lerp(start.x, end.x, segmentProgress),
        y: lerp(start.y, end.y, segmentProgress),
        rotation: lerp(start.rotation, end.rotation, segmentProgress),
        scale: lerp(start.scale, end.scale, segmentProgress),
      };
    };
    
    let animationId;
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease-out cubic for smooth deceleration
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      
      const pos = getPositionOnPath(easedProgress);
      
      // Direct DOM manipulation for 60fps smoothness
      plane.style.left = `${pos.x}%`;
      plane.style.top = `${pos.y}%`;
      plane.style.transform = `rotate(${pos.rotation}deg) scale(${pos.scale})`;
      plane.style.opacity = progress < 0.05 ? progress * 20 : (progress > 0.9 ? (1 - progress) * 10 : 1);
      
      if (progress < 1) {
        animationId = requestAnimationFrame(animate);
      }
    };
    
    animationId = requestAnimationFrame(animate);
    
    return () => {
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, []);

  // Icons for the circle - evenly distributed, no center stacking
  const circleIcons = ['🚗', '🚶', '🧳', '🎫', '🗺️', '🚂', '🎒', '🏖️', '🏔️', '🚢'];

  return (
    <div className="h-screen w-screen relative overflow-hidden flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #fff5f7 0%, #fef3c7 50%, #e0f2fe 100%)' }}>
      {/* Everything scrolls up together */}
      <div ref={containerRef} className="landing-content">
        {/* Circular rotating icons */}
        <div className="circular-container">
          {circleIcons.map((icon, index) => (
            <div 
              key={index}
              className="icon-orbit" 
              style={{ 
                '--angle': `${index * (360 / circleIcons.length)}deg`
              }}
            >
              {icon}
            </div>
          ))}
        </div>
        
        {/* Title in center - scrolls with icons */}
        <div className="title-overlay">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-pink-500 to-orange-400 bg-clip-text text-transparent">
            Travel Animator
          </h1>
          <p className="text-gray-500 text-sm mt-2">Plan your journey</p>
        </div>
      </div>

      {/* Flying plane - animated with lerp */}
      <div 
        ref={planeRef}
        className="plane-element"
      >
        ✈️
      </div>

      <style jsx>{`
        .landing-content {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: scrollUp 0.8s ease-in-out 3.2s forwards;
        }
        
        .title-overlay {
          position: absolute;
          text-align: center;
          z-index: 10;
          pointer-events: none;
        }

        .circular-container {
          position: relative;
          width: 260px;
          height: 260px;
        }

        @media (min-width: 768px) {
          .circular-container {
            width: 320px;
            height: 320px;
          }
        }

        .icon-orbit {
          position: absolute;
          top: 50%;
          left: 50%;
          font-size: 1.6rem;
          transform-origin: center;
          animation: orbit 6s linear infinite;
        }

        @media (min-width: 768px) {
          .icon-orbit {
            font-size: 2rem;
          }
        }

        @keyframes orbit {
          0% {
            transform: 
              rotate(var(--angle)) 
              translateX(110px) 
              rotate(calc(-1 * var(--angle)));
          }
          100% {
            transform: 
              rotate(calc(var(--angle) + 360deg)) 
              translateX(110px) 
              rotate(calc(-1 * (var(--angle) + 360deg)));
          }
        }

        @media (min-width: 768px) {
          @keyframes orbit {
            0% {
              transform: 
                rotate(var(--angle)) 
                translateX(140px) 
                rotate(calc(-1 * var(--angle)));
            }
            100% {
              transform: 
                rotate(calc(var(--angle) + 360deg)) 
                translateX(140px) 
                rotate(calc(-1 * (var(--angle) + 360deg)));
            }
          }
        }

        .plane-element {
          position: absolute;
          font-size: 3rem;
          filter: drop-shadow(0 6px 12px rgba(0,0,0,0.3));
          z-index: 20;
          will-change: transform, left, top, opacity;
        }

        @media (min-width: 768px) {
          .plane-element {
            font-size: 4rem;
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
