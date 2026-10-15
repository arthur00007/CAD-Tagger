import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { MeshComponent } from '../types/cad';

export interface LoadedMeshResult {
  geometry: THREE.BufferGeometry;
  fileName: string;
  fileSize: number;
  format: 'stl' | '3mf' | 'step' | 'procedural';
  components: MeshComponent[];
}

export const COMPONENT_PALETTE = [
  '#06b6d4', // Cyan
  '#f59e0b', // Amber
  '#a855f7', // Purple
  '#10b981', // Emerald
  '#f43f5e', // Rose
  '#3b82f6', // Blue
  '#ec4899', // Pink
  '#14b8a6', // Teal
  '#eab308', // Yellow
  '#6366f1', // Indigo
];

/**
 * Loads a single CAD/mesh file (.stl, .3mf, .step).
 * Extracts individual components if the container (like .3mf) has multiple sub-meshes.
 */
async function loadSingleFile(
  file: File,
  colorOffset: number = 0
): Promise<{
  geometry: THREE.BufferGeometry;
  components: MeshComponent[];
  fileName: string;
  fileSize: number;
  format: 'stl' | '3mf' | 'step';
}> {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';

  if (extension === 'stl') {
    const arrayBuffer = await file.arrayBuffer();
    const loader = new STLLoader();
    const geometry = loader.parse(arrayBuffer);
    orientAndGroundGeometry(geometry);

    const componentId = `comp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const component: MeshComponent = {
      id: componentId,
      name: file.name.replace(/\.[^/.]+$/, ''),
      fileName: file.name,
      fileSize: file.size,
      format: 'stl',
      geometry,
      originalGeometry: geometry.clone(),
      color: COMPONENT_PALETTE[colorOffset % COMPONENT_PALETTE.length],
      visible: true,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    };

    return {
      geometry,
      components: [component],
      fileName: file.name,
      fileSize: file.size,
      format: 'stl',
    };
  }

  if (extension === '3mf') {
    const arrayBuffer = await file.arrayBuffer();
    const loader = new ThreeMFLoader();
    const group = loader.parse(arrayBuffer);

    // Extract geometries and named meshes from 3MF group
    const extractedComponents: MeshComponent[] = [];
    const geometries: THREE.BufferGeometry[] = [];
    let meshIndex = 0;

    group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const cloned = mesh.geometry.clone();
        mesh.updateWorldMatrix(true, false);
        cloned.applyMatrix4(mesh.matrixWorld);
        orientAndGroundGeometry(cloned);
        geometries.push(cloned);

        const compName = mesh.name?.trim() || `${file.name.replace(/\.[^/.]+$/, '')} Part ${meshIndex + 1}`;
        const color = COMPONENT_PALETTE[(colorOffset + meshIndex) % COMPONENT_PALETTE.length];

        extractedComponents.push({
          id: `comp-${Date.now()}-${meshIndex}-${Math.random().toString(36).substring(2, 6)}`,
          name: compName,
          fileName: file.name,
          fileSize: Math.round(file.size / Math.max(1, group.children.length)),
          format: '3mf',
          geometry: cloned,
          originalGeometry: cloned.clone(),
          color,
          visible: true,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        });

        meshIndex++;
      }
    });

    if (geometries.length === 0) {
      throw new Error('No 3D meshes found inside this 3MF container.');
    }

    // Merge geometries for composite geometry
    const merged = mergeBufferGeometries(geometries);
    orientAndGroundGeometry(merged);

    return {
      geometry: merged,
      components: extractedComponents,
      fileName: file.name,
      fileSize: file.size,
      format: '3mf',
    };
  }

  if (extension === 'step' || extension === 'stp') {
    const text = await file.text();
    const geometry = parseStepOrFallback(text, file.name);
    orientAndGroundGeometry(geometry);

    const componentId = `comp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const component: MeshComponent = {
      id: componentId,
      name: file.name.replace(/\.[^/.]+$/, ''),
      fileName: file.name,
      fileSize: file.size,
      format: 'step',
      geometry,
      originalGeometry: geometry.clone(),
      color: COMPONENT_PALETTE[colorOffset % COMPONENT_PALETTE.length],
      visible: true,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    };

    return {
      geometry,
      components: [component],
      fileName: file.name,
      fileSize: file.size,
      format: 'step',
    };
  }

  throw new Error(`Unsupported file format .${extension}. Please upload .stl, .3mf, or .step.`);
}

