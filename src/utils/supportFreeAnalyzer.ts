import * as THREE from 'three';
import {
  ModificationType,
  OverhangRegion,
  OrientationAlternative,
  SupportFreeAnalysisResult,
} from '../types/cad';

interface ClusterAccumulator {
  indices: number[];
  faceCount: number;
  totalArea: number;
  weightedNormal: THREE.Vector3;
  min: THREE.Vector3;
  max: THREE.Vector3;
  sumPos: THREE.Vector3;
}

/**
 * Evaluates a 3D BufferGeometry for 'support-free' design opportunities (DfAM).
 * Identifies distinct overhang regions, clusters them spatially, determines their
 * geometric characteristics, and suggests precise CAD modifications (Chamfer,
 * Teardrop, Gusset Rib, Gothic Arch, Sacrificial Bridge, Re-orientation) to eliminate supports.
 */
export function analyzeSupportFreeOpportunities(
  geometry: THREE.BufferGeometry,
  filamentDensityGcm3: number = 1.24,
  filamentName: string = 'PLA',
  overhangThresholdDeg: number = 45
): SupportFreeAnalysisResult {
  const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  nonIndexed.computeVertexNormals();
  nonIndexed.computeBoundingBox();

  const bbox = nonIndexed.boundingBox || new THREE.Box3();
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const bedZ = bbox.min.z;

  const posAttr = nonIndexed.attributes.position;
  const count = posAttr.count; // 3 vertices per face

  const downVector = new THREE.Vector3(0, 0, -1);
  const criticalCos = Math.cos(THREE.MathUtils.degToRad(90 - overhangThresholdDeg));

  let totalModelAreaMm2 = 0;
  let totalOverhangAreaMm2 = 0;
  let totalOverhangFaces = 0;

  const p1 = new THREE.Vector3();
  const p2 = new THREE.Vector3();
  const p3 = new THREE.Vector3();
  const edge1 = new THREE.Vector3();
  const edge2 = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();
  const faceCenter = new THREE.Vector3();

  // Grid cluster parameters
  const maxDim = Math.max(size.x, size.y, size.z, 20);
  const cellSize = Math.max(8, maxDim * 0.08); // 8mm - 25mm grid
  const clusterMap = new Map<string, ClusterAccumulator>();

  for (let i = 0; i < count; i += 3) {
    p1.fromBufferAttribute(posAttr, i);
    p2.fromBufferAttribute(posAttr, i + 1);
    p3.fromBufferAttribute(posAttr, i + 2);

    edge1.subVectors(p2, p1);
    edge2.subVectors(p3, p1);
    faceNormal.crossVectors(edge1, edge2);
    const area = faceNormal.length() * 0.5;
    totalModelAreaMm2 += area;

    if (area <= 0.00001) continue;

    faceNormal.normalize();
    const dotDown = faceNormal.dot(downVector);

    // Overhang face detection
    if (dotDown > criticalCos) {
      totalOverhangAreaMm2 += area;
      totalOverhangFaces++;

      // Face center
      faceCenter.copy(p1).add(p2).add(p3).divideScalar(3);

      // Quantized grid key
      const gx = Math.floor(faceCenter.x / cellSize);
      const gy = Math.floor(faceCenter.y / cellSize);
      const gz = Math.floor(faceCenter.z / cellSize);
      const key = `${gx}_${gy}_${gz}`;

      let cluster = clusterMap.get(key);
      if (!cluster) {
        cluster = {
          indices: [],
          faceCount: 0,
          totalArea: 0,
          weightedNormal: new THREE.Vector3(0, 0, 0),
          min: faceCenter.clone(),
          max: faceCenter.clone(),
          sumPos: new THREE.Vector3(0, 0, 0),
        };
        clusterMap.set(key, cluster);
      }

      cluster.indices.push(i);
      cluster.faceCount++;
      cluster.totalArea += area;
      cluster.weightedNormal.addScaledVector(faceNormal, area);
      cluster.min.min(p1).min(p2).min(p3);
      cluster.max.max(p1).max(p2).max(p3);
      cluster.sumPos.addScaledVector(faceCenter, area);
    }
  }

  // Filter significant clusters (> 0.5% of overhang area or > 15 mm²) and sort by area descending
  const rawClusters = Array.from(clusterMap.values())
    .filter((c) => c.totalArea >= 15 || (totalOverhangAreaMm2 > 0 && c.totalArea / totalOverhangAreaMm2 > 0.015))
    .sort((a, b) => b.totalArea - a.totalArea)
    .slice(0, 8); // Top 8 distinct actionable regions

  const regions: OverhangRegion[] = rawClusters.map((c, index) => {
    const centroid = c.sumPos.clone().divideScalar(Math.max(c.totalArea, 0.0001));
    const rSize = new THREE.Vector3().subVectors(c.max, c.min);
    const avgNormal = c.weightedNormal.clone().normalize();
    const dotDown = avgNormal.dot(downVector);
    const overhangAngleDeg = Math.round(THREE.MathUtils.radToDeg(Math.asin(Math.min(1, Math.max(0, dotDown)))));
    const elevationMm = Math.max(0, centroid.z - bedZ);

    // Determine geometry type & modification
    let type: ModificationType = 'chamfer';
    let severity: 'low' | 'moderate' | 'critical' | 'extreme' = 'moderate';

    if (dotDown >= 0.95) {
      severity = 'extreme';
    } else if (dotDown >= 0.8) {
      severity = 'critical';
    } else if (dotDown >= 0.65) {
      severity = 'moderate';
    } else {
      severity = 'low';
    }

    const isFlatCeiling = dotDown >= 0.90;
    const isNarrowSpan = Math.min(rSize.x, rSize.y) < 16;
    const isCircularProfile = Math.abs(rSize.x - rSize.y) < 6 && Math.max(rSize.x, rSize.y) < 22;
    const isElevatedLedge = elevationMm > 12;

    if (isFlatCeiling && isCircularProfile && isNarrowSpan) {
      // Small circular horizontal ceiling or bore hole
      if (elevationMm > 15 && Math.min(rSize.x, rSize.y) <= 8) {
        type = 'sacrificial_bridge';
      } else {
        type = 'teardrop_hole';
      }
    } else if (isElevatedLedge && (rSize.x > 18 || rSize.y > 18) && isFlatCeiling) {
      // Cantilevered overhang shelf/boss
      type = 'gusset_rib';
    } else if (isFlatCeiling && Math.max(rSize.x, rSize.y) > 28) {
      // Broad flat roof/span
      type = 'gothic_arch';
    } else {
      // Linear ledge or steep downward step
      type = 'chamfer';
    }

    // Parametric calculations
    const stepHeight = Math.max(1.5, Math.min(rSize.z, 15));
    const chamferDim = (stepHeight * 0.95).toFixed(1);
    const boreRadius = (Math.max(rSize.x, rSize.y) / 2).toFixed(1);
    const gussetThickness = '2.0 mm';
    const gussetSpacing = (Math.max(12, Math.min(25, Math.max(rSize.x, rSize.y) * 0.4))).toFixed(0);

    const modificationConfig = getModificationDetails(
      type,
      chamferDim,
      boreRadius,
      gussetThickness,
      gussetSpacing,
      filamentName,
      elevationMm
    );

    const regionName = getRegionFriendlyName(type, index + 1, centroid.z - bedZ);

    return {
      id: `region-${index + 1}`,
      name: regionName,
      type,
      areaMm2: Math.round(c.totalArea * 10) / 10,
      faceCount: c.faceCount,
      centroid: [centroid.x, centroid.y, centroid.z],
      boundingBox: {
        min: [c.min.x, c.min.y, c.min.z],
        max: [c.max.x, c.max.y, c.max.z],
        size: [rSize.x, rSize.y, rSize.z],
      },
      elevationMm: Math.round(elevationMm * 10) / 10,
      avgOverhangAngleDeg: overhangAngleDeg,
      severity,
      suggestedModification: modificationConfig,
    };
  });

  // Canonical Orientations Analysis (6 primary 90-degree views)
  const orientationConfigs: { name: string; axis: 'X' | 'Y' | 'Z'; deg: number; euler: [number, number, number] }[] = [
    { name: 'Current Build Bed Orientation (0°)', axis: 'Z', deg: 0, euler: [0, 0, 0] },
    { name: 'Rotate +90° around X-Axis (Lying Flat)', axis: 'X', deg: 90, euler: [Math.PI / 2, 0, 0] },
    { name: 'Rotate -90° around X-Axis (Reverse Flat)', axis: 'X', deg: -90, euler: [-Math.PI / 2, 0, 0] },
    { name: 'Flip 180° around X-Axis (Inverted Bed)', axis: 'X', deg: 180, euler: [Math.PI, 0, 0] },
    { name: 'Rotate +90° around Y-Axis (Standing Profile)', axis: 'Y', deg: 90, euler: [0, Math.PI / 2, 0] },
    { name: 'Rotate -90° around Y-Axis (Reverse Profile)', axis: 'Y', deg: -90, euler: [0, -Math.PI / 2, 0] },
  ];

  const orientations: OrientationAlternative[] = orientationConfigs.map((cfg) => {
    const testGeo = nonIndexed.clone();
    if (cfg.euler[0] !== 0 || cfg.euler[1] !== 0 || cfg.euler[2] !== 0) {
      const rotMatrix = new THREE.Matrix4().makeRotationFromEuler(
        new THREE.Euler(cfg.euler[0], cfg.euler[1], cfg.euler[2], 'XYZ')
      );
      testGeo.applyMatrix4(rotMatrix);
    }
    testGeo.computeBoundingBox();
    const tBox = testGeo.boundingBox || new THREE.Box3();
    const tSize = new THREE.Vector3();
    tBox.getSize(tSize);
    const tBedZ = tBox.min.z;

    const tPos = testGeo.attributes.position;
    let tOverhangArea = 0;
    let tCriticalFaces = 0;
    let tBedContactArea = 0;

    const v1 = new THREE.Vector3();
    const v2 = new THREE.Vector3();
    const v3 = new THREE.Vector3();
    const e1 = new THREE.Vector3();
    const e2 = new THREE.Vector3();
    const fn = new THREE.Vector3();

    for (let k = 0; k < tPos.count; k += 3) {
      v1.fromBufferAttribute(tPos, k);
      v2.fromBufferAttribute(tPos, k + 1);
      v3.fromBufferAttribute(tPos, k + 2);

      e1.subVectors(v2, v1);
      e2.subVectors(v3, v1);
      fn.crossVectors(e1, e2);
      const a = fn.length() * 0.5;
      if (a <= 0.00001) continue;

      fn.normalize();
      const dot = fn.dot(downVector);

      if (dot > criticalCos) {
        tOverhangArea += a;
        tCriticalFaces++;
      }

      // Check bed contact (faces on bedZ within 0.3mm tolerance facing downward)
      const avgZ = (v1.z + v2.z + v3.z) / 3;
      if (Math.abs(avgZ - tBedZ) < 0.35 && dot > 0.7) {
        tBedContactArea += a;
      }
    }

    testGeo.dispose();

    const overhangPct = totalModelAreaMm2 > 0 ? (tOverhangArea / totalModelAreaMm2) * 100 : 0;
    const savingsVsCurrent =
      totalOverhangAreaMm2 > 0
        ? Math.max(0, Math.round(((totalOverhangAreaMm2 - tOverhangArea) / totalOverhangAreaMm2) * 100))
        : 0;

    // Stability score = bed contact area vs height aspect ratio
    const bedFootprint = tSize.x * tSize.y;
    const heightFactor = Math.max(1, tSize.z / Math.max(1, Math.min(tSize.x, tSize.y)));
    const stabilityScore = Math.min(
      100,
      Math.max(20, Math.round((Math.max(tBedContactArea, bedFootprint * 0.25) / (bedFootprint || 1)) * 100 - (heightFactor - 1) * 12))
    );

    // Estimated support volume (assuming 18% support density)
    const avgOverhangHeightMm = tSize.z * 0.45;
    const supportVolCm3 = (tOverhangArea * avgOverhangHeightMm * 0.18) / 1000;

    return {
      name: cfg.name,
      axis: cfg.axis,
      degrees: cfg.deg,
      rotationEuler: cfg.euler,
      rotationDegrees: [
        Math.round(THREE.MathUtils.radToDeg(cfg.euler[0])),
        Math.round(THREE.MathUtils.radToDeg(cfg.euler[1])),
        Math.round(THREE.MathUtils.radToDeg(cfg.euler[2])),
      ],
      overhangAreaMm2: Math.round(tOverhangArea * 10) / 10,
      criticalOverhangFaces: tCriticalFaces,
      overhangPercentage: Math.round(overhangPct * 10) / 10,
      supportVolumeCm3: Math.round(supportVolCm3 * 10) / 10,
      bedContactAreaMm2: Math.round(Math.max(tBedContactArea, tSize.x * tSize.y * 0.2) * 10) / 10,
      maxHeightMm: Math.round(tSize.z * 10) / 10,
      stabilityScore,
      isRecommended: false,
      savingsVsCurrent,
    };
  });

  // Pick best orientation
  let bestOrientation = orientations[0];
  let minOverhang = orientations[0].overhangAreaMm2;

  for (const ori of orientations) {
    if (ori.overhangAreaMm2 < minOverhang && ori.stabilityScore >= 40) {
      minOverhang = ori.overhangAreaMm2;
      bestOrientation = ori;
    }
  }

  // Mark recommended
  if (bestOrientation.savingsVsCurrent >= 25 && bestOrientation !== orientations[0]) {
    bestOrientation.isRecommended = true;
  } else {
    orientations[0].isRecommended = true;
    bestOrientation = orientations[0];
  }

  // Support volume and print time estimation
  const avgElevationMm = regions.length > 0
    ? regions.reduce((acc, r) => acc + r.elevationMm * r.areaMm2, 0) / Math.max(1, totalOverhangAreaMm2)
    : size.z * 0.4;

  const estimatedSupportVolumeCm3 = Math.round(((totalOverhangAreaMm2 * avgElevationMm * 0.18) / 1000) * 10) / 10;
  const estimatedSupportFilamentGrams = Math.round(estimatedSupportVolumeCm3 * filamentDensityGcm3 * 10) / 10;
  // Support prints at ~18 cm³/hr on modern printers with interface layers
  const estimatedExtraPrintTimeMinutes = Math.round((estimatedSupportVolumeCm3 / 16) * 60 + (regions.length > 0 ? 12 : 0));

  const overhangRatio = totalModelAreaMm2 > 0 ? totalOverhangAreaMm2 / totalModelAreaMm2 : 0;

  // Feasibility score (0-100)
  let rawScore = 100 - Math.round(overhangRatio * 220) - regions.length * 3;
  if (totalOverhangAreaMm2 === 0) rawScore = 100;
  const feasibilityScore = Math.max(10, Math.min(100, rawScore));

  let rating: SupportFreeAnalysisResult['rating'] = 'Fully Support-Free';
  if (feasibilityScore < 45) {
    rating = 'Heavy Supports Required';
  } else if (feasibilityScore < 70) {
    rating = 'Moderate Supports Needed';
  } else if (feasibilityScore < 90) {
    rating = 'Minor Tweaks Needed';
  }

  // Material considerations
  const materialConsiderations = getMaterialConsiderations(filamentName);

  // Summary Advice
  let summaryAdvice = '';
  if (feasibilityScore >= 90) {
    summaryAdvice =
      'Outstanding DfAM geometry! Overhangs are self-supporting within your printer’s threshold. No support structures are needed.';
  } else if (bestOrientation.savingsVsCurrent >= 35 && bestOrientation !== orientations[0]) {
    summaryAdvice = `You can eliminate ${bestOrientation.savingsVsCurrent}% of overhangs simply by reorienting the model (${bestOrientation.name}) without editing CAD geometry!`;
  } else if (regions.length > 0) {
    summaryAdvice = `Model contains ${regions.length} overhang feature(s) requiring sacrificial supports. Applying 45° chamfers or teardrops will save ~${estimatedSupportFilamentGrams}g filament and ~${estimatedExtraPrintTimeMinutes} mins print time.`;
  } else {
    summaryAdvice = 'Model has moderate overhangs. Consider chamfering downward horizontal steps to achieve 100% support-free manufacturing.';
  }

  nonIndexed.dispose();

  return {
    feasibilityScore,
    rating,
    totalOverhangAreaMm2: Math.round(totalOverhangAreaMm2 * 10) / 10,
    overhangRatio: Math.round(overhangRatio * 1000) / 1000,
    estimatedSupportVolumeCm3,
    estimatedSupportFilamentGrams,
    estimatedExtraPrintTimeMinutes,
    regions,
    orientations,
    bestOrientation,
    materialConsiderations,
    summaryAdvice,
  };
}

