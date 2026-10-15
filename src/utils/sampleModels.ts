import * as THREE from 'three';
import { MeshComponent } from '../types/cad';
import { orientAndGroundGeometry } from './fileLoader';

export interface SampleModelDefinition {
  id: string;
  name: string;
  category: string;
  suggestedFilament: string;
  intent: 'Mechanical / Structural' | 'Decorative / Display' | 'Flexible / Gasket' | 'High-Temp / Enclosure';
  description: string;
  generate: () => THREE.BufferGeometry;
  generateComponents?: () => MeshComponent[];
}

/**
 * Builds a procedural Gridfinity 2x2 Bin with Magnet Base Pockets and Stacking Lip.
 * Dimensions: ~84 x 84 x 36 mm
 */
function createGridfinityBinGeometry(): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];

  // Outer bin walls
  const outerWidth = 83.5;
  const outerDepth = 83.5;
  const outerHeight = 35;
  const wallThickness = 2.4;
  const baseHeight = 6;

  // Base platform
  const baseGeo = new THREE.BoxGeometry(outerWidth - 2, outerDepth - 2, baseHeight);
  baseGeo.translate(0, 0, baseHeight / 2);
  geometries.push(baseGeo);

  // Main body
  const bodyHeight = outerHeight - baseHeight;
  const bodyGeo = new THREE.BoxGeometry(outerWidth, outerDepth, bodyHeight);
  bodyGeo.translate(0, 0, baseHeight + bodyHeight / 2);
  geometries.push(bodyGeo);

  // Stacking lip rim on top
  const rimHeight = 4.5;
  const rimGeo = new THREE.BoxGeometry(outerWidth - 1.2, outerDepth - 1.2, rimHeight);
  rimGeo.translate(0, 0, outerHeight + rimHeight / 2);
  geometries.push(rimGeo);

  // 4 Corner magnet pockets at bottom
  const magnetRadius = 3.25; // 6.5mm diameter pocket for 6x2mm magnet
  const magnetDepth = 2.8;
  const cornerOffset = (outerWidth / 2) - 8;

  const offsets = [
    [-cornerOffset, -cornerOffset],
    [cornerOffset, -cornerOffset],
    [-cornerOffset, cornerOffset],
    [cornerOffset, cornerOffset],
  ];

  offsets.forEach(([cx, cy]) => {
    const bossGeo = new THREE.CylinderGeometry(magnetRadius + 2.5, magnetRadius + 2.5, baseHeight + 2, 16);
    bossGeo.rotateX(Math.PI / 2);
    bossGeo.translate(cx, cy, (baseHeight + 2) / 2);
    geometries.push(bossGeo);
  });

  // Center divider wall
  const dividerGeo = new THREE.BoxGeometry(wallThickness, outerDepth - 6, bodyHeight);
  dividerGeo.translate(0, 0, baseHeight + bodyHeight / 2);
  geometries.push(dividerGeo);

  // Merge geometries manually into single BufferGeometry
  return mergeBufferGeometries(geometries);
}

/**
 * Builds a procedural Heavy-Duty Cable Drag Chain Link.
 * Features: Snap pivot joints, cable hollow passage, overhang bridge.
 * Dimensions: ~45 x 25 x 18 mm
 */
function createDragChainLinkGeometry(): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];

  // Central link body
  const linkLength = 42;
  const linkWidth = 26;
  const linkHeight = 16;
  const wall = 3.0;

  // Side walls
  const side1 = new THREE.BoxGeometry(linkLength, wall, linkHeight);
  side1.translate(0, -linkWidth / 2 + wall / 2, linkHeight / 2);
  geometries.push(side1);

  const side2 = new THREE.BoxGeometry(linkLength, wall, linkHeight);
  side2.translate(0, linkWidth / 2 - wall / 2, linkHeight / 2);
  geometries.push(side2);

  // Top crossbar bridge (creates realistic overhang bridging)
  const topCross = new THREE.BoxGeometry(18, linkWidth, wall);
  topCross.translate(0, 0, linkHeight - wall / 2);
  geometries.push(topCross);

  // Bottom crossbar
  const bottomCross = new THREE.BoxGeometry(18, linkWidth, wall);
  bottomCross.translate(0, 0, wall / 2);
  geometries.push(bottomCross);

  // Male pivot pins on one end
  const pinRadius = 3.5;
  const pinLength = 5.0;
  const pin1 = new THREE.CylinderGeometry(pinRadius, pinRadius, pinLength, 16);
  pin1.rotateZ(Math.PI / 2);
  pin1.translate(linkLength / 2 - 2, -linkWidth / 2 - pinLength / 2 + 1, linkHeight / 2);
  geometries.push(pin1);

  const pin2 = new THREE.CylinderGeometry(pinRadius, pinRadius, pinLength, 16);
  pin2.rotateZ(Math.PI / 2);
  pin2.translate(linkLength / 2 - 2, linkWidth / 2 + pinLength / 2 - 1, linkHeight / 2);
  geometries.push(pin2);

  // Female pivot socket bosses on other end
  const bossRadius = 6.0;
  const boss1 = new THREE.CylinderGeometry(bossRadius, bossRadius, wall + 1, 16);
  boss1.rotateX(Math.PI / 2);
  boss1.translate(-linkLength / 2 + 5, -linkWidth / 2 + wall / 2, linkHeight / 2);
  geometries.push(boss1);

  const boss2 = new THREE.CylinderGeometry(bossRadius, bossRadius, wall + 1, 16);
  boss2.rotateX(Math.PI / 2);
  boss2.translate(-linkLength / 2 + 5, linkWidth / 2 - wall / 2, linkHeight / 2);
  geometries.push(boss2);

  return mergeBufferGeometries(geometries);
}