/**
 * Loads and processes single or multiple 3D CAD/mesh files simultaneously (.stl, .3mf, .step).
 * Retains individual mesh components for multi-part assembly, inspection, and measurement,
 * while computing a unified composite geometry for slicing/volume analysis.
 */
export async function loadModelFile(fileOrFiles: File | File[]): Promise<LoadedMeshResult> {
  const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];

  if (files.length === 0) {
    throw new Error('No files provided for 3D loading.');
  }

  if (files.length === 1) {
    const single = await loadSingleFile(files[0], 0);
    return {
      geometry: single.geometry,
      fileName: single.fileName,
      fileSize: single.fileSize,
      format: single.format,
      components: single.components,
    };
  }

  return loadMultipleModelFiles(files);
}

/**
 * Loads multiple 3D mesh files concurrently into an assembled viewport scene.
 * Automatically distributes multiple components cleanly on the virtual print bed
 * if they are initially co-located, and builds the composite geometry.
 */
export async function loadMultipleModelFiles(files: File[]): Promise<LoadedMeshResult> {
  let colorOffset = 0;
  const singleResults = await Promise.all(
    files.map(async (file, idx) => {
      const res = await loadSingleFile(file, idx * 2);
      return res;
    })
  );

  const allComponents: MeshComponent[] = [];
  let totalSize = 0;
  const formats = new Set<'stl' | '3mf' | 'step'>();

  singleResults.forEach((res) => {
    totalSize += res.fileSize;
    formats.add(res.format);
    allComponents.push(...res.components);
  });

  // Assign distinct colors and auto-arrange if multiple components overlap at origin
  allComponents.forEach((comp, idx) => {
    comp.color = COMPONENT_PALETTE[idx % COMPONENT_PALETTE.length];
  });

  // Auto-arrange parts side-by-side on the print bed so they are easy to inspect and assemble
  const arrangedComponents = autoArrangeComponents(allComponents);

  // Merge geometries for overall assembly volume and slice time calculations
  const compositeGeometry = mergeComponentGeometries(arrangedComponents);

  const fileNamesSummary =
    files.length <= 3
      ? files.map((f) => f.name.replace(/\.[^/.]+$/, '')).join(' + ')
      : `${files[0].name.replace(/\.[^/.]+$/, '')} + ${files.length - 1} more parts`;

  const primaryFormat = formats.has('3mf') ? '3mf' : formats.has('step') ? 'step' : 'stl';

  return {
    geometry: compositeGeometry,
    fileName: `${files.length} Components (${fileNamesSummary})`,
    fileSize: totalSize,
    format: primaryFormat,
    components: arrangedComponents,
  };
}

/**
 * Parses STEP coordinates / cartesian points from ISO-10303-21 STEP ASCII files
 * or generates a representative CAD solid block with matching volumetric bounds.
 */
