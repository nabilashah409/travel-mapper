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

// Map Controller component to handle zoom/pan when NOT animating
// During animation, the startAnimation function handles zoom dynamically per segment
const MapController = ({ destinations, defaultCenter, isAnimating }) => {
  const map = useMap();
  
  // Get responsive padding based on screen width
  const getMapControllerResponsive = () => {
    const width = window.innerWidth;
    if (width < 480) return { padding: [40, 40] };
    if (width < 768) return { padding: [50, 50] };
    if (width < 1024) return { padding: [60, 60] };
    return { padding: [80, 80] };
  };
  
  // Calculate optimal zoom - LESS AGGRESSIVE, cap at 10
  const calculateOptimalZoom = (destinations) => {
    if (destinations.length < 2) return 8;
    
    // Find minimum distance between consecutive destinations (in degrees)
    let minDistance = Infinity;
    for (let i = 0; i < destinations.length - 1; i++) {
      const d1 = destinations[i];
      const d2 = destinations[i + 1];
      const distance = Math.sqrt(
        Math.pow(d2.lat - d1.lat, 2) + Math.pow(d2.lng - d1.lng, 2)
      );
      minDistance = Math.min(minDistance, distance);
    }
    
    // Reduced zoom levels - cap at 10 max
    let baseZoom;
    if (minDistance < 0.5) baseZoom = 10;      // Close destinations
    else if (minDistance < 1) baseZoom = 9;    // ~100km
    else if (minDistance < 2) baseZoom = 8;    // ~200km
    else if (minDistance < 4) baseZoom = 7;    // ~400km
    else if (minDistance < 8) baseZoom = 6;    // ~800km
    else if (minDistance < 15) baseZoom = 5;   // Multi-state
    else baseZoom = 4;                          // Cross-country
    
    // Clamp between 4 and 10
    return Math.min(10, Math.max(4, baseZoom));
  };
  
  // Only adjust zoom when destinations change AND we're NOT animating
  // This prevents interfering with the dynamic segment-based zoom during animation
  useEffect(() => {
    // Skip if animation is in progress - let startAnimation handle zoom
    if (isAnimating) return;
    
    const { padding } = getMapControllerResponsive();
    
    if (destinations.length === 0) {
      map.flyTo(defaultCenter, 4, { duration: 1 });
    } else if (destinations.length === 1) {
      map.flyTo([destinations[0].lat, destinations[0].lng], 8, { duration: 1 });
    } else {
      const bounds = L.latLngBounds(
        destinations.map(d => [d.lat, d.lng])
      );
      const optimalZoom = calculateOptimalZoom(destinations);
      
      map.flyToBounds(bounds, {
        padding: padding,
        duration: 1,
        maxZoom: optimalZoom
      });
    }
  }, [destinations, map, defaultCenter, isAnimating]);
  
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
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [visitedDestinations, setVisitedDestinations] = useState([]); // Track which destinations have been reached
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

  // Drag and drop handlers for reordering destinations
  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.target.outerHTML);
    e.target.style.opacity = '0.5';
  };

  const handleDragEnd = (e) => {
    e.target.style.opacity = '1';
    setDraggedIndex(null);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    
    if (draggedIndex === null || draggedIndex === dropIndex) return;
    
    const newDestinations = [...destinations];
    const [draggedItem] = newDestinations.splice(draggedIndex, 1);
    newDestinations.splice(dropIndex, 0, draggedItem);
    
    setDestinations(newDestinations);
    setDraggedIndex(null);
    
    // Recalculate route with new order
    if (newDestinations.length > 1) {
      calculateRoute(newDestinations);
    }
  };

  // Get transport emoji for animated marker
  const getTransportEmoji = () => {
    const emojis = { flight: '✈️', car: '🚗', train: '🚂', walk: '🚶' };
    return emojis[selectedTransport] || '✈️';
  };

  // Get rotation offset for each transport type (emojis point in different directions)
  const getTransportRotationOffset = () => {
    // ✈️ plane points northeast (~45°), so subtract 45 to align with heading
    // 🚗 car points right (0°), so no offset needed
    // 🚂 train points right (0°), so no offset needed  
    // 🚶 walk points right/forward (0°), so no offset needed
    const offsets = { flight: -45, car: 0, train: 0, walk: 0 };
    return offsets[selectedTransport] || 0;
  };

  // Get animation speed multiplier based on transport (slower for walk, faster for flight)
  const getTransportSpeedMultiplier = () => {
    const speeds = { flight: 1, car: 1.5, train: 1.3, walk: 2.5 };
    return speeds[selectedTransport] || 1;
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

  // Get responsive values based on screen width
  const getResponsiveValues = () => {
    const width = window.innerWidth;
    
    if (width < 480) {
      // Mobile small
      return { 
        zoomOffset: -1,
        padding: [40, 40],
        markerSize: 36,
        fontSize: 24
      };
    } else if (width < 768) {
      // Mobile/Tablet
      return { 
        zoomOffset: 0,
        padding: [50, 50],
        markerSize: 42,
        fontSize: 28
      };
    } else if (width < 1024) {
      // Tablet/Small desktop
      return { 
        zoomOffset: 0,
        padding: [60, 60],
        markerSize: 46,
        fontSize: 30
      };
    }
    // Desktop
    return { 
      zoomOffset: 0,
      padding: [80, 80],
      markerSize: 50,
      fontSize: 32
    };
  };

  // Calculate optimal zoom for a specific segment - LESS AGGRESSIVE
  // Cap zoom to prevent over-zooming which causes lag and route breaking
  const getSegmentZoom = (start, end) => {
    const distance = Math.sqrt(
      Math.pow(end.lat - start.lat, 2) + Math.pow(end.lng - start.lng, 2)
    );
    
    const { zoomOffset } = getResponsiveValues();
    
    // REDUCED zoom levels - cap at 10 max to prevent lag
    let baseZoom;
    if (distance < 0.5) baseZoom = 10;        // Close destinations - cap at 10
    else if (distance < 1) baseZoom = 9;      // ~100km
    else if (distance < 2) baseZoom = 8;      // ~200km
    else if (distance < 4) baseZoom = 7;      // ~400km
    else if (distance < 8) baseZoom = 6;      // ~800km
    else if (distance < 15) baseZoom = 5;     // Multi-state
    else baseZoom = 4;                         // Cross-country/Intercontinental
    
    // Apply responsive offset, clamp between 4 and 10 to prevent over-zoom
    return Math.min(10, Math.max(4, baseZoom + zoomOffset));
  };

  // Start route animation with dynamic segment-based zoom
  const startAnimation = () => {
    if (routePath.length < 2 || destinations.length < 2) {
      return;
    }

    setIsAnimating(true);
    setAnimationProgress(0);
    
    // Remove existing marker
    if (markerRef.current && mapRef.current) {
      mapRef.current.removeLayer(markerRef.current);
    }

    // Get responsive values for current screen size
    const responsive = getResponsiveValues();

    // Calculate segment boundaries (which route path index corresponds to each destination)
    // Each segment has ~100 points (from createCurvedPath)
    const pointsPerSegment = 101; // 0-100 inclusive
    const totalSegments = destinations.length - 1;
    
    // Track current segment for zoom transitions
    let currentSegmentIndex = -1;

    // Initial zoom: fit the FIRST segment only (not all destinations)
    const firstSegmentBounds = L.latLngBounds([
      [destinations[0].lat, destinations[0].lng],
      [destinations[1].lat, destinations[1].lng]
    ]);
    const firstSegmentZoom = getSegmentZoom(destinations[0], destinations[1]);
    
    // Use fitBounds instead of flyToBounds for initial view (no animation = no lag)
    mapRef.current.fitBounds(firstSegmentBounds, {
      padding: responsive.padding,
      maxZoom: firstSegmentZoom,
      animate: false
    });

    // Create animated marker with responsive size
    const customIcon = L.divIcon({
      className: 'animated-transport-marker',
      html: `<div style="
        width: ${responsive.markerSize}px;
        height: ${responsive.markerSize}px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: ${responsive.fontSize}px;
        filter: drop-shadow(0 4px 8px rgba(0,0,0,0.3));
      ">${getTransportEmoji()}</div>`,
      iconSize: [responsive.markerSize, responsive.markerSize],
      iconAnchor: [responsive.markerSize / 2, responsive.markerSize / 2],
    });

    markerRef.current = L.marker(routePath[0], { icon: customIcon }).addTo(mapRef.current);
    
    // Animation duration scales with transport type and number of segments
    // Base: 4 seconds per segment, adjusted by transport speed
    const baseDurationPerSegment = 4000;
    const speedMultiplier = getTransportSpeedMultiplier();
    const durationPerSegment = baseDurationPerSegment * speedMultiplier;
    const totalDuration = totalSegments * durationPerSegment;
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / totalDuration, 1);
      
      if (progress >= 1) {
        setIsAnimating(false);
        setAnimationProgress(100);
        // At the end, fit all destinations for overview (no animation)
        const allBounds = L.latLngBounds(destinations.map(d => [d.lat, d.lng]));
        const endResponsive = getResponsiveValues();
        mapRef.current.fitBounds(allBounds, { 
          padding: endResponsive.padding, 
          maxZoom: 8,
          animate: false
        });
        return;
      }

      // Calculate which segment we're in and the progress within that segment
      const segmentIndex = Math.min(Math.floor(progress * totalSegments), totalSegments - 1);
      const segmentProgress = (progress * totalSegments) - segmentIndex;
      
      // Calculate the route path index
      const segmentStartIndex = segmentIndex * pointsPerSegment;
      const localIndex = Math.floor(segmentProgress * (pointsPerSegment - 1));
      const targetIndex = segmentStartIndex + localIndex;
      const nextIndex = Math.min(targetIndex + 1, routePath.length - 1);
      const microProgress = (segmentProgress * (pointsPerSegment - 1)) - localIndex;
      
      const currentPoint = routePath[targetIndex];
      const nextPoint = routePath[nextIndex];
      
      if (currentPoint && nextPoint && markerRef.current && mapRef.current) {
        const lat = lerp(currentPoint[0], nextPoint[0], microProgress);
        const lng = lerp(currentPoint[1], nextPoint[1], microProgress);
        
        // Update marker position
        markerRef.current.setLatLng([lat, lng]);
        
        // DYNAMIC ZOOM: When entering a new segment, adjust view to fit that segment
        // Use fitBounds with no animation to avoid lag and route breaking
        if (segmentIndex !== currentSegmentIndex) {
          currentSegmentIndex = segmentIndex;
          
          const segmentStart = destinations[segmentIndex];
          const segmentEnd = destinations[segmentIndex + 1];
          
          // Create bounds for just this segment
          const segmentBounds = L.latLngBounds([
            [segmentStart.lat, segmentStart.lng],
            [segmentEnd.lat, segmentEnd.lng]
          ]);
          
          // Calculate optimal zoom for this specific segment
          const segmentZoom = getSegmentZoom(segmentStart, segmentEnd);
          
          // Get current responsive values for padding
          const currentResponsive = getResponsiveValues();
          
          // Use fitBounds without animation to prevent lag/route breaking
          mapRef.current.fitBounds(segmentBounds, {
            padding: currentResponsive.padding,
            maxZoom: segmentZoom,
            animate: false
          });
        }
        
        // Update rotation based on transport type
        const heading = calculateHeading(currentPoint, nextPoint);
        const rotationOffset = getTransportRotationOffset();
        const adjustedRotation = heading + rotationOffset;
        
        // Get responsive marker size for rotation update
        const markerResponsive = getResponsiveValues();
        const rotatedIcon = L.divIcon({
          className: 'animated-transport-marker',
          html: `<div style="
            width: ${markerResponsive.markerSize}px;
            height: ${markerResponsive.markerSize}px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: ${markerResponsive.fontSize}px;
            transform: rotate(${adjustedRotation}deg);
            filter: drop-shadow(0 4px 8px rgba(0,0,0,0.3));
          ">${getTransportEmoji()}</div>`,
          iconSize: [markerResponsive.markerSize, markerResponsive.markerSize],
          iconAnchor: [markerResponsive.markerSize / 2, markerResponsive.markerSize / 2],
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
          
          {/* Destination markers - only show visited destinations with name labels */}
          {destinations.map((dest, index) => {
            // Only show marker if destination has been visited (or if not animating, show all)
            const isVisited = visitedDestinations.includes(dest.id);
            const showMarker = !isAnimating || isVisited;
            
            if (!showMarker) return null;
            
            return (
              <Marker
                key={dest.id}
                position={[dest.lat, dest.lng]}
                icon={L.divIcon({
                  className: 'custom-marker-with-label',
                  html: `<div style="
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    transform: translateX(-50%);
                  ">
                    <div style="
                      background: white;
                      padding: 4px 10px;
                      border-radius: 12px;
                      font-size: 12px;
                      font-weight: 600;
                      color: #1f2937;
                      white-space: nowrap;
                      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
                      margin-bottom: 4px;
                      border: 2px solid #ec4899;
                    ">${dest.name}</div>
                    <div style="
                      width: 16px;
                      height: 16px;
                      border-radius: 50%;
                      background: linear-gradient(135deg, #ec4899, #f97316);
                      border: 3px solid white;
                      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                    "></div>
                  </div>`,
                  iconSize: [100, 50],
                  iconAnchor: [50, 50],
                })}
              />
            );
          })}
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
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={(e) => handleDrop(e, index)}
                  className={`flex items-center gap-2 p-2 bg-white rounded-xl hover:bg-pink-50 transition-all cursor-grab active:cursor-grabbing ${
                    draggedIndex === index ? 'opacity-50 scale-95' : ''
                  } ${draggedIndex !== null && draggedIndex !== index ? 'border-2 border-dashed border-pink-300' : ''}`}
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
            <p className="text-xs text-gray-400 mt-2 text-center">Drag to reorder destinations</p>
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