/**
 * Builds a procedural Voron Extruder Mount & Strain Relief.
 * Features: M3 screw bosses, heat-set insert pockets, cable zip-tie anchor.
 * Dimensions: ~55 x 48 x 28 mm
 */
function createExtruderMountGeometry(): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];

  // Main mounting backplate
  const plateWidth = 52;
  const plateHeight = 44;
  const plateThick = 5.0;
  const plate = new THREE.BoxGeometry(plateWidth, plateHeight, plateThick);
  plate.translate(0, 0, plateThick / 2);
  geometries.push(plate);

  // Stepper motor flange ring
  const flangeOuter = 21;
  const flangeThick = 6;
  const flange = new THREE.CylinderGeometry(flangeOuter, flangeOuter, flangeThick, 24);
  flange.rotateX(Math.PI / 2);
  flange.translate(0, 0, plateThick + flangeThick / 2);
  geometries.push(flange);

  // 4 NEMA 14/17 M3 mounting corner bosses (Heat-set insert bosses)
  const bossDistance = 15.5;
  const bossR = 4.5;
  const bossH = 8.0;

  const bossPositions = [
    [-bossDistance, -bossDistance],
    [bossDistance, -bossDistance],
    [-bossDistance, bossDistance],
    [bossDistance, bossDistance],
  ];

  bossPositions.forEach(([bx, by]) => {
    const boss = new THREE.CylinderGeometry(bossR, bossR, bossH, 16);
    boss.rotateX(Math.PI / 2);
    boss.translate(bx, by, plateThick + bossH / 2);
    geometries.push(boss);
  });

  // Cable strain relief arm extending out
  const armLength = 22;
  const armWidth = 14;
  const armHeight = 6;
  const arm = new THREE.BoxGeometry(armWidth, armLength, armHeight);
  arm.translate(plateWidth / 2 - armWidth / 2, plateHeight / 2 + armLength / 2 - 2, armHeight / 2);
  geometries.push(arm);

  // Cable tie bridge
  const bridge = new THREE.BoxGeometry(armWidth + 2, 4, 10);
  bridge.translate(plateWidth / 2 - armWidth / 2, plateHeight / 2 + armLength - 4, 5);
  geometries.push(bridge);

  return mergeBufferGeometries(geometries);
}

/**
 * Builds a procedural Low-Poly Geometric Desk Planter / Hex Container.
 * Features: Faceted 45°-60° geometric overhang angles, hollow drainage pocket.
 * Dimensions: ~68 x 68 x 52 mm
 */
function createLowPolyPlanterGeometry(): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];

  // Faceted vase geometry created with multiple angled cones and cylinders
  const baseRadius = 24;
  const midRadius = 36;
  const topRadius = 30;
  const height = 50;

  // Lower inverted tapered cone (tests critical overhangs!)
  const lowerGeo = new THREE.CylinderGeometry(midRadius, baseRadius, height * 0.45, 8);
  lowerGeo.rotateX(Math.PI / 2);
  lowerGeo.translate(0, 0, (height * 0.45) / 2);
  geometries.push(lowerGeo);

  // Upper inward tapered section
  const upperGeo = new THREE.CylinderGeometry(topRadius, midRadius, height * 0.55, 8);
  upperGeo.rotateX(Math.PI / 2);
  upperGeo.translate(0, 0, height * 0.45 + (height * 0.55) / 2);
  geometries.push(upperGeo);

  // Outer decorative faceted ribs
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI * 2) / 8;
    const ribGeo = new THREE.BoxGeometry(3, 8, height * 0.7);
    ribGeo.rotateZ(angle);
    const rx = Math.cos(angle) * (midRadius - 2);
    const ry = Math.sin(angle) * (midRadius - 2);
    ribGeo.translate(rx, ry, height / 2);
    geometries.push(ribGeo);
  }

  return mergeBufferGeometries(geometries);
}