function getRegionFriendlyName(type: ModificationType, index: number, heightZ: number): string {
  const zStr = `@ Z=${heightZ.toFixed(0)}mm`;
  switch (type) {
    case 'chamfer':
      return `Downward Step Ledge #${index} ${zStr}`;
    case 'teardrop_hole':
      return `Horizontal Bore Tunnel #${index} ${zStr}`;
    case 'gusset_rib':
      return `Cantilever Mounting Boss #${index} ${zStr}`;
    case 'gothic_arch':
      return `Broad Horizontal Ceiling #${index} ${zStr}`;
    case 'sacrificial_bridge':
      return `Recessed Bolt Pocket #${index} ${zStr}`;
    default:
      return `Overhang Feature #${index} ${zStr}`;
  }
}

function getModificationDetails(
  type: ModificationType,
  chamferDim: string,
  boreRadius: string,
  gussetThickness: string,
  gussetSpacing: string,
  filamentName: string,
  elevationMm: number
) {
  switch (type) {
    case 'chamfer':
      return {
        title: 'Apply 45° Underside Chamfer',
        description: `Replace the sharp 90° horizontal step face with a 45° chamfered bevel. This allows each extruded layer line to step outward supported by the layer beneath it.`,
        cadTechnique: 'Chamfer Feature / Draft Angle (DfAM Rule: 45° Rule of Thumb)',
        cadSteps: [
          {
            tool: 'Chamfer Tool (Fusion 360 / SolidWorks / Onshape)',
            action: 'Select the lower horizontal perimeter edge of the overhang ledge.',
            parameterValue: `Distance: ${chamferDim} mm × 45.0°`,
          },
          {
            tool: 'Draft Angle Tool (Alternative)',
            action: 'Select the downward facing plane with the build plate as the pull direction.',
            parameterValue: 'Draft Angle: 45.0° - 50.0°',
          },
        ],
        materialSpecificNote: `${filamentName} can print up to 50° overhangs with solid part cooling. A 45° chamfer guarantees a clean finish with zero sag.`,
        estimatedSavingsPercent: 95,
      };

    case 'teardrop_hole':
      return {
        title: 'Convert Circular Bore to Teardrop Profile',
        description: `Horizontal cylindrical holes suffer from severe bridging sag at the 12 o'clock ceiling position. Extending the top arc into a 45° pointed gothic teardrop allows the roof layers to bridge self-supported.`,
        cadTechnique: 'Teardrop Profile / Diamond Bore Hole',
        cadSteps: [
          {
            tool: 'Sketch Profile (Fusion 360 / SolidWorks)',
            action: 'Draw two tangent lines at 45° from the horizontal hole equator intersecting at the top apex.',
            parameterValue: `Tangent Angle: 45.0°, Top Apex Offset: +${(parseFloat(boreRadius) * 0.414).toFixed(1)} mm`,
          },
          {
            tool: 'Diamond Bore (Fastest)',
            action: 'Rotate the circular profile 45° into a 4-sided diamond rhombus with a vertical axis.',
            parameterValue: `Corner Fillet: 0.5 mm at side vertices`,
          },
        ],
        materialSpecificNote: `Bolt fasteners (M3/M4/M5) seat centered in teardrop holes without any interference from the upper 45° relief apex!`,
        estimatedSavingsPercent: 100,
      };

    case 'gusset_rib':
      return {
        title: 'Add 45° Triangular Support Gusset Ribs',
        description: `Floating cantilever tabs or perpendicular mounting ears sag without support. Adding 45° triangular stiffening ribs underneath transfers load down into the main body while eliminating overhang supports.`,
        cadTechnique: 'Rib / Web Feature with 45° Taper',
        cadSteps: [
          {
            tool: 'Rib / Web Tool (Fusion 360 / Onshape)',
            action: 'Sketch a 45° diagonal line connecting the outer underside lip to the vertical main wall.',
            parameterValue: `Rib Thickness: ${gussetThickness}`,
          },
          {
            tool: 'Pattern Ribs',
            action: 'Create a linear pattern of ribs along the cantilever span.',
            parameterValue: `Pitch Spacing: ${gussetSpacing} mm apart`,
          },
        ],
        materialSpecificNote: `Not only eliminates supports, but also drastically increases structural mechanical load capacity in ${filamentName}.`,
        estimatedSavingsPercent: 90,
      };

    case 'sacrificial_bridge':
      return {
        title: 'Add Single-Layer Sacrificial Bridging Diaphragm',
        description: `For counterbores and recessed nut pockets at height ${elevationMm.toFixed(0)}mm, bridge across the hole with a thin 0.20mm (1-layer) sacrificial membrane. The printer bridges straight across in mid-air, and the membrane is easily punched out after printing.`,
        cadTechnique: 'Sacrificial Bridging Membrane (0.20mm Diaphragm)',
        cadSteps: [
          {
            tool: 'Extrude Feature',
            action: 'Model a 0.20mm solid disk barrier across the counterbore hole ceiling.',
            parameterValue: 'Thickness: 0.20 mm (exactly 1 standard layer)',
          },
          {
            tool: 'Post-Print Clear',
            action: 'Push a standard hex screwdriver or M-series bolt through the hole to clear the membrane.',
            parameterValue: 'Punch-out force: < 20 N (effortless push)',
          },
        ],
        materialSpecificNote: `${filamentName} produces perfect straight bridging lines when spanning across circular holes up to 18mm diameter.`,
        estimatedSavingsPercent: 100,
      };

    case 'gothic_arch':
      return {
        title: 'Convert Wide Span to Self-Supporting Gothic Arch',
        description: `Wide flat horizontal ceiling spans droop without supports. Replacing the flat lintel with a pointed gothic arch (60°/45° profile) creates an inherently stable compressive arch that prints cleanly support-free.`,
        cadTechnique: 'Gothic Arch / Parabolic Ceiling Vault',
        cadSteps: [
          {
            tool: 'Two-Arc Profile Sketch',
            action: 'Sketch two circular arcs originating from each side wall meeting at a sharp center peak.',
            parameterValue: 'Arch Radius: 1.5× span width, Peak angle: 60°',
          },
          {
            tool: 'Fillet Peak',
            action: 'Apply a small 1mm radius fillet at the very top apex for nozzle turnaround.',
            parameterValue: 'Fillet Radius: 1.0 mm',
          },
        ],
        materialSpecificNote: `Arches distribute extrusion pressure evenly, preventing layer separation in ${filamentName}.`,
        estimatedSavingsPercent: 92,
      };

    default:
      return {
        title: 'Apply 45° Chamfer / Draft Transition',
        description: 'Taper the overhang angle to under 45° relative to the vertical build axis.',
        cadTechnique: 'Chamfer / Draft Angle',
        cadSteps: [
          {
            tool: 'Chamfer Feature',
            action: 'Add 45° chamfer to downward overhang lip.',
            parameterValue: '45.0°',
          },
        ],
        materialSpecificNote: 'Guarantees reliable self-supporting layers.',
        estimatedSavingsPercent: 85,
      };
  }
}

