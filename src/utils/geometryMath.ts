import * as THREE from 'three';
import { GeometryData } from '../types/cad';

/**
 * Computes precision geometric metadata directly from a Three.js BufferGeometry:
 * - Bounding box (X, Y, Z in mm)
 * - Volume (cm³) using signed tetrahedron integration
 * - Surface area (cm²)
 * - Overhang analysis (> threshold angle from horizontal)
 * - Estimated mass (grams)
 */
export function computeGeometryData(
  geometry: THREE.BufferGeometry,
  filamentDensityGcm3: number = 1.24,
  overhangThresholdDeg: number = 45,
  upAxis: 'Y' | 'Z' = 'Z'
): GeometryData {
  // Ensure bounding box and normals exist
  geometry.computeBoundingBox();
  if (!geometry.attributes.normal) {
    geometry.computeVertexNormals();
  }

  const bbox = geometry.boundingBox || new THREE.Box3();
  const size = new THREE.Vector3();
  bbox.getSize(size);

  const center = new THREE.Vector3();
  bbox.getCenter(center);

  const posAttr = geometry.attributes.position;
  const indexAttr = geometry.index;

  let totalVolumeMm3 = 0;
  let totalAreaMm2 = 0;
  let overhangAreaMm2 = 0;
  let criticalOverhangCount = 0;
  let faceCount = 0;

  // Vectors for calculation
  const p1 = new THREE.Vector3();
  const p2 = new THREE.Vector3();
  const p3 = new THREE.Vector3();
  const edge1 = new THREE.Vector3();
  const edge2 = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();
  const cross = new THREE.Vector3();

  // Downward unit vector depending on convention
  const downVector = upAxis === 'Z' ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, -1, 0);

  // In 3D printing: A surface inclined more than 45° from vertical (or less than 45° from horizontal facing down)
  // Downward facing if faceNormal.dot(downVector) > 0.
  // For 45°: cos(45°) = 0.7071. If faceNormal.dot(downVector) >= cos(rad(90 - thresholdDeg)):
  const criticalCos = Math.cos(THREE.MathUtils.degToRad(90 - overhangThresholdDeg));

  const numTriangles = indexAttr ? indexAttr.count / 3 : posAttr.count / 3;

  for (let i = 0; i < numTriangles; i++) {
    faceCount++;

    let i1: number, i2: number, i3: number;
    if (indexAttr) {
      i1 = indexAttr.getX(i * 3);
      i2 = indexAttr.getX(i * 3 + 1);
      i3 = indexAttr.getX(i * 3 + 2);
    } else {
      i1 = i * 3;
      i2 = i * 3 + 1;
      i3 = i * 3 + 2;
    }

    p1.fromBufferAttribute(posAttr, i1);
    p2.fromBufferAttribute(posAttr, i2);
    p3.fromBufferAttribute(posAttr, i3);

    // Signed tetrahedron volume = (p1 . (p2 x p3)) / 6
    cross.crossVectors(p2, p3);
    const tetraVolume = p1.dot(cross) / 6.0;
    totalVolumeMm3 += tetraVolume;

    // Face area = 0.5 * |(p2 - p1) x (p3 - p1)|
    edge1.subVectors(p2, p1);
    edge2.subVectors(p3, p1);
    faceNormal.crossVectors(edge1, edge2);
    const area = faceNormal.length() * 0.5;
    totalAreaMm2 += area;

    if (area > 0) {
      faceNormal.normalize();
      const dotDown = faceNormal.dot(downVector);

      // If pointing downward and exceeding overhang threshold
      if (dotDown > criticalCos) {
        criticalOverhangCount++;
        overhangAreaMm2 += area;
      }
    }
  }

  // Handle potential inverted winding or non-watertight mesh
  totalVolumeMm3 = Math.abs(totalVolumeMm3);

  // Fallback sanity check for volume:
  const bboxVolumeMm3 = size.x * size.y * size.z;
  if (totalVolumeMm3 < 0.0001 && bboxVolumeMm3 > 0) {
    totalVolumeMm3 = bboxVolumeMm3 * 0.35;
  }

  const volumeCm3 = totalVolumeMm3 / 1000.0;
  const surfaceAreaCm2 = totalAreaMm2 / 100.0;
  const overhangPercentage = totalAreaMm2 > 0 ? (overhangAreaMm2 / totalAreaMm2) * 100 : 0;
  const estimatedMassGrams = volumeCm3 * filamentDensityGcm3;

  const footprintAreaMm2 = upAxis === 'Z' ? size.x * size.y : size.x * size.z;

  return {
    dimX: size.x,
    dimY: size.y,
    dimZ: size.z,
    volumeCm3,
    surfaceAreaCm2,
    estimatedMassGrams,
    overhangPercentage,
    criticalOverhangCount,
    totalFaces: faceCount,
    footprintAreaMm2,
    center: [center.x, center.y, center.z],
    min: [bbox.min.x, bbox.min.y, bbox.min.z],
    max: [bbox.max.x, bbox.max.y, bbox.max.z],
  };
}

