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
      <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-[1000]">
        <div className="bg-white/95 backdrop-blur-md rounded-full shadow-xl px-4 py-3 flex items-center gap-2 border border-pink-100">
          <input
            type="text"
            placeholder="Search destination..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addDestination()}
            className="bg-transparent outline-none text-sm w-56 md:w-64 placeholder-gray-400"
            style={{ fontSize: '16px' }}
          />
          <button
            onClick={addDestination}
            disabled={isSearching}
            className="bg-gradient-to-r from-pink-500 to-orange-400 text-white rounded-full w-8 h-8 flex items-center justify-center hover:scale-110 transition-transform"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Transport selector */}
      <div className="absolute top-6 right-4 z-[1000]">
        <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xl p-2 flex gap-1 border border-pink-100">
          {transportModes.map((mode) => (
            <button
              key={mode.id}
              onClick={() => {
                setSelectedTransport(mode.id);
                if (destinations.length > 1) calculateRoute(destinations);
              }}
              className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-all ${
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
        <div className="absolute top-20 right-4 z-[1000]">
          <button
            onClick={isAnimating ? pauseAnimation : startAnimation}
            className={`w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all hover:scale-110 ${
              isAnimating 
                ? 'bg-red-500 text-white' 
                : 'bg-gradient-to-r from-pink-500 to-orange-400 text-white'
            }`}
          >
            {isAnimating ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
          </button>
        </div>
      )}

      {/* Progress bar */}
      {animationProgress > 0 && (
        <div className="absolute top-36 right-4 z-[1000] w-14">
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
  useEffect(() => {
    // Play swoosh sound when plane flies
    const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSl+zPLTgjMGHGS56+CZSwkPVanm7qxfHAU7ldjzzn0pBSh6y/HTgjMGHGS56+CZSwkPVanm7qxfHAU7ldj');
    audio.volume = 0.3;
    audio.play().catch(() => {}); // Ignore if autoplay blocked
  }, []);

  return (
    <div className="h-screen w-screen relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #fff5f7 0%, #fef3c7 50%, #e0f2fe 100%)' }}>
      {/* Circular rotating icons */}
      <div className="absolute inset-0 flex items-center justify-center landing-animation">
        <div className="circular-container">
          {/* 20 icons in circle */}
          <div className="icon-orbit" style={{ '--angle': '0deg', '--delay': '0s' }}>✈️</div>
          <div className="icon-orbit" style={{ '--angle': '18deg', '--delay': '0.1s' }}>🚗</div>
          <div className="icon-orbit" style={{ '--angle': '36deg', '--delay': '0.2s' }}>🚶</div>
          <div className="icon-orbit" style={{ '--angle': '54deg', '--delay': '0.3s' }}>🧳</div>
          <div className="icon-orbit" style={{ '--angle': '72deg', '--delay': '0.4s' }}>👜</div>
          <div className="icon-orbit" style={{ '--angle': '90deg', '--delay': '0.5s' }}>🎫</div>
          <div className="icon-orbit" style={{ '--angle': '108deg', '--delay': '0.6s' }}>🗺️</div>
          <div className="icon-orbit" style={{ '--angle': '126deg', '--delay': '0.7s' }}>🛫</div>
          <div className="icon-orbit" style={{ '--angle': '144deg', '--delay': '0.8s' }}>🚂</div>
          <div className="icon-orbit" style={{ '--angle': '162deg', '--delay': '0.9s' }}>🎒</div>
          <div className="icon-orbit" style={{ '--angle': '180deg', '--delay': '1s' }}>🏖️</div>
          <div className="icon-orbit" style={{ '--angle': '198deg', '--delay': '1.1s' }}>🏔️</div>
          <div className="icon-orbit" style={{ '--angle': '216deg', '--delay': '1.2s' }}>🏝️</div>
          <div className="icon-orbit" style={{ '--angle': '234deg', '--delay': '1.3s' }}>🚢</div>
          <div className="icon-orbit" style={{ '--angle': '252deg', '--delay': '1.4s' }}>🚁</div>
          <div className="icon-orbit" style={{ '--angle': '270deg', '--delay': '1.5s' }}>🚌</div>
          <div className="icon-orbit" style={{ '--angle': '288deg', '--delay': '1.6s' }}>🛵</div>
          <div className="icon-orbit" style={{ '--angle': '306deg', '--delay': '1.7s' }}>🎢</div>
          <div className="icon-orbit" style={{ '--angle': '324deg', '--delay': '1.8s' }}>🎡</div>
          <div className="icon-orbit" style={{ '--angle': '342deg', '--delay': '1.9s' }}>🎠</div>
        </div>
      </div>

      {/* Diagonal flying plane with swoosh */}
      <div className="flight-diagonal">
        <div className="text-8xl animate-wobble">✈️</div>
      </div>

      <style jsx>{`
        .circular-container {
          position: relative;
          width: 600px;
          height: 600px;
        }

        .icon-orbit {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 60px;
          height: 60px;
          margin: -30px 0 0 -30px;
          font-size: 3rem;
          transform-origin: center;
          animation: orbit 8s linear infinite;
          animation-delay: var(--delay);
        }

        @keyframes orbit {
          0% {
            transform: 
              rotate(var(--angle)) 
              translateX(300px) 
              rotate(calc(-1 * var(--angle)));
          }
          100% {
            transform: 
              rotate(calc(var(--angle) + 360deg)) 
              translateX(300px) 
              rotate(calc(-1 * (var(--angle) + 360deg)));
          }
        }

        .flight-diagonal {
          position: absolute;
          top: -100px;
          left: -100px;
          animation: flyDiagonal 3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }

        @keyframes flyDiagonal {
          0% {
            top: -100px;
            left: -100px;
            transform: rotate(-20deg) scale(0.8);
          }
          50% {
            transform: rotate(-5deg) scale(1.2);
          }
          100% {
            top: calc(100% + 100px);
            left: calc(100% + 100px);
            transform: rotate(10deg) scale(1);
          }
        }

        .animate-wobble {
          animation: wobble 0.5s ease-in-out infinite;
        }

        @keyframes wobble {
          0%, 100% { transform: rotate(-2deg); }
          50% { transform: rotate(2deg); }
        }

        @keyframes scrollUp {
          0% {
            transform: translateY(0);
            opacity: 1;
          }
          100% {
            transform: translateY(-150vh);
            opacity: 0;
          }
        }

        .landing-animation {
          animation: scrollUp 1s ease-in-out 3.2s forwards;
        }
      `}</style>
    </div>
  );
};

export default TravelAnimator;
