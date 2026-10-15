import { CADProject, ViewportSnapshot } from '../types/cad';

/**
 * Generates a high-quality SVG data URI render for catalog sample preview
 */
function createSampleRenderDataUrl(name: string, color: string, type: 'iso' | 'top' | 'front'): string {
  const isIso = type === 'iso';
  const isTop = type === 'top';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0f172a" />
        <stop offset="100%" stop-color="#090d16" />
      </linearGradient>
      <linearGradient id="partGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${color}" />
        <stop offset="100%" stop-color="#0284c7" />
      </linearGradient>
      <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="8" stdDeviation="6" flood-color="#000000" flood-opacity="0.6"/>
      </filter>
    </defs>
    <rect width="400" height="300" fill="url(#bg)"/>
    <g stroke="#334155" stroke-width="0.8" opacity="0.3">
      <line x1="50" y1="230" x2="350" y2="230" />
      <line x1="80" y1="210" x2="320" y2="210" />
      <line x1="110" y1="190" x2="290" y2="190" />
    </g>
    <g filter="url(#shadow)">
      ${
        isIso
          ? `<polygon points="200,90 280,135 200,180 120,135" fill="url(#partGrad)" opacity="0.9" stroke="#38bdf8" stroke-width="1.5"/>
             <polygon points="120,135 200,180 200,240 120,195" fill="${color}" opacity="0.7" stroke="#38bdf8" stroke-width="1"/>
             <polygon points="200,180 280,135 280,195 200,240" fill="${color}" opacity="0.5" stroke="#38bdf8" stroke-width="1"/>
             <circle cx="200" cy="135" r="18" fill="#0f172a" stroke="#38bdf8" stroke-width="1.2"/>`
          : isTop
          ? `<rect x="130" y="80" width="140" height="140" rx="8" fill="url(#partGrad)" opacity="0.8" stroke="#38bdf8" stroke-width="1.5"/>
             <rect x="150" y="100" width="100" height="100" rx="4" fill="#090d16" stroke="#0ea5e9" stroke-width="1"/>
             <circle cx="200" cy="150" r="14" fill="${color}" opacity="0.6"/>`
          : `<rect x="140" y="100" width="120" height="110" rx="6" fill="url(#partGrad)" opacity="0.8" stroke="#38bdf8" stroke-width="1.5"/>
             <path d="M140 140 L260 140" stroke="#090d16" stroke-width="4"/>
             <rect x="160" y="150" width="80" height="50" rx="2" fill="#090d16"/>`
      }
    </g>
    <text x="20" y="32" font-family="monospace" font-size="11" fill="#38bdf8" font-weight="bold">CAD-TAGGER VIEWPORT // ${type.toUpperCase()}</text>
    <text x="20" y="275" font-family="sans-serif" font-size="12" fill="#94a3b8">${name}</text>
  </svg>`;

  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export const INITIAL_CATALOG_PROJECTS: CADProject[] = [
  {
    id: 'proj_gridfinity_bin',
    fileName: 'Gridfinity_2x2x3_Storage_Bin.stl',
    fileSize: 1024 * 72,
    fileType: 'stl',
    timestamp: Date.now() - 1000 * 60 * 60 * 2, // 2 hours ago
    geometry: {
      volumeCm3: 48.6,
      estimatedMassGrams: 60.2,
      dimX: 83.5,
      dimY: 83.5,
      dimZ: 38.0,
      footprintAreaMm2: 6972,
      totalFaces: 4120,
      criticalOverhangCount: 68,
      overhangPercentage: 1.65,
      bounds: {
        min: [-41.75, -41.75, 0],
        max: [41.75, 41.75, 38.0],
      },
    },
    settings: {
      printerEcosystem: 'Bambu Lab',
      targetPrinter: 'Bambu Lab X1-Carbon / P1S',
      filament: 'PLA (Polylactic Acid)',
      filamentDensity: 1.24,
      nozzleTemp: 220,
      bedTemp: 55,
      functionalIntent: 'Mechanical / Structural',
      nozzleDiameter: '0.4mm',
      infillTarget: 15,
      userNotes: 'Gridfinity standard workshop organizer bin with 4x bottom magnet cavities.',
    },
    snapshots: [
      {
        viewName: 'isometric_view',
        label: 'Isometric 3D Perspective',
        dataUrl: createSampleRenderDataUrl('Gridfinity 2x2x3 Storage Bin', '#06b6d4', 'iso'),
      },
      {
        viewName: 'top_plan_view',
        label: 'Top Stacking Rim View',
        dataUrl: createSampleRenderDataUrl('Gridfinity 2x2x3 Storage Bin', '#06b6d4', 'top'),
      },
      {
        viewName: 'front_elevation_view',
        label: 'Front Base Profile View',
        dataUrl: createSampleRenderDataUrl('Gridfinity 2x2x3 Storage Bin', '#06b6d4', 'front'),
      },
    ],
    spec: {
      title: 'Gridfinity 2x2 Modular Workshop Bin (38mm Height)',
      pitch: 'Standardized 42mm modular organization container engineered for high-density hardware storage with magnet locking base.',
      tags: [
        '#gridfinity',
        '#workshop',
        '#organization',
        '#storage',
        '#bambu',
        '#makerworld',
        '#3dprinting',
        '#tools',
        '#functional3d',
      ],
      slicingProfile: {
        recommendedLayerHeight: '0.20mm Standard',
        wallPerimeters: '3 Walls (1.2mm shell)',
        topBottomLayers: '4 Top / 4 Bottom',
        infillPattern: 'Gyroid @ 15%',
        infillDensity: '15%',
        supportType: 'None (100% self-supporting 45° chamfers)',
        supportThresholdAngle: 'N/A',
        bedAdhesion: 'Textured PEI plate, no brim required',
        printOrientation: 'Base flat on build plate (Z-up)',
        coolingAndSpeedNotes: '100% part cooling fan after layer 3; Outer wall 120mm/s, Infill 250mm/s.',
      },
      assemblyManual: `1. Ensure print bed has completely cooled to room temperature before lifting part to prevent base warping.
2. Inspect the 4 corner underside pockets for any small debris.
3. Press-fit 4x 6x2mm neodymium magnets into the corner pockets (verify magnetic polarity with your baseplate).
4. A dab of medium-viscosity CA glue ensures permanent magnet retention.`,
      hardwareBOM: [
        {
          item: '6x2mm Neodymium Disk Magnets (N52)',
          quantity: '4',
          type: 'Fastener / Magnet',
          notes: 'Press-fit into base cavities for click-lock adhesion',
        },
      ],
      estimatedPrintTimeHours: '2h 15m',
      compatibilityNotes: 'Fully compatible with all Zack Freedman Gridfinity baseplates and stacking modules.',
    },
  },
  {
    id: 'proj_drag_chain_link',
    fileName: 'Heavy_Duty_Cable_Drag_Chain_Link.stl',
    fileSize: 1024 * 54,
    fileType: 'stl',
    timestamp: Date.now() - 1000 * 60 * 60 * 5, // 5 hours ago
    geometry: {
      volumeCm3: 16.4,
      estimatedMassGrams: 20.8,
      dimX: 45.0,
      dimY: 28.0,
      dimZ: 22.5,
      footprintAreaMm2: 1260,
      totalFaces: 2840,
      criticalOverhangCount: 42,
      overhangPercentage: 1.48,
      bounds: {
        min: [-22.5, -14.0, 0],
        max: [22.5, 14.0, 22.5],
      },
    },
    settings: {
      printerEcosystem: 'Prusa Research',
      targetPrinter: 'Original Prusa MK4 / Core One',
      filament: 'PETG',
      filamentDensity: 1.27,
      nozzleTemp: 240,
      bedTemp: 85,
      functionalIntent: 'Mechanical / Structural',
      nozzleDiameter: '0.4mm',
      infillTarget: 30,
      userNotes: 'Interlocking articulated cable conduit link with snap-fit male/female pivot trunnions.',
    },
    snapshots: [
      {
        viewName: 'isometric_view',
        label: 'Isometric Articulation View',
        dataUrl: createSampleRenderDataUrl('Cable Drag Chain Link', '#38bdf8', 'iso'),
      },
      {
        viewName: 'side_view',
        label: 'Pivot Radius Profile',
        dataUrl: createSampleRenderDataUrl('Cable Drag Chain Link', '#38bdf8', 'front'),
      },
    ],
    spec: {
      title: 'Heavy-Duty Articulating Cable Drag Chain (Snap-Fit)',
      pitch: 'Durable, print-in-place compatible modular wiring conduit link with integrated 45-degree minimum bend radius stop.',
      tags: [
        '#dragchain',
        '#cablemanagement',
        '#3dprinterupgrade',
        '#prusa',
        '#voron',
        '#cnc',
        '#functionalprint',
      ],
      slicingProfile: {
        recommendedLayerHeight: '0.20mm Structural',
        wallPerimeters: '4 Walls (1.6mm thickness for trunnion strength)',
        topBottomLayers: '5 Top / 5 Bottom',
        infillPattern: 'Grid / Gyroid @ 30%',
        infillDensity: '30%',
        supportType: 'None (designed with teardrop pivot pins)',
        supportThresholdAngle: '50°',
        bedAdhesion: 'Smooth or Satin PEI sheet with glue stick release agent',
        printOrientation: 'Side flank flat on build plate',
        coolingAndSpeedNotes: '40% part cooling fan for optimal layer bonding and flexural fatigue resistance.',
      },
      assemblyManual: `1. Snap male trunnion pivot lugs into female receiver holes of adjacent links with firm finger pressure.
2. Route stepper and thermistor wire looms through the center pass-through canal.
3. Test flexing arc through 90 degrees before fastening ends to the gantry mount.`,
      hardwareBOM: [
        {
          item: 'M3x8mm Socket Head Cap Screw',
          quantity: '2',
          type: 'Hardware',
          notes: 'Anchor link terminus to gantry bracket',
        },
      ],
      estimatedPrintTimeHours: '48m per link',
      compatibilityNotes: 'Modular chain links chain indefinitely. Suitable for X/Y umbilical cable runs.',
    },
  },
  {
    id: 'proj_voron_mount',
    fileName: 'Voron_Stealthburner_Umbilical_Mount.stl',
    fileSize: 1024 * 88,
    fileType: 'stl',
    timestamp: Date.now() - 1000 * 60 * 60 * 24, // 1 day ago
    geometry: {
      volumeCm3: 32.8,
      estimatedMassGrams: 34.4,
      dimX: 62.0,
      dimY: 54.0,
      dimZ: 26.0,
      footprintAreaMm2: 2480,
      totalFaces: 5120,
      criticalOverhangCount: 95,
      overhangPercentage: 1.85,
      bounds: {
        min: [-31.0, -27.0, 0],
        max: [31.0, 27.0, 26.0],
      },
    },
    settings: {
      printerEcosystem: 'Voron Design',
      targetPrinter: 'Voron 2.4 / Trident (350mm)',
      filament: 'ABS / ASA',
      filamentDensity: 1.05,
      nozzleTemp: 255,
      bedTemp: 105,
      functionalIntent: 'High-Temp / Enclosure',
      nozzleDiameter: '0.4mm',
      infillTarget: 40,
      userNotes: 'High-temperature toolhead umbilical wire strain relief featuring M3 brass heatset pockets.',
    },
    snapshots: [
      {
        viewName: 'isometric_view',
        label: 'Isometric Heatset Mount View',
        dataUrl: createSampleRenderDataUrl('Voron Umbilical Mount', '#f59e0b', 'iso'),
      },
      {
        viewName: 'top_pocket_view',
        label: 'Brass Insert Cavities View',
        dataUrl: createSampleRenderDataUrl('Voron Umbilical Mount', '#f59e0b', 'top'),
      },
    ],
    spec: {
      title: 'Voron Toolhead Strain Relief & Umbilical Cable Mount',
      pitch: 'Chamber-rated ABS/ASA stepper backplate with heat-set brass threaded inserts and zip-tie anchor slots.',
      tags: [
        '#voron',
        '#voron24',
        '#stealthburner',
        '#umbilical',
        '#abs',
        '#asa',
        '#heatset',
        '#3dprintermod',
      ],
      slicingProfile: {
        recommendedLayerHeight: '0.20mm',
        wallPerimeters: '4 Walls (1.6mm)',
        topBottomLayers: '5 Top / 5 Bottom',
        infillPattern: 'Grid / Gyroid @ 40%',
        infillDensity: '40%',
        supportType: 'Tree Supports on rear cable anchor hook',
        supportThresholdAngle: '45°',
        bedAdhesion: 'Textured PEI @ 105°C in enclosed chamber',
        printOrientation: 'Mounting face flat to build bed',
        coolingAndSpeedNotes: '20-30% fan max to prevent ABS layer delamination. Chamber temp 50°C+ recommended.',
      },
      assemblyManual: `1. Using a soldering iron with a dedicated heat-set tip set to 260°C, gently press 4x M3x4x5mm brass threaded inserts flush with the printed surface.
2. Fasten mount to the stepper motor face using 2x M3x12mm button head screws.
3. Secure the silicone umbilical harness using a 2.5mm high-temp nylon zip tie through the strain-relief slot.`,
      hardwareBOM: [
        {
          item: 'M3x4x5mm Brass Heat-Set Threaded Inserts',
          quantity: '4',
          type: 'Fastener / Insert',
          notes: 'Thermally installed with soldering iron',
        },
        {
          item: 'M3x12mm Button Head Cap Screws',
          quantity: '2',
          type: 'Fastener',
          notes: 'Grade 12.9 black oxide',
        },
        {
          item: '2.5mm High-Temp Cable Zip Ties',
          quantity: '2',
          type: 'Cable Management',
          notes: 'Nylon 6/6 rated for 105°C',
        },
      ],
      estimatedPrintTimeHours: '1h 35m',
      compatibilityNotes: 'Engineered specifically for NEMA14/NEMA17 pancake stepper motors on Voron toolheads.',
    },
  },
];