function getMaterialConsiderations(filamentName: string) {
  const upper = filamentName.toUpperCase();
  if (upper.includes('PETG')) {
    return {
      filamentName,
      bridgingRating: 'Moderate' as const,
      recommendedMaxOverhangAngle: 42,
      sagRisk: 'High' as const,
      coolingNotes:
        'PETG has low surface tension and tends to droop on overhangs > 45°. Increase part cooling fan to 60-80% on bridge perimeters, and prefer 40° chamfers over 45°.',
    };
  } else if (upper.includes('TPU') || upper.includes('FLEX')) {
    return {
      filamentName,
      bridgingRating: 'Poor' as const,
      recommendedMaxOverhangAngle: 35,
      sagRisk: 'High' as const,
      coolingNotes:
        'Flexible filaments lack columnar stiffness when bridging and drag behind nozzle. Overhangs must be strictly limited to ≤ 35° or redesigned with generous chamfers.',
    };
  } else if (upper.includes('ABS') || upper.includes('ASA')) {
    return {
      filamentName,
      bridgingRating: 'Good' as const,
      recommendedMaxOverhangAngle: 45,
      sagRisk: 'Medium' as const,
      coolingNotes:
        'ABS/ASA bridge well but require an enclosed chamber to prevent perimeter delamination and edge curling on unsupported overhangs. Use minimum fan speed (~25%).',
    };
  } else if (upper.includes('NYLON') || upper.includes('PA') || upper.includes('POLYAMIDE')) {
    return {
      filamentName,
      bridgingRating: 'Moderate' as const,
      recommendedMaxOverhangAngle: 40,
      sagRisk: 'Medium' as const,
      coolingNotes:
        'Nylon cools quickly and produces strong layer bonds, but sharp corners on overhangs tend to lift upward. Chamfers and gothic arches prevent curl.',
    };
  } else {
    // Default PLA
    return {
      filamentName: filamentName || 'PLA',
      bridgingRating: 'Excellent' as const,
      recommendedMaxOverhangAngle: 50,
      sagRisk: 'Low' as const,
      coolingNotes:
        'PLA excels at bridging and steep overhangs when paired with 100% auxiliary part cooling. Overhangs up to 50° print cleanly without supports.',
    };
  }
}