/**
 * Creates a geometry with custom vertex colors highlighting overhang faces.
 * Overhang faces (> threshold) are colored bright red/crimson.
 * Safe faces are colored technical slate/steel cyan.
 */
export function generateOverhangColoredGeometry(
  sourceGeometry: THREE.BufferGeometry,
  overhangThresholdDeg: number = 45,
  upAxis: 'Y' | 'Z' = 'Z'
): THREE.BufferGeometry {
  const nonIndexed = sourceGeometry.index ? sourceGeometry.toNonIndexed() : sourceGeometry.clone();
  nonIndexed.computeVertexNormals();

  const posAttr = nonIndexed.attributes.position;
  const count = posAttr.count;
  const colors = new Float32Array(count * 3);

  const downVector = upAxis === 'Z' ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, -1, 0);
  const criticalCos = Math.cos(THREE.MathUtils.degToRad(90 - overhangThresholdDeg));

  const p1 = new THREE.Vector3();
  const p2 = new THREE.Vector3();
  const p3 = new THREE.Vector3();
  const edge1 = new THREE.Vector3();
  const edge2 = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();

  // Colors
  const safeColor = new THREE.Color('#38bdf8'); // sky blue
  const mildOverhangColor = new THREE.Color('#fbbf24'); // amber
  const criticalOverhangColor = new THREE.Color('#ef4444'); // bright crimson red
  const extremeOverhangColor = new THREE.Color('#be123c'); // deep ruby (flat ceiling)

  for (let i = 0; i < count; i += 3) {
    p1.fromBufferAttribute(posAttr, i);
    p2.fromBufferAttribute(posAttr, i + 1);
    p3.fromBufferAttribute(posAttr, i + 2);

    edge1.subVectors(p2, p1);
    edge2.subVectors(p3, p1);
    faceNormal.crossVectors(edge1, edge2).normalize();

    const dotDown = faceNormal.dot(downVector);

    let assignedColor = safeColor;

    if (dotDown > criticalCos) {
      if (dotDown > 0.95) {
        assignedColor = extremeOverhangColor;
      } else if (dotDown > 0.8) {
        assignedColor = criticalOverhangColor;
      } else {
        assignedColor = mildOverhangColor;
      }
    }

    for (let j = 0; j < 3; j++) {
      const idx = (i + j) * 3;
      colors[idx] = assignedColor.r;
      colors[idx + 1] = assignedColor.g;
      colors[idx + 2] = assignedColor.b;
    }
  }

  nonIndexed.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return nonIndexed;
}

export interface SuccessScoreResult {
  score: number; // 0 - 100% confidence score
  grade: 'A+' | 'A' | 'B' | 'C' | 'D';
  ratingLabel: string;
  overhangPenalty: number;
  volumePenalty: number;
  complexityPenalty: number;
  overhangRatio: number; // critical faces / total faces (0 to 1)
  overhangPercentageOfFaces: number; // %
  boundingBoxComplexity: number; // index 0 - 1
  packingEfficiency: number; // volume / bboxVolume
  aspectRatio: number; // maxDim / minDim
  summaryText: string;
}

/**
 * Computes a 0-100% confidence score based on:
 * 1. Model Volume (cm³): penalizes massive thermal shrinkage risk and ultra-fragile micro-volumes.
 * 2. Bounding Box Complexity: evaluates void ratio (packing efficiency) and aspect ratio elongation.
 * 3. Ratio of Faces Exceeding Overhang Threshold: critical overhang count relative to total mesh faces.
 */
