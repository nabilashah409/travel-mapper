import React, { useState, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import { Plus, X, GripVertical, Play, Pause, Plane, Car, Footprints } from 'lucide-react';
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

  // Transport modes (removed train)
  const transportModes = [
    { id: 'flight', icon: Plane, label: '✈️' },
    { id: 'car', icon: Car, label: '🚗' },
    { id: 'walk', icon: Footprints, label: '🚶‍♀️' },
  ];

  // Start animation after component mounts
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowLanding(false);
    }, 4700); // gather (0.8s) + flight (3.0s) + scroll (0.8s) + buffer
    return () => clearTimeout(timer);
  }, []);

  // Recalculate route when transport mode changes
  useEffect(() => {
    if (destinations.length > 1) {
      calculateRoute(destinations);
    }
  }, [selectedTransport]);

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
  // First and last points are EXACTLY at the destination coordinates
  const createCurvedPath = (start, end) => {
    const points = [];
    const numPoints = 100;

    const dLat = end.lat - start.lat;
    const dLng = end.lng - start.lng;

    const distance = Math.hypot(dLat, dLng);

    // "capped" gentle arc (tweak maxArc to reduce curve)
    const maxArc = 0.08;                 // Reduced for subtler curve
    const arcHeight = Math.min(distance * 0.15, maxArc);

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
      // Use sin curve that's exactly 0 at t=0 and t=1
      const arcOffset = Math.sin(Math.PI * t) * arcHeight;

      points.push([lat0 + pLat * arcOffset, lng0 + pLng * arcOffset]);
    }

    // Ensure first and last points are EXACTLY at destination coordinates
    points[0] = [start.lat, start.lng];
    points[numPoints] = [end.lat, end.lng];

    return points;
  };

  // Calculate route based on destinations - curved for flight, road routes for car/walk
  const calculateRoute = async (dests) => {
    if (dests.length < 2) return;
    
    // For car and walk, ONLY use OSRM road routing - never fallback to curved paths
    if (selectedTransport === 'car' || selectedTransport === 'walk') {
      try {
        // Build coordinates string for OSRM
        const coords = dests.map(d => `${d.lng},${d.lat}`).join(';');
        const profile = selectedTransport === 'car' ? 'driving' : 'foot';
        
        // Use OSRM public demo server for routing
        const response = await fetch(
          `https://router.project-osrm.org/route/v1/${profile}/${coords}?overview=full&geometries=geojson`
        );
        
        const data = await response.json();
        
        // Check if we got a valid route
        if (data.code === 'Ok' && data.routes && data.routes[0]) {
          // Convert GeoJSON coordinates to Leaflet format [lat, lng]
          const roadPath = data.routes[0].geometry.coordinates.map(coord => [coord[1], coord[0]]);
          setRoutePath(roadPath);
          return;
        }
        
        // No valid route found (water crossing, different continents, etc.)
        const transportName = selectedTransport === 'car' ? 'drive' : 'walk';
        alert(`Cannot ${transportName} between these destinations! They may be separated by water or on different continents. Use flight mode instead.`);
        setRoutePath([]);
        return;
        
      } catch (error) {
        console.log('Road routing failed:', error);
        const transportName = selectedTransport === 'car' ? 'driving' : 'walking';
        alert(`Could not calculate ${transportName} route. Try using flight mode.`);
        setRoutePath([]);
        return;
      }
    }
    
    // For FLIGHT mode only, use curved path
    let allPoints = [];
    
    for (let i = 0; i < dests.length - 1; i++) {
      const start = dests[i];
      const end = dests[i + 1];
      
      // Use curved path for flights
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
    const emojis = { flight: '✈️', car: '🚗', walk: '🚶‍♀️' };
    return emojis[selectedTransport] || '✈️';
  };

  // Get rotation offset for each transport type (emojis point in different directions)
  const getTransportRotationOffset = () => {
    // At 0° CSS rotation, emoji default orientations:
    // ✈️ plane: faces NORTHEAST (~45°)
    // 🚗 car: faces RIGHT (east, ~90°) 
    // 🚶‍♀️ woman: faces RIGHT (east, ~90°)
    // 
    // Heading: 0°=North, 90°=East, 180°=South, 270°=West
    // To align emoji with heading: rotation = heading - defaultDirection
    // 
    // For car facing right (90°): rotation = heading - 90
    // For woman facing right (90°): rotation = heading - 90
    // For plane facing northeast (45°): rotation = heading - 45
    const offsets = { flight: -45, car: -90, walk: -90 };
    return offsets[selectedTransport] || 0;
  };

  // Get animation speed multiplier based on transport (slower for walk, faster for flight)
  const getTransportSpeedMultiplier = () => {
    // Slower speeds for better visibility (higher = slower)
    const speeds = { flight: 1.0, car: 1.8, walk: 2.5 };
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
        markerSize: 48,
        fontSize: 32
      };
    } else if (width < 768) {
      // Mobile/Tablet
      return { 
        zoomOffset: 0,
        padding: [50, 50],
        markerSize: 56,
        fontSize: 36
      };
    } else if (width < 1024) {
      // Tablet/Small desktop
      return { 
        zoomOffset: 0,
        padding: [60, 60],
        markerSize: 56,
        fontSize: 36
      };
    }
    // Desktop
    return { 
      zoomOffset: 0,
      padding: [80, 80],
      markerSize: 60,
      fontSize: 40
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

  // Calculate cumulative distances along the route path for constant-speed animation
  const calculateCumulativeDistances = (path) => {
    const distances = [0];
    for (let i = 1; i < path.length; i++) {
      const prev = path[i - 1];
      const curr = path[i];
      // Use Haversine-like distance for more accuracy
      const dLat = curr[0] - prev[0];
      const dLng = curr[1] - prev[1];
      // Approximate distance (good enough for animation purposes)
      const dist = Math.sqrt(dLat * dLat + dLng * dLng);
      distances.push(distances[i - 1] + dist);
    }
    return distances;
  };

  // Find the position along the route at a given distance using binary search
  const getPositionAtDistance = (path, distances, targetDistance) => {
    const totalDistance = distances[distances.length - 1];
    
    // Clamp target distance
    if (targetDistance <= 0) return { point: path[0], index: 0, nextIndex: 1 };
    if (targetDistance >= totalDistance) {
      return { point: path[path.length - 1], index: path.length - 2, nextIndex: path.length - 1 };
    }
    
    // Binary search to find the segment containing targetDistance
    let low = 0;
    let high = distances.length - 1;
    while (low < high - 1) {
      const mid = Math.floor((low + high) / 2);
      if (distances[mid] <= targetDistance) {
        low = mid;
      } else {
        high = mid;
      }
    }
    
    // Interpolate within the segment
    const segmentStart = distances[low];
    const segmentEnd = distances[high];
    const segmentLength = segmentEnd - segmentStart;
    const t = segmentLength > 0 ? (targetDistance - segmentStart) / segmentLength : 0;
    
    const p1 = path[low];
    const p2 = path[high];
    
    return {
      point: [
        lerp(p1[0], p2[0], t),
        lerp(p1[1], p2[1], t)
      ],
      index: low,
      nextIndex: high
    };
  };

  // Start route animation with constant speed along the entire route
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

    // Reset visited destinations and mark first one as visited (starting point)
    setVisitedDestinations([destinations[0].id]);

    // Get responsive values for current screen size
    const responsive = getResponsiveValues();

    // Pre-calculate cumulative distances for constant-speed animation
    const cumulativeDistances = calculateCumulativeDistances(routePath);
    const totalRouteDistance = cumulativeDistances[cumulativeDistances.length - 1];

    // Track visited destinations
    let visitedIds = [destinations[0].id];

    // Initial zoom: fit the FIRST segment only (not all destinations)
    const firstSegmentBounds = L.latLngBounds([
      [destinations[0].lat, destinations[0].lng],
      [destinations[1].lat, destinations[1].lng]
    ]);
    const firstSegmentZoom = getSegmentZoom(destinations[0], destinations[1]);
    
    mapRef.current.fitBounds(firstSegmentBounds, {
      padding: responsive.padding,
      maxZoom: firstSegmentZoom,
      animate: false
    });

    // Create animated marker with emoji transport icon
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
    
    // Animation duration based on total route distance and transport speed
    // Use a base duration that scales with route complexity
    const speedMultiplier = getTransportSpeedMultiplier();
    const baseDuration = 4000; // Base 4 seconds for short routes
    const distanceFactor = Math.max(1, totalRouteDistance * 100); // Scale with distance
    const totalDuration = Math.min(baseDuration * speedMultiplier * Math.sqrt(distanceFactor), 15000); // Cap at 15s
    
    const startTime = Date.now();
    let lastHeading = 0; // Store last valid heading for smooth rotation
    let lastSegmentIndex = -1; // Track which destination segment we're in
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / totalDuration, 1);
      
      if (progress >= 1) {
        setIsAnimating(false);
        setAnimationProgress(100);
        // Mark all destinations as visited at the end
        setVisitedDestinations(destinations.map(d => d.id));
        
        // Ensure car stops exactly at the final destination
        const finalPoint = routePath[routePath.length - 1];
        markerRef.current.setLatLng(finalPoint);
        
        // At the end, fit all destinations for overview
        const allBounds = L.latLngBounds(destinations.map(d => [d.lat, d.lng]));
        const endResponsive = getResponsiveValues();
        mapRef.current.fitBounds(allBounds, { 
          padding: endResponsive.padding, 
          maxZoom: 8,
          animate: false
        });
        return;
      }

      // Calculate current distance traveled (constant speed)
      const currentDistance = progress * totalRouteDistance;
      
      // Get interpolated position along the route
      const { point: currentPosition, index, nextIndex } = getPositionAtDistance(
        routePath, 
        cumulativeDistances, 
        currentDistance
      );
      
      if (markerRef.current && mapRef.current) {
        // Update marker position - smooth interpolated position
        markerRef.current.setLatLng(currentPosition);
        
        // Calculate heading from current segment direction
        const p1 = routePath[index];
        const p2 = routePath[Math.min(nextIndex, routePath.length - 1)];
        
        // Only update heading if we have distinct points
        if (p1[0] !== p2[0] || p1[1] !== p2[1]) {
          lastHeading = calculateHeading(p1, p2);
        }
        
        // Apply rotation offset based on transport type
        const rotationOffset = getTransportRotationOffset();
        const adjustedRotation = lastHeading + rotationOffset;
        
        // Update marker icon with rotation
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
            transition: transform 0.1s ease-out;
          ">${getTransportEmoji()}</div>`,
          iconSize: [markerResponsive.markerSize, markerResponsive.markerSize],
          iconAnchor: [markerResponsive.markerSize / 2, markerResponsive.markerSize / 2],
        });
        markerRef.current.setIcon(rotatedIcon);
        
        // Check which destination segment we're approaching/passing
        // Find nearest destination based on current position
        let currentSegment = 0;
        for (let i = 1; i < destinations.length; i++) {
          const destDist = Math.sqrt(
            Math.pow(currentPosition[0] - destinations[i].lat, 2) +
            Math.pow(currentPosition[1] - destinations[i].lng, 2)
          );
          const prevDestDist = Math.sqrt(
            Math.pow(currentPosition[0] - destinations[i - 1].lat, 2) +
            Math.pow(currentPosition[1] - destinations[i - 1].lng, 2)
          );
          if (prevDestDist < destDist * 0.3) { // Past the previous destination
            currentSegment = i;
          }
        }
        
        // Update zoom when entering a new segment
        if (currentSegment !== lastSegmentIndex && currentSegment < destinations.length - 1) {
          lastSegmentIndex = currentSegment;
          
          const segmentStart = destinations[currentSegment];
          const segmentEnd = destinations[currentSegment + 1];
          
          // Mark visited destinations
          if (!visitedIds.includes(segmentStart.id)) {
            visitedIds = [...visitedIds, segmentStart.id];
            setVisitedDestinations([...visitedIds]);
          }
          
          // Adjust zoom to fit current segment
          const segmentBounds = L.latLngBounds([
            [segmentStart.lat, segmentStart.lng],
            [segmentEnd.lat, segmentEnd.lng]
          ]);
          const segmentZoom = getSegmentZoom(segmentStart, segmentEnd);
          const currentResponsive = getResponsiveValues();
          
          mapRef.current.fitBounds(segmentBounds, {
            padding: currentResponsive.padding,
            maxZoom: segmentZoom,
            animate: false
          });
        }
        
        // Mark destination as visited when close to it
        for (let i = 0; i < destinations.length; i++) {
          const dest = destinations[i];
          const distToDest = Math.sqrt(
            Math.pow(currentPosition[0] - dest.lat, 2) +
            Math.pow(currentPosition[1] - dest.lng, 2)
          );
          if (distToDest < 0.01 && !visitedIds.includes(dest.id)) { // Close enough
            visitedIds = [...visitedIds, dest.id];
            setVisitedDestinations([...visitedIds]);
          }
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
    <div className="h-screen w-screen relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #87CEEB 0%, #98D8AA 50%, #4AA8D8 100%)' }}>
      {/* Map container with illustrated/cartoon look */}
      <div className="absolute inset-0 illustrated-map-container">
        <MapContainer
          center={defaultCenter}
          zoom={4}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          ref={(map) => { if (map) mapRef.current = map; }}
        >
          {/* CARTO Voyager - Colorful, illustrated-style map */}
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
          
          <MapController destinations={destinations} defaultCenter={defaultCenter} isAnimating={isAnimating} />
          
          {/* Route line - white dashed line like cartoon travel routes */}
          {routePath.length > 1 && visitedDestinations.length > 0 && (
            <>
              {/* Calculate how much of the route to show based on animation progress */}
              {(() => {
                // If animation finished (all destinations visited), show full route
                if (!isAnimating && visitedDestinations.length === destinations.length) {
                  return (
                    <>
                      {/* Shadow/glow effect */}
                      <Polyline
                        positions={routePath}
                        pathOptions={{
                          color: 'rgba(0,0,0,0.2)',
                          weight: 8,
                          opacity: 0.4,
                          lineCap: 'round',
                        }}
                      />
                      {/* Red dashed route line */}
                      <Polyline
                        positions={routePath}
                        pathOptions={{
                          color: '#ef4444',
                          weight: 4,
                          opacity: 0.9,
                          dashArray: '12, 16',
                          lineCap: 'round',
                        }}
                      />
                    </>
                  );
                }
                
                // During animation, show route BEHIND the plane (subtract points instead of add)
                // This creates a "trail" effect where the route line follows the plane
                const currentPointIndex = Math.floor((animationProgress / 100) * routePath.length);
                const trailLength = Math.min(currentPointIndex, routePath.length);
                const visiblePath = routePath.slice(0, trailLength);
                
                // Only show if we have at least 2 points
                if (visiblePath.length < 2) return null;
                
                return (
                  <>
                    {/* Shadow/glow effect */}
                    <Polyline
                      positions={visiblePath}
                      pathOptions={{
                        color: 'rgba(0,0,0,0.2)',
                        weight: 8,
                        opacity: 0.4,
                        lineCap: 'round',
                      }}
                    />
                    {/* Red/orange dashed route line */}
                    <Polyline
                      positions={visiblePath}
                      pathOptions={{
                        color: '#ef4444',
                        weight: 4,
                        opacity: 0.9,
                        dashArray: '12, 16',
                        lineCap: 'round',
                      }}
                    />
                  </>
                );
              })()}
            </>
          )}
          
          {/* Destination markers - Clean style with red pin and simple text label */}
          {/* Show markers immediately when destinations are added */}
          {destinations.map((dest, index) => {
            return (
              <Marker
                key={dest.id}
                position={[dest.lat, dest.lng]}
                icon={L.divIcon({
                  className: `illustrated-marker marker-${dest.id}`,
                  html: `<div class="marker-container-${dest.id}">
                    <!-- Red location pin -->
                    <div class="pin-wrapper-${dest.id}">
                      <svg width="24" height="32" viewBox="0 0 50 65" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <ellipse cx="25" cy="62" rx="10" ry="3" fill="rgba(0,0,0,0.15)"/>
                        <path d="M25 0C11.2 0 0 11.2 0 25C0 43.75 25 60 25 60C25 60 50 43.75 50 25C50 11.2 38.8 0 25 0Z" fill="#dc2626"/>
                        <path d="M25 5C14 5 5 14 5 25C5 25 5 26 5.5 28C6 26 8 15 25 10C28 9 30 10 30 10C26 7 25 5 25 5Z" fill="rgba(255,255,255,0.3)"/>
                        <circle cx="25" cy="22" r="10" fill="white"/>
                      </svg>
                    </div>
                    <!-- Simple text label -->
                    <span class="dest-label-${dest.id}">${dest.name}</span>
                  </div>
                  <style>
                    .marker-container-${dest.id} {
                      display: flex;
                      flex-direction: column;
                      align-items: center;
                    }
                    .pin-wrapper-${dest.id} {
                      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.25));
                    }
                    .dest-label-${dest.id} {
                      margin-top: 2px;
                      font-family: 'Segoe UI', 'Arial', sans-serif;
                      font-size: 11px;
                      font-weight: 700;
                      color: #1f2937;
                      text-shadow: 
                        -1px -1px 0 white,
                        1px -1px 0 white,
                        -1px 1px 0 white,
                        1px 1px 0 white,
                        0 0 4px white;
                      white-space: nowrap;
                      letter-spacing: 0.3px;
                    }
                  </style>`,
                  iconSize: [80, 52],
                  iconAnchor: [40, 34],
                })}
              />
            );
          })}
        </MapContainer>
      </div>
      
      {/* Decorative corner elements for cartoon feel */}
      <div className="absolute top-4 right-4 pointer-events-none z-[500] hidden md:block">
        <div className="text-5xl animate-pulse">☀️</div>
      </div>
      <div className="absolute bottom-4 left-4 pointer-events-none z-[500] hidden md:block">
        <div className="text-3xl">🌴</div>
      </div>

      {/* CSS for illustrated map - make it more colorful and vibrant */}
      <style jsx>{`
        .illustrated-map-container :global(.leaflet-tile-pane) {
          filter: saturate(1.5) brightness(1.1) contrast(1.05) hue-rotate(5deg);
        }
        .illustrated-map-container :global(.leaflet-container) {
          background: linear-gradient(135deg, #87CEEB, #98D8AA);
        }
        .illustrated-map-container :global(.leaflet-marker-icon) {
          background: transparent !important;
          border: none !important;
        }
        .illustrated-map-container :global(.leaflet-control-attribution) {
          background: rgba(255,255,255,0.8) !important;
          border-radius: 8px !important;
          padding: 4px 8px !important;
          font-size: 10px !important;
        }
      `}</style>

      {/* Floating search box with dropdown - Cartoon style */}
      <div className="absolute top-4 left-4 right-4 md:left-1/2 md:right-auto md:transform md:-translate-x-1/2 z-[1000]">
        <div className="relative">
          <div className="bg-white rounded-full shadow-2xl px-4 md:px-5 py-3 md:py-4 flex items-center gap-3 border-4 border-amber-400" style={{ boxShadow: '0 8px 25px rgba(0,0,0,0.2)' }}>
            <span className="text-2xl">🔍</span>
            <input
              type="text"
              placeholder="Where to next?"
              value={searchQuery}
              onChange={handleSearchInput}
              onKeyPress={(e) => e.key === 'Enter' && addDestination()}
              onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
              className="bg-transparent outline-none text-sm flex-1 min-w-0 placeholder-gray-400 font-bold"
              style={{ fontSize: '16px', fontFamily: 'Arial, sans-serif' }}
            />
            {isSearching ? (
              <div className="w-10 h-10 flex items-center justify-center">
                <div className="w-6 h-6 border-3 border-red-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : (
              <button
                onClick={addDestination}
                disabled={isSearching}
                className="bg-gradient-to-r from-red-500 to-red-600 text-white rounded-full w-10 h-10 flex-shrink-0 flex items-center justify-center hover:scale-110 transition-transform shadow-lg"
                style={{ boxShadow: '0 4px 12px rgba(220, 38, 38, 0.4)' }}
              >
                <Plus className="w-6 h-6" />
              </button>
            )}
          </div>
          
          {/* Search results dropdown - Cartoon style */}
          {showDropdown && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-3 bg-white rounded-2xl shadow-2xl border-4 border-amber-400 overflow-hidden" style={{ boxShadow: '0 8px 25px rgba(0,0,0,0.2)' }}>
              {searchResults.map((result, index) => (
                <button
                  key={index}
                  onClick={() => selectDestination(result)}
                  className="w-full px-5 py-4 text-left hover:bg-amber-50 transition-colors border-b-2 border-amber-100 last:border-b-0 flex items-center gap-3"
                >
                  <span className="text-xl">📍</span>
                  <div className="flex-1">
                    <div className="font-bold text-gray-800">{result.name}</div>
                    <div className="text-xs text-gray-500 truncate">{result.display_name}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Transport selector - Cartoon style */}
      <div className="absolute top-20 md:top-6 right-4 z-[1000]">
        <div className="bg-white rounded-2xl shadow-2xl p-2 md:p-3 flex gap-1 md:gap-2 border-4 border-amber-400" style={{ boxShadow: '0 8px 25px rgba(0,0,0,0.2)' }}>
          {transportModes.map((mode) => (
            <button
              key={mode.id}
              onClick={() => {
                setSelectedTransport(mode.id);
                if (destinations.length > 1) calculateRoute(destinations);
              }}
              className={`w-11 h-11 md:w-12 md:h-12 rounded-xl flex items-center justify-center text-xl md:text-2xl transition-all ${
                selectedTransport === mode.id 
                  ? 'bg-gradient-to-r from-red-500 to-red-600 scale-110 shadow-lg' 
                  : 'hover:bg-amber-100'
              }`}
              style={selectedTransport === mode.id ? { boxShadow: '0 4px 12px rgba(220, 38, 38, 0.4)' } : {}}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* Play/Pause button - Cartoon style */}
      {destinations.length >= 2 && (
        <div className="absolute top-36 md:top-24 right-4 z-[1000]">
          <button
            onClick={isAnimating ? pauseAnimation : startAnimation}
            className={`w-14 h-14 md:w-16 md:h-16 rounded-full shadow-2xl flex items-center justify-center transition-all hover:scale-110 border-4 ${
              isAnimating 
                ? 'bg-white border-red-500 text-red-500' 
                : 'bg-gradient-to-r from-green-500 to-green-600 border-green-600 text-white'
            }`}
            style={{ boxShadow: '0 6px 20px rgba(0,0,0,0.3)' }}
          >
            {isAnimating ? <Pause className="w-6 h-6 md:w-7 md:h-7" /> : <Play className="w-6 h-6 md:w-7 md:h-7 ml-0.5" />}
          </button>
        </div>
      )}

      {/* Progress bar - Cartoon style */}
      {animationProgress > 0 && (
        <div className="absolute top-52 md:top-44 right-4 z-[1000] w-14 md:w-16">
          <div className="bg-white rounded-full h-3 overflow-hidden shadow-lg border-2 border-amber-400">
            <div 
              className="h-full bg-gradient-to-r from-green-500 to-green-600 transition-all"
              style={{ width: `${animationProgress}%` }}
            />
          </div>
          <div className="text-center text-xs font-bold text-white mt-1" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
            {Math.round(animationProgress)}%
          </div>
        </div>
      )}

      {/* Floating destination list - Cartoon style */}
      {destinations.length > 0 && (
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-[1000] max-w-md w-full px-4">
          <div className="bg-white rounded-2xl shadow-2xl p-4 border-4 border-amber-400" style={{ boxShadow: '0 8px 25px rgba(0,0,0,0.2)' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-black text-gray-800 flex items-center gap-2">
                <span>🗺️</span> Your Journey
              </h3>
              <span className="text-sm font-bold text-amber-600 bg-amber-100 px-3 py-1 rounded-full">{destinations.length} stops</span>
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
                  className={`flex items-center gap-3 p-3 bg-gradient-to-r from-amber-50 to-white rounded-xl hover:from-amber-100 transition-all cursor-grab active:cursor-grabbing border-2 border-amber-200 ${
                    draggedIndex === index ? 'opacity-50 scale-95' : ''
                  } ${draggedIndex !== null && draggedIndex !== index ? 'border-2 border-dashed border-red-400' : ''}`}
                >
                  <GripVertical className="w-5 h-5 text-amber-400" />
                  <div className="w-8 h-8 rounded-full bg-gradient-to-r from-red-500 to-red-600 text-white flex items-center justify-center text-sm font-black shadow-lg">
                    {index + 1}
                  </div>
                  <span className="flex-1 text-sm font-bold text-gray-800 truncate">{dest.name}</span>
                  <button
                    onClick={() => removeDestination(dest.id)}
                    className="text-gray-400 hover:text-red-500 transition-colors hover:scale-110"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-3 text-center font-medium">✋ Drag to reorder destinations</p>
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
