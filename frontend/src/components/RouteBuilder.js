import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleMap, useJsApiLoader, Polyline, Marker } from '@react-google-maps/api';
import { Plane, Car, Train, Footprints, Truck, PlaneTakeoff, Play, Pause, Download, Plus, X, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

const libraries = ['places', 'geometry'];

const GOOGLE_MAPS_API_KEY = 'AIzaSyBaHTL53gqM-xV5JfJWAgNRWqb-vUILVfg';

const mapContainerStyle = {
  width: '100%',
  height: '100vh',
};

const center = {
  lat: 39.8283,
  lng: -98.5795,
};

const darkMapStyles = [
  { elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0f172a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#cbd5e1' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#64748b' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#64748b' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1e293b' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#334155' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#1e293b' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#cbd5e1' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#020617' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#475569' }] },
  { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ color: '#020617' }] },
];

const transportModes = [
  { id: 'flight', icon: Plane, label: 'Flight', color: '#06b6d4' },
  { id: 'car', icon: Car, label: 'Car', color: '#f59e0b' },
  { id: 'train', icon: Train, label: 'Train', color: '#10b981' },
  { id: 'walk', icon: Footprints, label: 'Walk', color: '#ec4899' },
  { id: 'truck', icon: Truck, label: 'Truck', color: '#8b5cf6' },
  { id: 'helicopter', icon: PlaneTakeoff, label: 'Helicopter', color: '#06b6d4' },
];

