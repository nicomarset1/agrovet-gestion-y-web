// Rastro de huellas sobre una línea punteada: el detalle de marca de los encabezados oscuros.
// Decorativo (aria-hidden). Al cargar, las huellas aparecen una tras otra siguiendo el camino.
const steps = [
  { x: 92, y: 150, r: 62 },
  { x: 168, y: 118, r: 48 },
  { x: 250, y: 104, r: 76 },
  { x: 334, y: 82, r: 58 },
  { x: 418, y: 72, r: 84 },
  { x: 500, y: 48, r: 64 },
];

function Paw({ r, x, y }: { r: number; x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) translate(-10 -10)`}>
      <ellipse cx="10" cy="13.2" rx="4.9" ry="4.1" />
      <ellipse cx="4.1" cy="7.8" rx="1.8" ry="2.3" />
      <ellipse cx="7.9" cy="4.6" rx="1.8" ry="2.4" />
      <ellipse cx="12.1" cy="4.6" rx="1.8" ry="2.4" />
      <ellipse cx="15.9" cy="7.8" rx="1.8" ry="2.3" />
    </g>
  );
}

export function PawTrail({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={`paw-trail ${className}`} focusable="false" viewBox="0 0 600 200">
      <path className="paw-trail-line" d="M-10 196 C 90 170, 150 128, 250 112 S 420 86, 470 58 S 560 18, 620 8" />
      <g className="paw-trail-steps">
        {steps.map((step, index) => (
          <g className="paw-trail-step" key={index} style={{ animationDelay: `${180 + index * 110}ms` }}>
            <Paw {...step} />
          </g>
        ))}
      </g>
    </svg>
  );
}
