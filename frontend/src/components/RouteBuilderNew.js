import React, { useState, useCallback, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import { Plane, Car, Train, Footprints, Truck, PlaneTakeoff, Play, Pause, Download, Plus, X, Loader2, Search } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { toast } from 'sonner';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default marker icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

const transportModes = [
  { id: 'flight', icon: Plane, label: 'Plane' },
  { id: 'car', icon: Car, label: 'Car' },
  { id: 'train', icon: Train, label: 'Train' },
  { id: 'walk', icon: Footprints, label: 'Walk' },
  { id: 'truck', icon: Truck, label: 'Truck' },
  { id: 'helicopter', icon: PlaneTakeoff, label: 'Helicopter' },
];

const RouteBuilderNew = () => {
  const [destinations, setDestinations] = useState([]);
  const [selectedTransport, setSelectedTransport] = useState('flight');
  const [routePaths, setRoutePaths] = useState([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationProgress, setAnimationProgress] = useState(0);
  const [currentMarkerPosition, setCurrentMarkerPosition] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [markerRotation, setMarkerRotation] = useState(0);
  
  const animationRef = useRef(null);
  const mapRef = useRef(null);

  const addDestination = async () => {
    if (!searchQuery.trim()) {
      toast.error('Please enter a location');
      return;
    }

    setIsSearching(true);
    try {
      // Use Nominatim for geocoding with proper headers
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'TravelRouteAnimator/1.0'
          }
        }
      );
      
      if (!response.ok) {
        throw new Error('Search failed');
      }
      
      const data = await response.json();
      
      if (data && data.length > 0) {
        const newDest = {
          id: Date.now(),
          location: data[0].display_name,
          coordinates: {
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon),
          },
        };
        setDestinations([...destinations, newDest]);
        setSearchQuery('');
        toast.success(`Added: ${data[0].display_name.split(',')[0]}`);
      } else {
        toast.error('Location not found. Try a different search term.');
      }
    } catch (error) {
      console.error('Geocoding error:', error);
      toast.error('Failed to search. Please try again.');
    }
    setIsSearching(false);
  };

  const removeDestination = (id) => {
    setDestinations(destinations.filter(d => d.id !== id));
    setRoutePaths([]);
    setCurrentMarkerPosition(null);
  };

  const calculateRoute = () => {
    if (destinations.length < 2) {
      toast.error('Please add at least 2 destinations');
      return;
    }

    const paths = [];
    
    for (let i = 0; i < destinations.length - 1; i++) {
      const start = destinations[i].coordinates;
      const end = destinations[i + 1].coordinates;
      
      // Create curved path for flights
      if (selectedTransport === 'flight' || selectedTransport === 'helicopter') {
        const path = createCurvedPath(start, end);
        paths.push(path);
      } else {
        // For ground transport, create straight line (in real app, use routing API)
        const path = [start, end];
        paths.push(path);
      }
    }

    setRoutePaths(paths);
    toast.success('Route calculated!');
  };

  const createCurvedPath = (start, end) => {
    const points = [];
    const numPoints = 1000; // Even more points for ultra-smooth animation
    const arcHeight = 0.1;

    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      const lat = start.lat + (end.lat - start.lat) * t;
      const lng = start.lng + (end.lng - start.lng) * t;
      
      const offsetLat = Math.sin(t * Math.PI) * arcHeight * Math.abs(end.lat - start.lat);
      
      points.push([lat + offsetLat, lng]);
    }
    return points;
  };

  const calculateHeading = (from, to) => {
    const lat1 = from[0] * Math.PI / 180;
    const lat2 = to[0] * Math.PI / 180;
    const dLng = (to[1] - from[1]) * Math.PI / 180;
    
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    const heading = Math.atan2(y, x) * 180 / Math.PI;
    
    return (heading + 360) % 360;
  };

  const getTransportIcon = () => {
    const icons = {
      flight: `<svg width="40" height="40" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1">
        <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
      </svg>`,
      car: `<svg width="40" height="40" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="0.5">
        <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
      </svg>`,
      train: `<svg width="40" height="40" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="0.5">
        <path d="M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2l2-2h4l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4z"/>
      </svg>`,
      walk: `<svg width="40" height="40" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="0.5">
        <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/>
      </svg>`,
      truck: `<svg width="40" height="40" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="0.5">
        <path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4z"/>
      </svg>`,
      helicopter: `<svg width="40" height="40" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1">
        <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
      </svg>`
    };
    return icons[selectedTransport] || icons.flight;
  };

  const startAnimation = () => {
    if (routePaths.length === 0) {
      toast.error('Please calculate a route first');
      return;
    }

    setAnimationProgress(0);
    setIsAnimating(true);
    
    if (routePaths[0] && routePaths[0][0]) {
      setCurrentMarkerPosition(routePaths[0][0]);
    }
    
    const startTime = Date.now();
    animateMarker(startTime);
  };

  const easeInOutCubic = (t) => {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };

  const animateMarker = (startTime) => {
    const totalPoints = routePaths.reduce((sum, path) => sum + path.length, 0);
    const animationDuration = 10000; // 10 seconds - faster and fun!
    
    const animate = () => {
      const currentTime = Date.now();
      const elapsed = currentTime - startTime;
      
      if (elapsed >= animationDuration) {
        setIsAnimating(false);
        setAnimationProgress(100);
        return;
      }

      // Apply smooth easing
      const linearProgress = elapsed / animationDuration;
      const easedProgress = easeInOutCubic(linearProgress);
      const progress = easedProgress * totalPoints;
      
      let currentPoint = 0;
      
      for (let i = 0; i < routePaths.length; i++) {
        if (currentPoint + routePaths[i].length > progress) {
          const pointInPath = progress - currentPoint;
          const floorIndex = Math.floor(pointInPath);
          const ceilIndex = Math.min(floorIndex + 1, routePaths[i].length - 1);
          const fraction = pointInPath - floorIndex;
          
          // Smooth interpolation between points
          const p1 = routePaths[i][floorIndex];
          const p2 = routePaths[i][ceilIndex];
          
          if (p1 && p2) {
            const interpolatedPosition = [
              p1[0] + (p2[0] - p1[0]) * fraction,
              p1[1] + (p2[1] - p1[1]) * fraction
            ];
            
            setCurrentMarkerPosition(interpolatedPosition);
            
            // Calculate heading for rotation
            if (floorIndex < routePaths[i].length - 1) {
              const heading = calculateHeading(p1, p2);
              setMarkerRotation(heading);
            }
          }
          break;
        }
        currentPoint += routePaths[i].length;
      }

      setAnimationProgress(linearProgress * 100);
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
  };

  const pauseAnimation = () => {
    setIsAnimating(false);
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col md:flex-row overflow-hidden">
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="md:hidden fixed top-4 left-4 z-[100] w-12 h-12 bg-white rounded-full shadow-xl flex items-center justify-center"
      >
        {isSidebarOpen ? <X className="w-6 h-6" /> : <Search className="w-6 h-6" />}
      </button>

      {/* Overlay for mobile */}
      {isSidebarOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-[60]"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Left Sidebar */}
      <div className={`
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0
        fixed md:relative
        top-0 left-0
        w-full md:w-96 
        h-full
        bg-white 
        shadow-lg 
        flex flex-col 
        overflow-y-auto
        transition-transform duration-300 ease-in-out
        z-[80] md:z-auto
      `}>
        <div className="p-8">
          {/* Title */}
          <h1 
            className="text-5xl font-black leading-tight mb-2"
            style={{ fontFamily: 'Playfair Display, serif' }}
          >
            Travel Route Animator
          </h1>
          <p className="text-gray-600 text-sm mb-8">
            Create stunning animated travel videos for Instagram
          </p>

          {/* Add Destinations Section */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Add Destinations</h3>
            
            {/* Search Input */}
            <div className="flex gap-2 mb-4">
              <Input
                placeholder="Search for a city or location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addDestination()}
                className="flex-1"
                style={{ fontSize: '14px' }}
              />
              <Button
                onClick={addDestination}
                disabled={isSearching}
                size="icon"
                style={{ backgroundColor: '#3b82f6' }}
              >
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              </Button>
            </div>

            {/* Destinations List */}
            {destinations.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Search className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Start by adding your first destination</p>
              </div>
            ) : (
              <div className="space-y-2">
                {destinations.map((dest, index) => (
                  <div
                    key={dest.id}
                    className="flex items-center gap-2 p-3 rounded-lg border destination-item"
                  >
                    <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold">
                      {index + 1}
                    </div>
                    <div className="flex-1 text-sm truncate">{dest.location}</div>
                    <button
                      onClick={() => removeDestination(dest.id)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Choose Travel Mode */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Choose Travel Mode</h3>
            <div className="grid grid-cols-3 gap-2">
              {transportModes.map((mode) => {
                const Icon = mode.icon;
                const isSelected = selectedTransport === mode.id;
                return (
                  <button
                    key={mode.id}
                    onClick={() => setSelectedTransport(mode.id)}
                    className={`transport-mode-btn p-4 rounded-lg border-2 flex flex-col items-center gap-2 ${
                      isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Icon className={`w-6 h-6 ${isSelected ? 'text-blue-500' : 'text-gray-600'}`} />
                    <span className={`text-xs font-medium ${isSelected ? 'text-blue-500' : 'text-gray-600'}`}>
                      {mode.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action Buttons */}
          {destinations.length < 2 ? (
            <Button
              disabled
              className="w-full"
              style={{ backgroundColor: '#93c5fd', color: '#fff' }}
            >
              Add at least 2 destinations
            </Button>
          ) : !routePaths.length ? (
            <Button
              onClick={calculateRoute}
              className="w-full"
              style={{ backgroundColor: '#3b82f6' }}
            >
              Generate Route
            </Button>
          ) : (
            <div className="flex gap-2">
              {!isAnimating ? (
                <Button
                  onClick={startAnimation}
                  className="flex-1"
                  style={{ backgroundColor: '#3b82f6' }}
                >
                  <Play className="w-4 h-4 mr-2" />
                  Play Animation
                </Button>
              ) : (
                <Button
                  onClick={pauseAnimation}
                  className="flex-1"
                  style={{ backgroundColor: '#ef4444' }}
                >
                  <Pause className="w-4 h-4 mr-2" />
                  Pause
                </Button>
              )}
              <Button
                onClick={calculateRoute}
                variant="outline"
              >
                Recalculate
              </Button>
            </div>
          )}

          {animationProgress > 0 && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-600 mb-1">
                <span>Progress</span>
                <span>{Math.round(animationProgress)}%</span>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${animationProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Made with Emergent Badge */}
        <div className="mt-auto p-4 border-t">
          <a
            href="https://app.emergent.sh/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 text-xs text-gray-500 hover:text-gray-700"
          >
            <span className="w-5 h-5 rounded-full bg-black text-white flex items-center justify-center font-bold">
              E
            </span>
            Made with Emergent
          </a>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative h-full w-full z-0">
        <MapContainer
          center={[39.8283, -98.5795]}
          zoom={4}
          style={{ height: '100%', width: '100%', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
          zoomControl={true}
          scrollWheelZoom={true}
        >
          {/* Fun colorful map tiles */}
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"
            opacity={0.85}
          />
          
          {/* Route Lines with vibrant rainbow gradient effect */}
          {routePaths.map((path, index) => (
            <Polyline
              key={index}
              positions={path}
              pathOptions={{
                color: '#FF1493',
                weight: 8,
                opacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          ))}
          
          {/* Add animated dashed overlay */}
          {routePaths.map((path, index) => (
            <Polyline
              key={`dash-${index}`}
              positions={path}
              pathOptions={{
                color: '#FFD700',
                weight: 4,
                opacity: 0.8,
                dashArray: '10, 20',
              }}
            />
          ))}
          
          {/* Destination Markers - Rainbow Fun! */}
          {destinations.map((dest, index) => {
            const colors = ['#FF1493', '#FF6B35', '#FFD700', '#00D9FF', '#00FF88', '#B042FF'];
            const markerColor = colors[index % colors.length];
            return (
              <Marker
                key={dest.id}
                position={[dest.coordinates.lat, dest.coordinates.lng]}
                icon={L.divIcon({
                  className: 'fun-destination-marker',
                  html: `
                    <div style="position: relative; width: 56px; height: 56px;">
                      <!-- Mega pulsing outer ring -->
                      <div style="
                        position: absolute;
                        width: 56px;
                        height: 56px;
                        border-radius: 50%;
                        background: radial-gradient(circle, ${markerColor}50 0%, ${markerColor}00 70%);
                        animation: rainbowPulse 1.8s ease-in-out infinite;
                      "></div>
                      
                      <!-- Main marker circle with vibrant color -->
                      <div style="
                        position: absolute;
                        top: 8px;
                        left: 8px;
                        width: 40px;
                        height: 40px;
                        border-radius: 50%;
                        background: ${markerColor};
                        border: 4px solid white;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: white;
                        font-weight: 900;
                        font-size: 20px;
                        box-shadow: 
                          0 6px 20px ${markerColor}80,
                          0 0 30px ${markerColor}60,
                          inset 0 2px 6px rgba(255,255,255,0.3);
                        font-family: 'Fredoka', 'Arial Black', sans-serif;
                        text-shadow: 0 2px 4px rgba(0,0,0,0.3);
                      ">${index + 1}</div>
                      
                      <!-- Multiple sparkles -->
                      <div style="
                        position: absolute;
                        top: 4px;
                        right: 10px;
                        width: 8px;
                        height: 8px;
                        background: white;
                        border-radius: 50%;
                        box-shadow: 0 0 10px rgba(255,255,255,1);
                        animation: twinkle1 1.2s ease-in-out infinite;
                      "></div>
                      
                      <div style="
                        position: absolute;
                        bottom: 6px;
                        left: 6px;
                        width: 6px;
                        height: 6px;
                        background: ${markerColor};
                        border-radius: 50%;
                        box-shadow: 0 0 8px ${markerColor};
                        animation: twinkle2 1.5s ease-in-out infinite;
                      "></div>
                    </div>
                    
                    <style>
                      @keyframes rainbowPulse {
                        0%, 100% { transform: scale(1); opacity: 0.8; }
                        50% { transform: scale(1.5); opacity: 0.3; }
                      }
                      @keyframes twinkle1 {
                        0%, 100% { opacity: 0; transform: scale(0) rotate(0deg); }
                        50% { opacity: 1; transform: scale(1.3) rotate(180deg); }
                      }
                      @keyframes twinkle2 {
                        0%, 100% { opacity: 0; transform: scale(0); }
                        60% { opacity: 1; transform: scale(1); }
                      }
                    </style>
                  `,
                  iconSize: [56, 56],
                  iconAnchor: [28, 28],
                })}
              />
            );
          })}
          
          {/* Animated Marker - Super Fun & Big! */}
          {currentMarkerPosition && (
            <Marker
              key={`animated-${selectedTransport}-${Math.floor(animationProgress)}`}
              position={currentMarkerPosition}
              icon={L.divIcon({
                className: 'animated-marker-fun',
                html: `
                  <div style="
                    position: relative;
                    width: 80px;
                    height: 80px;
                  ">
                    <!-- Outer glow ring -->
                    <div style="
                      position: absolute;
                      top: 0;
                      left: 0;
                      width: 80px;
                      height: 80px;
                      border-radius: 50%;
                      background: radial-gradient(circle, rgba(255,20,147,0.6) 0%, rgba(255,20,147,0) 70%);
                      animation: megaPulse 1.5s ease-in-out infinite;
                    "></div>
                    
                    <!-- Main circle with vibrant gradient -->
                    <div style="
                      position: absolute;
                      top: 10px;
                      left: 10px;
                      width: 60px;
                      height: 60px;
                      border-radius: 50%;
                      background: linear-gradient(135deg, #FF1493 0%, #FF6B35 50%, #FFD700 100%);
                      box-shadow: 
                        0 6px 30px rgba(255,20,147,0.8),
                        0 0 50px rgba(255,215,0,0.6),
                        inset 0 -3px 10px rgba(0,0,0,0.3);
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      transform: rotate(${markerRotation}deg);
                    ">
                      ${getTransportIcon()}
                    </div>
                    
                    <!-- Multiple sparkles -->
                    <div style="
                      position: absolute;
                      top: 8px;
                      right: 8px;
                      width: 10px;
                      height: 10px;
                      border-radius: 50%;
                      background: white;
                      box-shadow: 0 0 15px rgba(255,255,255,1);
                      animation: sparkle1 1s ease-in-out infinite;
                    "></div>
                    
                    <div style="
                      position: absolute;
                      bottom: 10px;
                      left: 12px;
                      width: 8px;
                      height: 8px;
                      border-radius: 50%;
                      background: #FFD700;
                      box-shadow: 0 0 12px rgba(255,215,0,1);
                      animation: sparkle2 1.2s ease-in-out infinite;
                    "></div>
                  </div>
                  
                  <style>
                    @keyframes megaPulse {
                      0%, 100% { transform: scale(1); opacity: 0.8; }
                      50% { transform: scale(1.4); opacity: 0.3; }
                    }
                    @keyframes sparkle1 {
                      0%, 100% { opacity: 0; transform: scale(0); }
                      50% { opacity: 1; transform: scale(1.2); }
                    }
                    @keyframes sparkle2 {
                      0%, 100% { opacity: 0; transform: scale(0); }
                      60% { opacity: 1; transform: scale(1); }
                    }
                  </style>
                `,
                iconSize: [80, 80],
                iconAnchor: [40, 40],
              })}
            />
          )}
        </MapContainer>
      </div>
    </div>
  );
};

export default RouteBuilderNew;