const RouteBuilder = () => {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries,
  });

  const [destinations, setDestinations] = useState([{ id: 1, location: '', coordinates: null }]);
  const [selectedTransport, setSelectedTransport] = useState('flight');
  const [routePaths, setRoutePaths] = useState([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationProgress, setAnimationProgress] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [animationSpeed, setAnimationSpeed] = useState(1);
  const [markerRotation, setMarkerRotation] = useState(0);
  const [currentMarkerPosition, setCurrentMarkerPosition] = useState(null);
  
  const mapRef = useRef(null);
  const autocompleteRefs = useRef({});
  const animationRef = useRef(null);
  const recordingRef = useRef(null);
  const canvasRef = useRef(null);

  const onLoad = useCallback((map) => {
    mapRef.current = map;
  }, []);

  const onUnmount = useCallback(() => {
    mapRef.current = null;
  }, []);

  useEffect(() => {
    if (isLoaded) {
      destinations.forEach((dest, index) => {
        if (!autocompleteRefs.current[dest.id]) {
          const input = document.getElementById(`destination-input-${dest.id}`);
          if (input) {
            const autocomplete = new window.google.maps.places.Autocomplete(input);
            autocomplete.addListener('place_changed', () => {
              const place = autocomplete.getPlace();
              if (place.geometry) {
                const newDestinations = [...destinations];
                newDestinations[index] = {
                  ...newDestinations[index],
                  location: place.formatted_address || place.name,
                  coordinates: {
                    lat: place.geometry.location.lat(),
                    lng: place.geometry.location.lng(),
                  },
                };
                setDestinations(newDestinations);
              }
            });
            autocompleteRefs.current[dest.id] = autocomplete;
          }
        }
      });
    }
  }, [isLoaded, destinations]);

  const addDestination = () => {
    setDestinations([...destinations, { id: Date.now(), location: '', coordinates: null }]);
  };

  const removeDestination = (id) => {
    if (destinations.length > 1) {
      setDestinations(destinations.filter(d => d.id !== id));
    }
  };

  const calculateRoute = async () => {
    const validDestinations = destinations.filter(d => d.coordinates);
    if (validDestinations.length < 2) {
      toast.error('Please add at least 2 valid destinations');
      return;
    }

    // Clear previous animation state
    setIsAnimating(false);
    setAnimationProgress(0);
    setCurrentMarkerPosition(null);
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    const paths = [];
    
    for (let i = 0; i < validDestinations.length - 1; i++) {
      const origin = validDestinations[i].coordinates;
      const destination = validDestinations[i + 1].coordinates;

      if (selectedTransport === 'flight' || selectedTransport === 'helicopter') {
        const path = createCurvedPath(origin, destination);
        paths.push(path);
      } else {
        try {
          const directionsService = new window.google.maps.DirectionsService();
          const travelMode = selectedTransport === 'train' ? 'TRANSIT' : 
                           selectedTransport === 'walk' ? 'WALKING' : 'DRIVING';
          
          const result = await directionsService.route({
            origin,
            destination,
            travelMode: window.google.maps.TravelMode[travelMode],
          });

          if (result.routes[0]) {
            const path = result.routes[0].overview_path.map(point => ({
              lat: point.lat(),
              lng: point.lng(),
            }));
            paths.push(path);
          }
        } catch (error) {
          console.error('Error calculating route:', error);
          const path = [origin, destination];
          paths.push(path);
        }
      }
    }

    setRoutePaths(paths);
    
    if (mapRef.current && validDestinations.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      validDestinations.forEach(dest => {
        bounds.extend(dest.coordinates);
      });
      mapRef.current.fitBounds(bounds);
    }

    toast.success('Route calculated successfully!');
  };

  const createCurvedPath = (start, end) => {
    const points = [];
    const numPoints = 200; // Increased for smoother animation
    const arcHeight = 0.15; // Slightly reduced for more realistic arc

    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      const lat = start.lat + (end.lat - start.lat) * t;
      const lng = start.lng + (end.lng - start.lng) * t;
      
      // Create a smooth arc using sine function
      const offsetLat = Math.sin(t * Math.PI) * arcHeight * Math.abs(end.lat - start.lat);
      
      points.push({
        lat: lat + offsetLat,
        lng: lng,
      });
    }
    return points;
  };

  const startAnimation = () => {
    if (routePaths.length === 0) {
      toast.error('Please calculate a route first');
      return;
    }

    // Reset and start from beginning
    setAnimationProgress(0);
    setIsAnimating(true);
    
    // Set initial position to first point of first path
    if (routePaths[0] && routePaths[0][0]) {
      setCurrentMarkerPosition(routePaths[0][0]);
      
      // Keep the map zoomed out to show the entire route - don't follow marker
      const validDestinations = destinations.filter(d => d.coordinates);
      if (mapRef.current && validDestinations.length > 0) {
        const bounds = new window.google.maps.LatLngBounds();
        validDestinations.forEach(dest => {
          bounds.extend(dest.coordinates);
        });
        mapRef.current.fitBounds(bounds);
      }
    }
    
    // Start animation loop
    const startTime = Date.now();
    animateMarker(startTime);
  };

  const calculateHeading = (from, to) => {
    const lat1 = from.lat * Math.PI / 180;
    const lat2 = to.lat * Math.PI / 180;
    const dLng = (to.lng - from.lng) * Math.PI / 180;
    
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    const heading = Math.atan2(y, x) * 180 / Math.PI;
    
    return (heading + 360) % 360;
  };

  const animateMarker = (startTime) => {
    const totalPoints = routePaths.reduce((sum, path) => sum + path.length, 0);
    const animationDuration = (totalPoints / animationSpeed) * 30; // Smooth, consistent speed
    
    const animate = () => {
      const currentTime = Date.now();
      const elapsed = currentTime - startTime;
      const progress = Math.min((elapsed / animationDuration) * totalPoints, totalPoints);
      
      if (progress >= totalPoints - 1) {
        // Animation complete
        setIsAnimating(false);
        setAnimationProgress(100);
        if (isRecording) {
          stopRecording();
        }
        return;
      }

      // Find current position in the path with interpolation for smoothness
      let currentPoint = 0;
      
      for (let i = 0; i < routePaths.length; i++) {
        if (currentPoint + routePaths[i].length > progress) {
          const pointInPath = progress - currentPoint;
          const floorIndex = Math.floor(pointInPath);
          const ceilIndex = Math.min(floorIndex + 1, routePaths[i].length - 1);
          const fraction = pointInPath - floorIndex;
          
          // Interpolate between points for smoother animation
          const p1 = routePaths[i][floorIndex];
          const p2 = routePaths[i][ceilIndex];
          
          const interpolatedPosition = {
            lat: p1.lat + (p2.lat - p1.lat) * fraction,
            lng: p1.lng + (p2.lng - p1.lng) * fraction
          };
          
          setCurrentMarkerPosition(interpolatedPosition);
          
          // Calculate heading for rotation
          if (floorIndex < routePaths[i].length - 1) {
            const heading = calculateHeading(p1, p2);
            setMarkerRotation(heading);
          }
          
          break;
        }
        currentPoint += routePaths[i].length;
      }

      setAnimationProgress((progress / totalPoints) * 100);
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

  const startRecording = async () => {
    try {
      const mapDiv = document.querySelector('.google-map-container');
      if (!mapDiv) return;

      const stream = await mapDiv.captureStream ? mapDiv.captureStream(30) : null;
      
      if (!stream) {
        toast.error('Screen recording not supported in this browser');
        return;
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
      });

      const chunks = [];
      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `route-animation-${Date.now()}.webm`;
        a.click();
        toast.success('Video downloaded successfully!');
      };

      recordingRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      startAnimation();
    } catch (error) {
      console.error('Recording error:', error);
      toast.error('Failed to start recording');
    }
  };

  const stopRecording = () => {
    if (recordingRef.current && recordingRef.current.state === 'recording') {
      recordingRef.current.stop();
      setIsRecording(false);
    }
  };

  const downloadAnimation = async () => {
    toast.info('Starting animation recording...');
    await startRecording();
  };

  const getTransportIcon = () => {
    const mode = transportModes.find(m => m.id === selectedTransport);
    return mode ? mode.icon : Plane;
  };

  const getTransportColor = () => {
    const mode = transportModes.find(m => m.id === selectedTransport);
    return mode ? mode.color : '#06b6d4';
  };

  const getTransportIconUrl = () => {
    const color = getTransportColor().replace('#', '');
    
    const iconSvgs = {
      flight: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><g transform="translate(24, 24) rotate(${markerRotation}) translate(-24, -24)"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" transform="translate(12, 12)" fill="%23${color}" stroke="%23ffffff" stroke-width="1"/></g></svg>`,
      car: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><g transform="translate(24, 24) rotate(${markerRotation}) translate(-24, -24)"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" transform="translate(12, 12)" fill="%23${color}" stroke="%23ffffff" stroke-width="1"/></g></svg>`,
      train: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><g transform="translate(24, 24) rotate(${markerRotation}) translate(-24, -24)"><path d="M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2l2-2h4l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm3.5-7H6V6h5v4zm5.5 7c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-7h-5V6h5v4z" transform="translate(12, 12)" fill="%23${color}" stroke="%23ffffff" stroke-width="1"/></g></svg>`,
      walk: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><g transform="translate(24, 24) rotate(${markerRotation}) translate(-24, -24)"><path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7" transform="translate(12, 12)" fill="%23${color}" stroke="%23ffffff" stroke-width="1"/></g></svg>`,
      truck: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><g transform="translate(24, 24) rotate(${markerRotation}) translate(-24, -24)"><path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" transform="translate(12, 12)" fill="%23${color}" stroke="%23ffffff" stroke-width="1"/></g></svg>`,
      helicopter: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><g transform="translate(24, 24) rotate(${markerRotation}) translate(-24, -24)"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" transform="translate(12, 12)" fill="%23${color}" stroke="%23ffffff" stroke-width="1"/></g></svg>`
    };
    
    const svg = iconSvgs[selectedTransport] || iconSvgs.flight;
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
  };

  if (!isLoaded) {
    return (
      <div className="h-screen w-screen flex items-center justify-center" style={{ backgroundColor: '#020617' }}>
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4" style={{ color: '#06b6d4' }} />
          <p className="text-lg" style={{ color: '#94a3b8', fontFamily: 'Inter, sans-serif' }}>Loading Maps...</p>
          <p className="text-sm mt-2" style={{ color: '#64748b', fontFamily: 'Inter, sans-serif' }}>
            If this takes too long, please check your Google Maps API configuration
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden relative" style={{ backgroundColor: '#020617' }}>
      <div className="absolute inset-0 z-0 google-map-container">
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={center}
          zoom={4}
          onLoad={onLoad}
          onUnmount={onUnmount}
          options={{
            styles: darkMapStyles,
            disableDefaultUI: true,
            zoomControl: true,
          }}
        >
          {routePaths.map((path, index) => (
            <Polyline
              key={index}
              path={path}
              options={{
                strokeColor: getTransportColor(),
                strokeOpacity: 0.8,
                strokeWeight: 3,
              }}
            />
          ))}
          
          {destinations.filter(d => d.coordinates).map((dest, index) => (
            <Marker
              key={dest.id}
              position={dest.coordinates}
              label={{
                text: String(index + 1),
                color: '#f8fafc',
                fontSize: '14px',
                fontWeight: 'bold',
              }}
              icon={{
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 12,
                fillColor: getTransportColor(),
                fillOpacity: 0.9,
                strokeColor: '#f8fafc',
                strokeWeight: 2,
              }}
            />
          ))}
          
          {currentMarkerPosition && (
            <Marker
              position={currentMarkerPosition}
              icon={{
                url: getTransportIconUrl(),
                scaledSize: new window.google.maps.Size(48, 48),
                anchor: new window.google.maps.Point(24, 24)
              }}
              zIndex={1000}
            />
          )}
        </GoogleMap>
      </div>

      <div className="relative z-10 pointer-events-none">
        <div className="p-6 md:p-8 flex flex-col gap-4 pointer-events-auto">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glassmorphism rounded-xl p-6 w-full max-w-md"
          >
            <h1 
              className="text-3xl font-black mb-2" 
              style={{ fontFamily: 'Chivo, sans-serif', color: '#f8fafc', letterSpacing: '-0.025em' }}
              data-testid="app-title"
            >
              Journey Mapper
            </h1>
            <p className="text-sm mb-6" style={{ color: '#94a3b8', fontFamily: 'Inter, sans-serif' }}>
              Create animated travel routes
            </p>

            <div className="space-y-3 mb-6">
              <AnimatePresence>
                {destinations.map((dest, index) => (
                  <motion.div
                    key={dest.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="flex items-center gap-2"
                  >
                    <div 
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" 
                      style={{ backgroundColor: getTransportColor(), color: '#020617', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', fontWeight: 'bold' }}
                    >
                      {index + 1}
                    </div>
                    <Input
                      id={`destination-input-${dest.id}`}
                      placeholder="Enter location..."
                      className="flex-1"
                      style={{ backgroundColor: '#0f172a', borderColor: 'rgba(255,255,255,0.1)', color: '#f8fafc' }}
                      data-testid={`destination-input-${index}`}
                    />
                    {destinations.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeDestination(dest.id)}
                        style={{ color: '#94a3b8' }}
                        data-testid={`remove-destination-${index}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <Button
              onClick={addDestination}
              variant="outline"
              className="w-full mb-4"
              style={{ borderColor: getTransportColor(), color: getTransportColor() }}
              data-testid="add-destination-btn"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Destination
            </Button>

            <Button
              onClick={calculateRoute}
              className="w-full"
              style={{ backgroundColor: getTransportColor(), color: '#020617' }}
              data-testid="calculate-route-btn"
            >
              Calculate Route
            </Button>
          </motion.div>
        </div>

        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 pointer-events-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glassmorphism rounded-full px-6 py-3 flex items-center gap-6"
          >
            {transportModes.map((mode) => {
              const Icon = mode.icon;
              const isSelected = selectedTransport === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => setSelectedTransport(mode.id)}
                  className="flex flex-col items-center gap-1 transition-all duration-300 hover:scale-110"
                  style={{
                    color: isSelected ? mode.color : '#94a3b8',
                    filter: isSelected ? `drop-shadow(0 0 8px ${mode.color}80)` : 'none',
                  }}
                  data-testid={`transport-${mode.id}`}
                >
                  <Icon className="w-6 h-6" />
                  <span className="text-xs" style={{ fontFamily: 'Inter, sans-serif' }}>{mode.label}</span>
                </button>
              );
            })}
          </motion.div>
        </div>

        <div className="absolute bottom-8 right-8 pointer-events-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glassmorphism rounded-xl px-6 py-4 flex items-center gap-4"
          >
            {!isAnimating ? (
              <Button
                onClick={startAnimation}
                size="icon"
                disabled={routePaths.length === 0}
                style={{ backgroundColor: getTransportColor(), color: '#020617' }}
                data-testid="play-animation-btn"
              >
                <Play className="w-5 h-5" />
              </Button>
            ) : (
              <Button
                onClick={pauseAnimation}
                size="icon"
                style={{ backgroundColor: getTransportColor(), color: '#020617' }}
                data-testid="pause-animation-btn"
              >
                <Pause className="w-5 h-5" />
              </Button>
            )}
            
            <Button
              onClick={downloadAnimation}
              size="icon"
              disabled={routePaths.length === 0 || isRecording}
              variant="outline"
              style={{ borderColor: getTransportColor(), color: getTransportColor() }}
              data-testid="download-animation-btn"
            >
              {isRecording ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
            </Button>

            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: '#94a3b8', fontFamily: 'JetBrains Mono, monospace' }}>Speed:</span>
              <select
                value={animationSpeed}
                onChange={(e) => setAnimationSpeed(Number(e.target.value))}
                className="text-xs px-2 py-1 rounded"
                style={{ backgroundColor: '#0f172a', borderColor: 'rgba(255,255,255,0.1)', color: '#f8fafc', fontFamily: 'JetBrains Mono, monospace' }}
                data-testid="animation-speed-select"
              >
                <option value="0.5">0.5x</option>
                <option value="1">1x</option>
                <option value="2">2x</option>
                <option value="3">3x</option>
              </select>
            </div>

            {animationProgress > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: '#94a3b8', fontFamily: 'JetBrains Mono, monospace' }}>
                  {Math.round(animationProgress)}%
                </span>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default RouteBuilder;