/**
 * Helper to combine multiple Three.js BufferGeometries into a single unified BufferGeometry.
 */
function mergeBufferGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const nonIndexedGeos = geometries.map((geo) => (geo.index ? geo.toNonIndexed() : geo));

  let totalVertices = 0;
  nonIndexedGeos.forEach((geo) => {
    totalVertices += geo.attributes.position.count;
  });

  const mergedPositions = new Float32Array(totalVertices * 3);
  let offset = 0;

  nonIndexedGeos.forEach((geo) => {
    const pos = geo.attributes.position.array;
    mergedPositions.set(pos, offset);
    offset += pos.length;
  });

  const mergedGeometry = new THREE.BufferGeometry();
  mergedGeometry.setAttribute('position', new THREE.BufferAttribute(mergedPositions, 3));
  mergedGeometry.computeVertexNormals();

  // Center on Z=0 base for natural 3D print bed placement
  mergedGeometry.computeBoundingBox();
  if (mergedGeometry.boundingBox) {
    const minZ = mergedGeometry.boundingBox.min.z;
    mergedGeometry.translate(0, 0, -minZ);
  }

  return mergedGeometry;
}

/**
 * Procedural Multi-Component Assembly: Heavy-Duty C-Clamp Assembly
 * 3 Distinct interlocking parts:
 * 1. Base C-Frame with mounting anvil
 * 2. Sliding Pressure Jaw
 * 3. Drive Screw with Knurled Turning Knob
 */
function createModularClampAssembly(): {
  geometry: THREE.BufferGeometry;
  components: MeshComponent[];
} {
  // Part 1: C-Frame
  const frameGeos: THREE.BufferGeometry[] = [];
  // Spine
  const spine = new THREE.BoxGeometry(16, 20, 80);
  spine.translate(-22, 0, 40);
  frameGeos.push(spine);
  // Top Arm (Anvil)
  const topArm = new THREE.BoxGeometry(50, 20, 16);
  topArm.translate(0, 0, 72);
  frameGeos.push(topArm);
  const anvil = new THREE.CylinderGeometry(8, 8, 8, 16);
  anvil.rotateX(Math.PI / 2);
  anvil.translate(16, 0, 60);
  frameGeos.push(anvil);
  // Bottom Arm with threaded collar
  const bottomArm = new THREE.BoxGeometry(50, 20, 16);
  bottomArm.translate(0, 0, 8);
  frameGeos.push(bottomArm);
  const collar = new THREE.CylinderGeometry(11, 11, 20, 20);
  collar.rotateX(Math.PI / 2);
  collar.translate(16, 0, 8);
  frameGeos.push(collar);

  const frameMerged = mergeBufferGeometries(frameGeos);
  orientAndGroundGeometry(frameMerged);

  // Part 2: Sliding Pressure Jaw Pad
  const jawGeos: THREE.BufferGeometry[] = [];
  const pad = new THREE.CylinderGeometry(12, 10, 6, 24);
  pad.rotateX(Math.PI / 2);
  pad.translate(0, 0, 3);
  jawGeos.push(pad);
  const socket = new THREE.CylinderGeometry(6, 6, 8, 16);
  socket.rotateX(Math.PI / 2);
  socket.translate(0, 0, -4);
  jawGeos.push(socket);

  const jawMerged = mergeBufferGeometries(jawGeos);
  orientAndGroundGeometry(jawMerged);

  // Part 3: Threaded Drive Screw & Turning Knob
  const screwGeos: THREE.BufferGeometry[] = [];
  // Threaded shaft
  const shaft = new THREE.CylinderGeometry(5.5, 5.5, 65, 20);
  shaft.rotateX(Math.PI / 2);
  shaft.translate(0, 0, 32.5);
  screwGeos.push(shaft);
  // Ball tip for jaw socket
  const ball = new THREE.SphereGeometry(5.2, 16, 16);
  ball.translate(0, 0, 65);
  screwGeos.push(ball);
  // Knurled knob handle
  const knob = new THREE.CylinderGeometry(14, 14, 16, 24);
  knob.rotateX(Math.PI / 2);
  knob.translate(0, 0, -4);
  screwGeos.push(knob);
  // Cross pin for extra torque
  const pin = new THREE.CylinderGeometry(3.5, 3.5, 42, 16);
  pin.translate(0, 0, -4);
  screwGeos.push(pin);

  const screwMerged = mergeBufferGeometries(screwGeos);
  orientAndGroundGeometry(screwMerged);

  // Assembled positions in CAD space
  const comp1: MeshComponent = {
    id: 'clamp-c-frame',
    name: 'Clamp C-Frame Body',
    fileName: 'Clamp_C_Frame.stl',
    fileSize: 1024 * 54,
    format: 'stl',
    geometry: frameMerged,
    originalGeometry: frameMerged.clone(),
    color: '#06b6d4', // Cyan
    visible: true,
    position: [0, 0, 0],
    assembledPosition: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };

  const comp2: MeshComponent = {
    id: 'clamp-sliding-jaw',
    name: 'Movable Pressure Jaw Pad',
    fileName: 'Pressure_Jaw_Pad.stl',
    fileSize: 1024 * 22,
    format: 'stl',
    geometry: jawMerged,
    originalGeometry: jawMerged.clone(),
    color: '#f59e0b', // Amber
    visible: true,
    position: [16, 0, 42],
    assembledPosition: [16, 0, 42],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };

  const comp3: MeshComponent = {
    id: 'clamp-lead-screw',
    name: 'Threaded Drive Screw & Knob',
    fileName: 'Drive_Lead_Screw.stl',
    fileSize: 1024 * 38,
    format: 'stl',
    geometry: screwMerged,
    originalGeometry: screwMerged.clone(),
    color: '#a855f7', // Purple
    visible: true,
    position: [16, 0, -10],
    assembledPosition: [16, 0, -10],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };

  const components = [comp1, comp2, comp3];

  // Build composite geometry with component positions baked in
  const compGeos = components.map((c) => {
    const geo = c.geometry.clone();
    geo.translate(c.position[0], c.position[1], c.position[2]);
    return geo;
  });
  const mergedAll = mergeBufferGeometries(compGeos);
  orientAndGroundGeometry(mergedAll);

  return {
    geometry: mergedAll,
    components,
  };
}

