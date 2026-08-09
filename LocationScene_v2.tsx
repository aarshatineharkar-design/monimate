// Uses sample/preview images from Kenney packs as location backgrounds
// Each location crops a different section of the image

interface LocationConfig {
  image: string;
  positionX: string;
  positionY: string;
  zoom: string;
  label: string;
  tint: string;
  icon: string;
}

const LOCATION_CONFIG: Record<string, LocationConfig> = {
  home: {
    image: '/tiles/base-sample.png',
    positionX: '50%',
    positionY: '50%',
    zoom: '200%',
    label: 'Home',
    tint: 'rgba(26,26,46,0.45)',
    icon: '🏠',
  },
  school: {
    image: '/tiles/urban-sample.png',
    positionX: '30%',
    positionY: '20%',
    zoom: '250%',
    label: 'School',
    tint: 'rgba(26,26,46,0.4)',
    icon: '🏫',
  },
  dairy: {
    image: '/tiles/urban-sample.png',
    positionX: '70%',
    positionY: '60%',
    zoom: '280%',
    label: 'The Dairy',
    tint: 'rgba(26,26,46,0.4)',
    icon: '🏪',
  },
  mall: {
    image: '/tiles/urban-sample.png',
    positionX: '50%',
    positionY: '40%',
    zoom: '220%',
    label: 'The Mall',
    tint: 'rgba(26,26,46,0.35)',
    icon: '🛍️',
  },
  library: {
    image: '/tiles/base-sample.png',
    positionX: '30%',
    positionY: '30%',
    zoom: '180%',
    label: 'Library',
    tint: 'rgba(26,26,46,0.5)',
    icon: '📚',
  },
  cafe: {
    image: '/tiles/urban-sample.png',
    positionX: '10%',
    positionY: '70%',
    zoom: '300%',
    label: 'Café',
    tint: 'rgba(60,30,10,0.4)',
    icon: '☕',
  },
  stationery: {
    image: '/tiles/urban-sample.png',
    positionX: '90%',
    positionY: '30%',
    zoom: '280%',
    label: 'Stationery Shop',
    tint: 'rgba(26,26,46,0.4)',
    icon: '📎',
  },
};

const DEFAULT_CONFIG: LocationConfig = {
  image: '/tiles/urban-sample.png',
  positionX: '50%',
  positionY: '50%',
  zoom: '200%',
  label: 'Outside',
  tint: 'rgba(26,26,46,0.35)',
  icon: '🌳',
};

export default function LocationScene({ location, weather = 'sunny' }: { location: string; weather?: string }) {
  const config = LOCATION_CONFIG[location] || DEFAULT_CONFIG;

  return (
    <div className="relative w-full overflow-hidden rounded-xl" style={{ height: 160 }}>
      {/* Background image */}
      <div className="absolute inset-0" style={{
        backgroundImage: `url(${config.image})`,
        backgroundPosition: `${config.positionX} ${config.positionY}`,
        backgroundSize: config.zoom,
        backgroundRepeat: 'no-repeat',
        imageRendering: 'pixelated',
        filter: 'brightness(1.1) contrast(1.05)',
      }} />

      {/* Tint overlay */}
      <div className="absolute inset-0" style={{ background: config.tint }} />

      {/* Weather effects */}
      {weather === 'rainy' && (
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0" style={{
            background: 'repeating-linear-gradient(transparent, transparent 2px, rgba(150,200,255,0.1) 2px, rgba(150,200,255,0.1) 3px)',
            animation: 'rain 0.4s linear infinite',
          }} />
          <div className="absolute inset-0" style={{
            background: 'rgba(80,100,140,0.15)',
          }} />
        </div>
      )}

      {weather === 'cloudy' && (
        <div className="absolute inset-0" style={{
          background: 'rgba(60,70,90,0.15)',
        }} />
      )}

      {/* Location icon and label */}
      <div className="absolute bottom-2.5 left-3 flex items-center gap-2">
        <div className="px-2.5 py-1 rounded-lg flex items-center gap-1.5" style={{
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(4px)',
        }}>
          <span className="text-base">{config.icon}</span>
          <span className="text-[11px] font-bold tracking-wider uppercase" style={{ color: '#f0c038' }}>
            {config.label}
          </span>
        </div>
      </div>

      {/* Time-of-day ambient light effect */}
      <div className="absolute top-2.5 right-3">
        <span className="text-lg">
          {weather === 'rainy' ? '🌧️' : weather === 'cloudy' ? '☁️' : '☀️'}
        </span>
      </div>

      <style>{`
        @keyframes rain {
          0% { transform: translateY(0); }
          100% { transform: translateY(3px); }
        }
      `}</style>
    </div>
  );
}