export function calculateSuccessScore(
  geometryOrVolume: GeometryData | number,
  bboxDimensionsParam?: { x: number; y: number; z: number } | [number, number, number],
  criticalOverhangFacesParam?: number,
  totalFacesParam?: number
): SuccessScoreResult {
  let volumeCm3: number;
  let dimX: number, dimY: number, dimZ: number;
  let criticalOverhangFaces: number;
  let totalFaces: number;

  if (typeof geometryOrVolume === 'object' && 'volumeCm3' in geometryOrVolume) {
    const g = geometryOrVolume as GeometryData;
    volumeCm3 = g.volumeCm3;
    dimX = g.dimX;
    dimY = g.dimY;
    dimZ = g.dimZ;
    criticalOverhangFaces = g.criticalOverhangCount;
    totalFaces = g.totalFaces;
  } else {
    volumeCm3 = geometryOrVolume;
    if (Array.isArray(bboxDimensionsParam)) {
      [dimX, dimY, dimZ] = bboxDimensionsParam;
    } else if (bboxDimensionsParam) {
      dimX = bboxDimensionsParam.x;
      dimY = bboxDimensionsParam.y;
      dimZ = bboxDimensionsParam.z;
    } else {
      dimX = 50;
      dimY = 50;
      dimZ = 50;
    }
    criticalOverhangFaces = criticalOverhangFacesParam || 0;
    totalFaces = totalFacesParam || 1;
  }

  // 1. Ratio of faces exceeding the overhang threshold
  const safeTotalFaces = Math.max(1, totalFaces);
  const overhangRatio = Math.max(0, Math.min(1, criticalOverhangFaces / safeTotalFaces));
  const overhangPercentageOfFaces = overhangRatio * 100;

  // Overhang Penalty (up to -38 points)
  let overhangPenalty = 0;
  if (overhangRatio <= 0.02) {
    overhangPenalty = 0; // Self-supporting
  } else if (overhangRatio <= 0.08) {
    overhangPenalty = Math.round((overhangRatio - 0.02) * 100 * 0.9);
  } else if (overhangRatio <= 0.20) {
    overhangPenalty = Math.round(5 + (overhangRatio - 0.08) * 100 * 1.2);
  } else if (overhangRatio <= 0.35) {
    overhangPenalty = Math.round(19 + (overhangRatio - 0.20) * 100 * 0.9);
  } else {
    overhangPenalty = Math.min(38, Math.round(32 + (overhangRatio - 0.35) * 100 * 0.4));
  }

  // 2. Model Volume Penalty (Thermal mass, print duration, warping pull)
  // Optimal volume: 15 - 90 cm³
  let volumePenalty = 0;
  if (volumeCm3 <= 2) {
    volumePenalty = 3; // very delicate micro-features
  } else if (volumeCm3 <= 25) {
    volumePenalty = 1; // ideal rapid prototyping
  } else if (volumeCm3 <= 100) {
    volumePenalty = Math.round(1 + ((volumeCm3 - 25) / 75) * 4);
  } else if (volumeCm3 <= 280) {
    volumePenalty = Math.round(5 + ((volumeCm3 - 100) / 180) * 8);
  } else {
    volumePenalty = Math.min(22, Math.round(13 + ((volumeCm3 - 280) / 300) * 9));
  }

  // 3. Bounding Box Complexity
  // Bounding box volume in cm³
  const bboxVolumeMm3 = Math.max(1, dimX * dimY * dimZ);
  const bboxVolumeCm3 = bboxVolumeMm3 / 1000.0;
  const packingEfficiency = Math.max(0.01, Math.min(1.0, volumeCm3 / Math.max(0.01, bboxVolumeCm3)));

  // Aspect ratio (elongation / thinness)
  const maxDim = Math.max(dimX, dimY, dimZ);
  const minDim = Math.max(1, Math.min(dimX, dimY, dimZ));
  const aspectRatio = maxDim / minDim;

  // Complexity score (0 to 1, where 1 is highly complex/voided/elongated)
  let complexityIndex = 0;
  if (packingEfficiency < 0.2) {
    complexityIndex += 0.5; // highly voided, thin struts or intricate cantilever
  } else if (packingEfficiency < 0.4) {
    complexityIndex += 0.25;
  }

  if (aspectRatio > 3.0) {
    complexityIndex += 0.5; // tall or long aspect ratio, wobble/lift risk
  } else if (aspectRatio > 2.0) {
    complexityIndex += 0.25;
  }

  complexityIndex = Math.min(1.0, complexityIndex);
  const complexityPenalty = Math.round(complexityIndex * 18);

  // 4. Calculate Final 0-100% Confidence Score
  const baseScore = 100;
  const rawScore = baseScore - overhangPenalty - volumePenalty - complexityPenalty;
  const finalScore = Math.max(15, Math.min(100, Math.round(rawScore)));

  // Determine Letter Grade and Presentation Status
  let grade: 'A+' | 'A' | 'B' | 'C' | 'D' = 'A';
  let ratingLabel = 'High Confidence';

  if (finalScore >= 92) {
    grade = 'A+';
    ratingLabel = 'Exceptional Printability (Plug & Play)';
  } else if (finalScore >= 82) {
    grade = 'A';
    ratingLabel = 'High Success Confidence (Standard Slicing)';
  } else if (finalScore >= 70) {
    grade = 'B';
    ratingLabel = 'Moderate Confidence (Supports / Brim Advised)';
  } else if (finalScore >= 55) {
    grade = 'C';
    ratingLabel = 'Challenging Geometry (Tuning Required)';
  } else {
    grade = 'D';
    ratingLabel = 'High Failure Risk (Reorientation Needed)';
  }

  const summaryText = `${finalScore}% confidence score computed from volume (${volumeCm3.toFixed(1)} cm³), bbox complexity (${(complexityIndex * 100).toFixed(0)}%), and ${(overhangPercentageOfFaces).toFixed(1)}% critical overhang face ratio.`;

  return {
    score: finalScore,
    grade,
    ratingLabel,
    overhangPenalty,
    volumePenalty,
    complexityPenalty,
    overhangRatio,
    overhangPercentageOfFaces,
    boundingBoxComplexity: complexityIndex,
    packingEfficiency,
    aspectRatio,
    summaryText,
  };
}
