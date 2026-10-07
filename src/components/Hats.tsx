// Hats Flicky can wear. Drawn in Flicky's own coordinates (the card's top edge
// is y=16, centred on x=64), so they tilt with the body. Flat fills and the
// same ink outline as the forehead bolt.

const INK = 'var(--mascot-ink, #191f33)';
const line = { stroke: INK, strokeWidth: 2, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

export function Hat({ id }: { id: string }) {
  switch (id) {
    case 'hat-party':
      return (
        <g {...line}>
          <path d="M50 20 66 -16 82 20z" fill="#ff7aa8" />
          <path d="M56 8h20M61 -3h11" fill="none" stroke="#fff" strokeWidth="3" />
          <circle cx="66" cy="-17" r="5" fill="#ffd23f" />
        </g>
      );
    case 'hat-beanie':
      return (
        <g {...line}>
          <path d="M40 18Q42 -8 66 -8Q90 -8 92 18z" fill="#4cc9f0" />
          <rect x="37" y="12" width="58" height="10" rx="5" fill="#3a9fc2" />
          <circle cx="66" cy="-11" r="6" fill="#fff" />
        </g>
      );
    case 'hat-grad':
      return (
        <g {...line}>
          <path d="M48 6h36v14H48z" fill="#2b2d42" />
          <path d="M30 2 66 -10 102 2 66 14z" fill="#2b2d42" />
          <path d="M66 2 96 5v14" fill="none" stroke="#ffd23f" strokeWidth="2.5" />
          <circle cx="96" cy="21" r="3" fill="#ffd23f" />
        </g>
      );
    case 'hat-headphones':
      return (
        <g {...line}>
          <path d="M32 46Q28 -2 66 -2Q104 -2 100 46" fill="none" stroke="#2b2d42" strokeWidth="6" />
          <rect x="24" y="36" width="14" height="24" rx="6" fill="#ff5d5d" />
          <rect x="94" y="36" width="14" height="24" rx="6" fill="#ff5d5d" />
        </g>
      );
    case 'hat-wizard':
      return (
        <g {...line}>
          <path d="M44 18 70 -22Q76 -26 80 -20L76 -14 88 18z" fill="#5b4bd6" />
          <ellipse cx="66" cy="19" rx="32" ry="6" fill="#4a3cc0" />
          <path d="M60 4l1.5 3.5 3.5 1.5-3.5 1.5L60 14l-1.5-3.5L55 9l3.5-1.5z" fill="#ffd23f" strokeWidth="1" />
          <circle cx="74" cy="-4" r="2" fill="#ffd23f" strokeWidth="1" />
        </g>
      );
    case 'hat-tophat':
      return (
        <g {...line}>
          <rect x="50" y="-16" width="32" height="34" rx="3" fill="#2b2d42" />
          <rect x="50" y="6" width="32" height="7" fill="#ff5d5d" />
          <rect x="40" y="15" width="52" height="7" rx="3.5" fill="#2b2d42" />
        </g>
      );
    case 'hat-viking':
      return (
        <g {...line}>
          <path d="M44 16Q30 10 28 -8Q38 4 48 6z" fill="#fff8e7" />
          <path d="M88 16Q102 10 104 -8Q94 4 84 6z" fill="#fff8e7" />
          <path d="M42 20Q42 -6 66 -6Q90 -6 90 20z" fill="#b8c0cc" />
          <rect x="40" y="14" width="52" height="8" rx="3" fill="#8a6a43" />
          <circle cx="66" cy="3" r="3" fill="#ffd23f" strokeWidth="1.5" />
        </g>
      );
    case 'hat-crown':
      return (
        <g {...line}>
          <path d="M44 20V-4l11 10 11-16 11 16 11-10v24z" fill="#ffd23f" />
          <circle cx="66" cy="12" r="3.5" fill="#ff5d5d" strokeWidth="1.5" />
          <circle cx="53" cy="13" r="2.5" fill="#4cc9f0" strokeWidth="1.5" />
          <circle cx="79" cy="13" r="2.5" fill="#4cc9f0" strokeWidth="1.5" />
        </g>
      );
    case 'hat-halo':
      return <ellipse cx="66" cy="0" rx="24" ry="6.5" fill="none" stroke="#ffd23f" strokeWidth="5" />;
    case 'hat-laurel':
      return (
        <g {...line} strokeWidth="1.5">
          {[-1, 1].map((side) =>
            [0, 1, 2, 3, 4].map((i) => {
              const a = (Math.PI * (0.95 - i * 0.14));
              const x = 66 + side * Math.cos(a) * -30;
              const y = 22 - Math.sin(a) * 26;
              return <ellipse key={`${side}${i}`} cx={x} cy={y} rx="4.5" ry="8" fill={i % 2 ? '#34a853' : '#5cc977'} transform={`rotate(${side * (i * 22 - 20)} ${x} ${y})`} />;
            }),
          )}
          <circle cx="66" cy="-3" r="3" fill="#ffd23f" />
        </g>
      );
    case 'hat-cap':
      return (
        <g {...line}>
          <path d="M80 16Q100 12 108 18L82 22z" fill="#d63d3d" />
          <path d="M42 20Q42 -4 64 -4Q86 -4 86 20z" fill="#ff5d5d" />
          <circle cx="64" cy="-4" r="2.5" fill="#d63d3d" />
        </g>
      );
    case 'hat-bow':
      return (
        <g {...line}>
          <path d="M82 14 68 4v20zM82 14l14-10v20z" fill="#ff7aa8" />
          <circle cx="82" cy="14" r="4" fill="#ff4f8b" />
        </g>
      );
    case 'hat-flowers':
      return (
        <g {...line} strokeWidth="1.5">
          <path d="M34 20Q66 6 98 20" fill="none" stroke="#34a853" strokeWidth="3" />
          {[
            [38, 15, '#ff7aa8'],
            [52, 10, '#ffd23f'],
            [66, 8, '#ff7aa8'],
            [80, 10, '#a78bfa'],
            [94, 15, '#ffd23f'],
          ].map(([x, y, c]) => (
            <g key={x as number}>
              <circle cx={x as number} cy={y as number} r="6" fill={c as string} />
              <circle cx={x as number} cy={y as number} r="2" fill="#fff" />
            </g>
          ))}
        </g>
      );
    case 'hat-chef':
      return (
        <g {...line}>
          <path d="M48 18V4Q38 2 40 -8Q44 -18 54 -12Q58 -22 68 -18Q78 -24 82 -12Q94 -14 92 -4Q92 4 84 4V18z" fill="#fff" />
          <rect x="47" y="12" width="38" height="9" rx="2" fill="#eef0fa" />
        </g>
      );
    case 'hat-cowboy':
      return (
        <g {...line}>
          <path d="M50 14Q48 -12 66 -8Q84 -12 82 14z" fill="#b5793f" />
          <path d="M26 12Q40 24 66 22Q92 24 106 12Q100 22 66 26Q32 22 26 12z" fill="#8f5a2b" />
          <rect x="50" y="6" width="32" height="5" fill="#5c3a1c" />
        </g>
      );
    case 'hat-pirate':
      return (
        <g {...line}>
          <path d="M32 20Q36 -8 66 -10Q96 -8 100 20Q66 10 32 20z" fill="#2b2d42" />
          <circle cx="66" cy="4" r="5" fill="#fff" strokeWidth="1.5" />
          <path d="M60 12l12-4M60 8l12 4" stroke="#fff" strokeWidth="2" />
        </g>
      );
    default:
      return null;
  }
}