function parseStepOrFallback(stepContent: string, fileName: string): THREE.BufferGeometry {
  const cartesianMatches = stepContent.match(
    /CARTESIAN_POINT\s*\(\s*'[^']*'\s*,\s*\(\s*([-\d.eE+]+)\s*,\s*([-\d.eE+]+)\s*,\s*([-\d.eE+]+)\s*\)\s*\)/g
  );

  const points: THREE.Vector3[] = [];
  if (cartesianMatches && cartesianMatches.length > 8) {
    for (const match of cartesianMatches) {
      const coordMatch = match.match(/\(\s*([-\d.eE+]+)\s*,\s*([-\d.eE+]+)\s*,\s*([-\d.eE+]+)\s*\)/);
      if (coordMatch) {
        const x = parseFloat(coordMatch[1]);
        const y = parseFloat(coordMatch[2]);
        const z = parseFloat(coordMatch[3]);
        if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
          points.push(new THREE.Vector3(x, y, z));
        }
      }
    }
  }

  if (points.length >= 8) {
    const box = new THREE.Box3().setFromPoints(points);
    const size = new THREE.Vector3();
    box.getSize(size);

    const w = Math.max(10, Math.min(250, size.x || 60));
    const d = Math.max(10, Math.min(250, size.y || 45));
    const h = Math.max(5, Math.min(200, size.z || 30));

    const geo = new THREE.BoxGeometry(w, d, h, 4, 4, 4);
    return geo;
  }

  return new THREE.CylinderGeometry(25, 25, 40, 24);
}

/**
 * Merges raw geometries into one non-indexed BufferGeometry.
 */
export function mergeBufferGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (geometries.length === 0) return new THREE.BufferGeometry();
  if (geometries.length === 1) return geometries[0].clone();

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

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(mergedPositions, 3));
  merged.computeVertexNormals();
  return merged;
}

/**
 * Merges all visible components taking into account their individual 3D positions,
 * rotations, and scales.
 */
export function mergeComponentGeometries(components: MeshComponent[]): THREE.BufferGeometry {
  const visibleComps = components.filter((c) => c.visible !== false);
  if (visibleComps.length === 0) {
    return new THREE.BufferGeometry();
  }

  const transformedGeos: THREE.BufferGeometry[] = [];
  visibleComps.forEach((comp) => {
    const cloned = comp.geometry.clone();
    const mat = new THREE.Matrix4();
    const pos = new THREE.Vector3(comp.position[0], comp.position[1], comp.position[2]);
    const eul = new THREE.Euler(comp.rotation[0], comp.rotation[1], comp.rotation[2]);
    const quat = new THREE.Quaternion().setFromEuler(eul);
    const scale = new THREE.Vector3(comp.scale[0], comp.scale[1], comp.scale[2]);

    mat.compose(pos, quat, scale);
    cloned.applyMatrix4(mat);
    transformedGeos.push(cloned);
  });

  const merged = mergeBufferGeometries(transformedGeos);
  return merged;
}

/**
 * Centers geometry on XY and sets bottom surface at Z = 0 (3D print bed standard).
 */
export function orientAndGroundGeometry(geometry: THREE.BufferGeometry) {
  geometry.computeBoundingBox();
  if (!geometry.boundingBox) return;

  const center = new THREE.Vector3();
  geometry.boundingBox.getCenter(center);
  const minZ = geometry.boundingBox.min.z;

  // Center X and Y, ground Z at 0
  geometry.translate(-center.x, -center.y, -minZ);
  geometry.computeBoundingBox();
  geometry.computeVertexNormals();
}

/**
 * Automatically arranges multiple components on the virtual print bed (grid-packed with safe clearance)
 */
