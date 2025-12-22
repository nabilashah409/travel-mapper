import React, { useState, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import { Plus, X, GripVertical } from 'lucide-react';
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

const TravelAnimator = () => {
  const [showLanding, setShowLanding] = useState(true);
  const [destinations, setDestinations] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [routePath, setRoutePath] = useState([]);
  const markerRef = useRef(null);
  const mapRef = useRef(null);

  // Start animation after component mounts
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowLanding(false);
    }, 4000); // 4 seconds of landing animation
    return () => clearTimeout(timer);
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
        setDestinations([...destinations, newDest]);
        setSearchQuery('');
        toast.success(`Added ${newDest.name}`);
        
        // Calculate route
        if (destinations.length > 0) {
          const path = destinations.map(d => [d.lat, d.lng]);
          path.push([newDest.lat, newDest.lng]);
          setRoutePath(path);
        }
      } else {
        toast.error('City not found');
      }
    } catch (error) {
      toast.error('Search failed');
    }
    setIsSearching(false);
  };

  const removeDestination = (id) => {
    const updated = destinations.filter(d => d.id !== id);
    setDestinations(updated);
    if (updated.length > 1) {
      setRoutePath(updated.map(d => [d.lat, d.lng]));
    } else {
      setRoutePath([]);
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
        center={[20, 0]}
        zoom={2}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        ref={(map) => { if (map) mapRef.current = map; }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        />
        
        {/* Route line */}
        {routePath.length > 1 && (
          <Polyline
            positions={routePath}
            pathOptions={{
              color: '#ec4899',
              weight: 3,
              opacity: 0.7,
              dashArray: '10, 10',
            }}
          />
        )}
        
        {/* Destination markers */}
        {destinations.map((dest, index) => (
          <Marker
            key={dest.id}
            position={[dest.lat, dest.lng]}
            icon={L.divIcon({
              className: 'custom-marker',
              html: `<div style="
                width: 32px;
                height: 32px;
                border-radius: 50%;
                background: linear-gradient(135deg, #ec4899 0%, #f59e0b 100%);
                border: 3px solid white;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: bold;
                font-size: 14px;
                box-shadow: 0 4px 12px rgba(236,72,153,0.3);
              ">${index + 1}</div>`,
              iconSize: [32, 32],
              iconAnchor: [16, 16],
            })}
          />
        ))}
      </MapContainer>

      {/* Floating search box */}
      <div className="absolute top-8 left-1/2 transform -translate-x-1/2 z-[1000]">
        <div className="bg-white/90 backdrop-blur-md rounded-full shadow-xl px-4 py-3 flex items-center gap-2 border border-pink-100">
          <input
            type="text"
            placeholder="Search destination..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addDestination()}
            className="bg-transparent outline-none text-sm w-64 placeholder-gray-400"
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

      {/* Floating destination list */}
      {destinations.length > 0 && (
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-[1000] max-w-md w-full px-4">
          <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-xl p-4 border border-pink-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-700">Your Journey</h3>
              <span className="text-xs text-gray-500">{destinations.length} stops</span>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {destinations.map((dest, index) => (
                <div
                  key={dest.id}
                  className="flex items-center gap-2 p-2 bg-white rounded-xl hover:bg-pink-50 transition-colors"
                >
                  <GripVertical className="w-4 h-4 text-gray-400" />
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
  return (
    <div className="h-screen w-screen relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #fff5f7 0%, #fef3c7 50%, #e0f2fe 100%)' }}>
      {/* Floating icons */}
      <div className="absolute inset-0 landing-animation">
        {/* Flight icon moving across */}
        <div className="absolute flight-path" style={{ top: '30%', left: '-100px' }}>
          <div className="text-6xl">✈️</div>
        </div>
        
        {/* Floating travel icons */}
        <div className="absolute floating-icon" style={{ top: '20%', left: '10%', animationDelay: '0s' }}>
          <div className="text-5xl">🚗</div>
        </div>
        <div className="absolute floating-icon" style={{ top: '40%', left: '20%', animationDelay: '0.5s' }}>
          <div className="text-5xl">🚶</div>
        </div>
        <div className="absolute floating-icon" style={{ top: '60%', left: '15%', animationDelay: '1s' }}>
          <div className="text-5xl">🧳</div>
        </div>
        <div className="absolute floating-icon" style={{ top: '30%', right: '15%', animationDelay: '0.3s' }}>
          <div className="text-5xl">👜</div>
        </div>
        <div className="absolute floating-icon" style={{ top: '50%', right: '25%', animationDelay: '0.8s' }}>
          <div className="text-5xl">🎫</div>
        </div>
        <div className="absolute floating-icon" style={{ top: '70%', left: '40%', animationDelay: '0.6s' }}>
          <div className="text-5xl">🗺️</div>
        </div>
        <div className="absolute floating-icon" style={{ top: '25%', left: '50%', animationDelay: '0.4s' }}>
          <div className="text-5xl">🛫</div>
        </div>
        <div className="absolute floating-icon" style={{ top: '65%', right: '10%', animationDelay: '0.7s' }}>
          <div className="text-5xl">🚂</div>
        </div>
      </div>

      <style jsx>{`
        @keyframes float {
          0%, 100% {
            transform: translateY(0px) rotate(0deg);
          }
          50% {
            transform: translateY(-20px) rotate(5deg);
          }
        }

        @keyframes flyAcross {
          0% {
            left: -100px;
            transform: rotate(-10deg);
          }
          100% {
            left: calc(100% + 100px);
            transform: rotate(10deg);
          }
        }

        @keyframes scrollUp {
          0% {
            transform: translateY(0);
          }
          100% {
            transform: translateY(-100vh);
          }
        }

        .floating-icon {
          animation: float 3s ease-in-out infinite;
        }

        .flight-path {
          animation: flyAcross 3s linear forwards;
        }

        .landing-animation {
          animation: scrollUp 1s ease-in-out 3s forwards;
        }
      `}</style>
    </div>
  );
};

export default TravelAnimator;
