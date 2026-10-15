/**
 * Precision 3D Print Success Probability Calculator
 * Evaluates mesh geometry (Volume, Overhang %, Aspect Ratio, Material)
 * to estimate completion success and provide actionable slicer mitigations.
 */

export interface PrintSuccessScore {
  score: number; // 0 to 100 percentage
  grade: 'A+' | 'A' | 'B' | 'C' | 'D';
  ratingLabel: string;
  colorClass: string;
  badgeBg: string;
  progressBarColor: string;
  overhangPenalty: number;
  volumePenalty: number;
  adhesionPenalty: number;
  materialPenalty: number;
  riskFactors: string[];
  recommendations: string[];
}

export function calculatePrintSuccessScore(
  volumeCm3: number,
  overhangPercentage: number,
  dimX: number = 50,
  dimY: number = 50,
  dimZ: number = 50,
  filamentName: string = 'PLA'
): PrintSuccessScore {
  const baseScore = 98; // Baseline for a modern calibrated 3D printer

  // 1. Overhang Penalty Calculation
  // Overhangs > 45° require careful support, cooling, or bridge tuning
  let overhangPenalty = 0;
  if (overhangPercentage <= 2.5) {
    overhangPenalty = 0;
  } else if (overhangPercentage <= 8) {
    overhangPenalty = Math.round((overhangPercentage - 2.5) * 0.9);
  } else if (overhangPercentage <= 20) {
    overhangPenalty = Math.round(5 + (overhangPercentage - 8) * 1.1);
  } else if (overhangPercentage <= 35) {
    overhangPenalty = Math.round(18 + (overhangPercentage - 20) * 1.0);
  } else {
    overhangPenalty = Math.min(36, Math.round(33 + (overhangPercentage - 35) * 0.4));
  }

  // 2. Volumetric Thermal Mass Penalty
  // Larger volume = longer print duration, increased thermal contraction stress, warping propensity
  let volumePenalty = 0;
  if (volumeCm3 <= 20) {
    volumePenalty = 1;
  } else if (volumeCm3 <= 90) {
    volumePenalty = Math.round(1 + ((volumeCm3 - 20) / 70) * 4);
  } else if (volumeCm3 <= 250) {
    volumePenalty = Math.round(5 + ((volumeCm3 - 90) / 160) * 8);
  } else {
    volumePenalty = Math.min(22, Math.round(13 + ((volumeCm3 - 250) / 300) * 9));
  }

  // 3. Aspect Ratio / Footprint-to-Height Stability Penalty
  const footprintMin = Math.max(5, Math.min(dimX, dimY));
  const heightRatio = dimZ / footprintMin;
  let adhesionPenalty = 0;
  if (heightRatio > 2.4) {
    adhesionPenalty = Math.min(10, Math.round((heightRatio - 2.4) * 2.8));
  }

  // 4. Material Shrinkage & Thermal Sensitivity
  let materialPenalty = 0;
  const isHighShrinkage = /abs|asa|pc|nylon|pa-cf/i.test(filamentName);
  if (isHighShrinkage) {
    materialPenalty = Math.round(volumePenalty * 0.35) + 3;
  }

  // Calculate final score bounded between 25% and 99%
  const finalScore = Math.max(
    25,
    Math.min(99, Math.round(baseScore - overhangPenalty - volumePenalty - adhesionPenalty - materialPenalty))
  );

  // Grade & Presentation Attributes
  let grade: 'A+' | 'A' | 'B' | 'C' | 'D' = 'A';
  let ratingLabel = 'High Success Probability';
  let colorClass = 'text-cyan-400';
  let badgeBg = 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
  let progressBarColor = 'from-cyan-500 to-blue-500';

  if (finalScore >= 92) {
    grade = 'A+';
    ratingLabel = 'Exceptional Printability (Plug & Play)';
    colorClass = 'text-emerald-400';
    badgeBg = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    progressBarColor = 'from-emerald-500 to-teal-400';
  } else if (finalScore >= 82) {
    grade = 'A';
    ratingLabel = 'High Success Probability (Standard Slicing)';
    colorClass = 'text-cyan-400';
    badgeBg = 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
    progressBarColor = 'from-cyan-500 to-blue-500';
  } else if (finalScore >= 70) {
    grade = 'B';
    ratingLabel = 'Moderate Risk (Supports & Brim Advised)';
    colorClass = 'text-amber-400';
    badgeBg = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
    progressBarColor = 'from-amber-500 to-yellow-400';
  } else if (finalScore >= 55) {
    grade = 'C';
    ratingLabel = 'Challenging Print (Careful Tuning Needed)';
    colorClass = 'text-orange-400';
    badgeBg = 'bg-orange-500/20 text-orange-300 border-orange-500/30';
    progressBarColor = 'from-orange-500 to-red-400';
  } else {
    grade = 'D';
    ratingLabel = 'High Failure Risk (Reorientation Recommended)';
    colorClass = 'text-rose-400';
    badgeBg = 'bg-rose-500/20 text-rose-300 border-rose-500/30';
    progressBarColor = 'from-rose-600 to-rose-400';
  }

  // Diagnostic Factors & Mitigations
  const riskFactors: string[] = [];
  const recommendations: string[] = [];

  // Overhang Diagnosis
  if (overhangPercentage > 15) {
    riskFactors.push(
      `Critical Overhangs: ${overhangPercentage.toFixed(1)}% of surface requires support (-${overhangPenalty} pts)`
    );
    recommendations.push('Deploy Tree / Organic Supports with 0.2mm Z-contact gap to prevent droop and scarring.');
  } else if (overhangPercentage > 5) {
    riskFactors.push(
      `Mild Overhangs: ${overhangPercentage.toFixed(1)}% surfaces exceed 45° inclination (-${overhangPenalty} pts)`
    );
    recommendations.push('Use snug supports or increase part cooling fan to 100% on bridging layers.');
  } else {
    recommendations.push('Self-Supporting: Negligible overhangs; can be sliced with 0 supports.');
  }

  // Volume & Thermal Mass Diagnosis
  if (volumeCm3 > 180) {
    riskFactors.push(
      `High Thermal Mass: ${volumeCm3.toFixed(1)} cm³ part volume raises corner warping risk (-${volumePenalty} pts)`
    );
    recommendations.push('Add a 5mm outer brim on clean textured PEI plate to anchor outer corners.');
  } else {
    recommendations.push(
      `Optimal Thermal Mass: Compact ${volumeCm3.toFixed(1)} cm³ volume ensures rapid layer stabilization.`
    );
  }

  // Tall Aspect Ratio Diagnosis
  if (heightRatio > 2.4) {
    riskFactors.push(
      `Tall Stature: ${heightRatio.toFixed(1)}:1 height-to-base ratio susceptible to nozzle drag (-${adhesionPenalty} pts)`
    );
    recommendations.push('Lower print acceleration to 1,500 mm/s² above 50% Z-height and enable mouse-ear brims.');
  }

  // Material Factor
  if (isHighShrinkage) {
    riskFactors.push(
      `Material Contraction: ${filamentName} requires enclosed heated chamber (-${materialPenalty} pts)`
    );
    recommendations.push('Ensure chamber temperature is maintained ≥45°C to avoid inter-layer delamination.');
  }

  return {
    score: finalScore,
    grade,
    ratingLabel,
    colorClass,
    badgeBg,
    progressBarColor,
    overhangPenalty,
    volumePenalty,
    adhesionPenalty,
    materialPenalty,
    riskFactors,
    recommendations,
  };
}