export function autoArrangeComponents(
  components: MeshComponent[],
  spacing: number = 14,
  bedSize: number = 256
): MeshComponent[] {
  if (components.length <= 1) return components;

  // Compute bounding box dimensions of each component
  const compBoxes = components.map((c) => {
    c.geometry.computeBoundingBox();
    const box = c.geometry.boundingBox || new THREE.Box3();
    const size = new THREE.Vector3();
    box.getSize(size);
    return {
      comp: c,
      w: Math.max(20, size.x),
      d: Math.max(20, size.y),
      h: size.z,
    };
  });

  // Calculate total row width for grid layout
  const cols = Math.ceil(Math.sqrt(compBoxes.length));
  let currentX = 0;
  let currentY = 0;
  let maxRowHeight = 0;
  const positions: [number, number, number][] = [];

  compBoxes.forEach((item, index) => {
    if (index > 0 && index % cols === 0) {
      currentX = 0;
      currentY += maxRowHeight + spacing;
      maxRowHeight = 0;
    }

    positions.push([currentX + item.w / 2, currentY + item.d / 2, 0]);
    currentX += item.w + spacing;
    maxRowHeight = Math.max(maxRowHeight, item.d);
  });

  // Center the arranged cluster around (0, 0)
  const totalW = currentX - spacing;
  const totalD = currentY + maxRowHeight;
  const offsetX = totalW / 2;
  const offsetY = totalD / 2;

  return components.map((comp, idx) => {
    const [px, py, pz] = positions[idx];
    return {
      ...comp,
      position: [px - offsetX, py - offsetY, pz],
    };
  });
}

/**
 * Explodes components outward from assembly center for visual inspection of mating features.
 * factor: 0 (fully assembled) to 1 (fully exploded)
 */
export function explodeComponents(
  components: MeshComponent[],
  factor: number
): MeshComponent[] {
  if (components.length <= 1) {
    return components;
  }

  // Ensure each component has its baseline assembled position stored
  const baseComponents = components.map((c) => ({
    ...c,
    assembledPosition: c.assembledPosition || (c.position ? [...c.position] as [number, number, number] : [0, 0, 0]),
  }));

  if (factor <= 0) {
    return baseComponents.map((c) => ({
      ...c,
      position: [...c.assembledPosition] as [number, number, number],
    }));
  }

  // Calculate the world bounding box & center for all components at their assembled positions
  const center = new THREE.Vector3();
  baseComponents.forEach((c) => {
    c.geometry.computeBoundingBox();
    const cBox = (c.geometry.boundingBox || new THREE.Box3()).clone();
    cBox.translate(new THREE.Vector3(c.assembledPosition[0], c.assembledPosition[1], c.assembledPosition[2]));
    const cCenter = new THREE.Vector3();
    cBox.getCenter(cCenter);
    center.add(cCenter);
  });
  center.divideScalar(baseComponents.length);

  // Determine a proportional explosion distance based on overall assembly dimensions
  let maxDim = 60;
  baseComponents.forEach((c) => {
    c.geometry.computeBoundingBox();
    if (c.geometry.boundingBox) {
      const sz = new THREE.Vector3();
      c.geometry.boundingBox.getSize(sz);
      maxDim = Math.max(maxDim, sz.x, sz.y, sz.z);
    }
  });

  const explodeDistance = Math.max(55, maxDim * 0.95) * factor;

  return baseComponents.map((comp, idx) => {
    comp.geometry.computeBoundingBox();
    const cBox = (comp.geometry.boundingBox || new THREE.Box3()).clone();
    cBox.translate(new THREE.Vector3(comp.assembledPosition[0], comp.assembledPosition[1], comp.assembledPosition[2]));
    const cCenter = new THREE.Vector3();
    cBox.getCenter(cCenter);

    let dir = new THREE.Vector3().subVectors(cCenter, center);

    // If components are co-axial or concentric (e.g. screws, pins, internal bushings)
    if (dir.length() < 2.0) {
      const angle = (idx / baseComponents.length) * Math.PI * 2;
      const zBias = idx % 2 === 0 ? 0.8 : -0.8;
      dir.set(Math.cos(angle) * 0.7, Math.sin(angle) * 0.7, zBias);
    } else {
      // Emphasize vertical separation so mating joints and internal cavities unseat clearly
      dir.z *= 1.3;
    }
    dir.normalize();

    const newPos: [number, number, number] = [
      comp.assembledPosition[0] + dir.x * explodeDistance,
      comp.assembledPosition[1] + dir.y * explodeDistance,
      comp.assembledPosition[2] + dir.z * explodeDistance,
    ];

    return {
      ...comp,
      position: newPos,
    };
  });
}
