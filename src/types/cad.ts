export interface GeometryData {
  dimX: number; // in mm
  dimY: number; // in mm
  dimZ: number; // in mm
  volumeCm3: number; // in cm³
  surfaceAreaCm2: number; // in cm²
  estimatedMassGrams: number; // in grams
  overhangPercentage: number; // % of surface area requiring support
  criticalOverhangCount: number; // number of faces exceeding angle
  totalFaces: number;
  footprintAreaMm2: number; // X * Y base footprint
  center: [number, number, number];
  min: [number, number, number];
  max: [number, number, number];
}

export interface FilamentOption {
  id: string;
  name: string;
  category: string;
  density: number; // g/cm³
  nozzleTemp: number; // °C
  bedTemp: number; // °C
  chamberTemp?: number;
  enclosureRequired: boolean;
  hardenedNozzleRequired: boolean;
  color: string;
  description: string;
}

export interface PrinterEcosystem {
  id: string;
  brand: string;
  popularModels: string[];
  bedX: number;
  bedY: number;
  bedZ: number;
  slicerName: string;
  enclosedDefault: boolean;
}

export type FunctionalIntent =
  | 'Mechanical / Structural'
  | 'Decorative / Display'
  | 'Flexible / Gasket'
  | 'High-Temp / Enclosure';

export interface HardwareBOMItem {
  item: string;
  quantity: string;
  type: string;
  notes: string;
}

export interface SlicingProfile {
  recommendedLayerHeight: string;
  wallPerimeters: string;
  topBottomLayers: string;
  infillPattern: string;
  infillDensity: string;
  supportType: string;
  supportThresholdAngle: string;
  bedAdhesion: string;
  printOrientation: string;
  coolingAndSpeedNotes: string;
}

export interface GeneratedSpec {
  title: string;
  pitch: string;
  tags: string[];
  slicingProfile: SlicingProfile;
  assemblyManual: string;
  hardwareBOM: HardwareBOMItem[];
  estimatedPrintTimeHours: string;
  compatibilityNotes: string;
}

export interface ViewportSnapshot {
  viewName: string;
  label: string;
  dataUrl: string;
}

export interface MeshComponent {
  id: string;
  name: string;
  fileName: string;
  fileSize: number;
  format: 'stl' | '3mf' | 'step' | 'procedural';
  geometry: any; // THREE.BufferGeometry
  color: string;
  visible: boolean;
  position: [number, number, number];
  assembledPosition?: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  originalGeometry?: any;
  isTransformed?: boolean;
}

export interface CADProject {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  timestamp: number;
  geometry: GeometryData;
  components?: MeshComponent[];
  settings: {
    printerEcosystem: string;
    targetPrinter: string;
    filament: string;
    filamentDensity: number;
    nozzleTemp: number;
    bedTemp: number;
    functionalIntent: FunctionalIntent;
    nozzleDiameter: string;
    infillTarget: number;
    userNotes: string;
  };
  spec: GeneratedSpec | null;
  snapshots: ViewportSnapshot[];
}

export type ModificationType =
  | 'chamfer'
  | 'teardrop_hole'
  | 'gusset_rib'
  | 'gothic_arch'
  | 'sacrificial_bridge'
  | 'reorientation'
  | 'split_body';

export interface OverhangRegion {
  id: string;
  name: string;
  type: ModificationType;
  areaMm2: number;
  faceCount: number;
  centroid: [number, number, number];
  boundingBox: {
    min: [number, number, number];
    max: [number, number, number];
    size: [number, number, number];
  };
  elevationMm: number; // distance above lowest point (bed)
  avgOverhangAngleDeg: number;
  severity: 'low' | 'moderate' | 'critical' | 'extreme';
  suggestedModification: {
    title: string;
    description: string;
    cadTechnique: string;
    cadSteps: {
      tool: string;
      action: string;
      parameterValue: string;
    }[];
    materialSpecificNote: string;
    estimatedSavingsPercent: number; // % reduction in support needs
  };
}

export interface OrientationAlternative {
  name: string;
  axis: 'X' | 'Y' | 'Z';
  degrees: number;
  rotationEuler: [number, number, number]; // [rotX, rotY, rotZ] in radians
  rotationDegrees: [number, number, number];
  overhangAreaMm2: number;
  criticalOverhangFaces: number;
  overhangPercentage: number;
  supportVolumeCm3: number;
  bedContactAreaMm2: number;
  maxHeightMm: number;
  stabilityScore: number; // 0 - 100
  isRecommended: boolean;
  savingsVsCurrent: number; // % support reduction
}

export interface SupportFreeAnalysisResult {
  feasibilityScore: number; // 0 - 100 (100 = completely support-free ready)
  rating: 'Fully Support-Free' | 'Minor Tweaks Needed' | 'Moderate Supports Needed' | 'Heavy Supports Required';
  totalOverhangAreaMm2: number;
  overhangRatio: number; // overhangArea / totalArea
  estimatedSupportVolumeCm3: number;
  estimatedSupportFilamentGrams: number;
  estimatedExtraPrintTimeMinutes: number;
  regions: OverhangRegion[];
  orientations: OrientationAlternative[];
  bestOrientation: OrientationAlternative;
  materialConsiderations: {
    filamentName: string;
    bridgingRating: 'Excellent' | 'Good' | 'Moderate' | 'Poor';
    recommendedMaxOverhangAngle: number;
    sagRisk: 'Low' | 'Medium' | 'High';
    coolingNotes: string;
  };
  summaryAdvice: string;
}