export const SAMPLE_MODELS: SampleModelDefinition[] = [
  {
    id: 'modular_clamp_assembly',
    name: 'Modular 3-Piece Clamp Assembly',
    category: 'Multi-Part CAD Assembly',
    suggestedFilament: 'PETG / Tough PLA',
    intent: 'Mechanical / Structural',
    description: 'Complete 3-component mechanical assembly: Rigid C-Frame, Swivel Pressure Jaw, and Threaded Drive Screw with Knob.',
    generate: () => createModularClampAssembly().geometry,
    generateComponents: () => createModularClampAssembly().components,
  },
  {
    id: 'gridfinity_bin',
    name: 'Gridfinity 2x2x3 Modular Storage Bin',
    category: 'Organization / Workshop',
    suggestedFilament: 'PLA (Polylactic Acid)',
    intent: 'Mechanical / Structural',
    description: 'Standardized 42mm grid system bin with stacking lip and 4x 6x2mm magnet base cavities.',
    generate: createGridfinityBinGeometry,
  },
  {
    id: 'drag_chain',
    name: 'Heavy-Duty Cable Drag Chain Link',
    category: '3D Printer Upgrade / Motion',
    suggestedFilament: 'PETG',
    intent: 'Mechanical / Structural',
    description: 'Interlocking articulated wire conduit link with snap-fit male/female pivot trunnions.',
    generate: createDragChainLinkGeometry,
  },
  {
    id: 'voron_extruder_mount',
    name: 'Voron Toolhead Mount & Strain Relief',
    category: 'High-Performance 3D Printing',
    suggestedFilament: 'ABS / ASA',
    intent: 'High-Temp / Enclosure',
    description: 'Precision stepper backplate featuring M3 brass heat-set insert pockets and umbilical zip-tie anchor.',
    generate: createExtruderMountGeometry,
  },
  {
    id: 'faceted_planter',
    name: 'Low-Poly Geometric Desk Planter',
    category: 'Home / Decor / Overhang Benchmark',
    suggestedFilament: 'PLA (Polylactic Acid)',
    intent: 'Decorative / Display',
    description: 'Angular faceted vessel with varying 40° to 60° overhang planes and drainage basin.',
    generate: createLowPolyPlanterGeometry,
  },
];
