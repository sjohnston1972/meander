// Wet and dry periods over the centuries (settings.climateSwing). In a wet
// period the river carries more water, floods more often and is brought
// more sediment; in a dry one, less of each. The engine runs on these
// effective settings; the settings themselves (what the panel shows) stay put.
import { CLIMATE } from '../config.js';
import { sin } from './dmath.js';

// How wet the climate is in `year`: -1 (driest) to 1 (wettest). A main cycle
// of about CLIMATE.years and a shorter one beside it, with phases (and a
// slow wander) from the seed's noise, so no two rivers' climates match.
export function wetness(noise, year) {
  const t = year / CLIMATE.years;
  const p1 = noise(0.5, 7.7) * 20, p2 = noise(3.5, 1.3) * 20;
  const drift = (noise(t * 0.7, 4.2) - 0.5) * 3;
  const v = 1.15 * (0.75 * sin(2 * Math.PI * t + p1 + drift) + 0.35 * sin(2 * Math.PI * t * 2.3 + p2));
  return v > 1 ? 1 : v < -1 ? -1 : v;
}

// The settings the river feels at wetness `w`.
export function climateSettings(s, w) {
  const a = s.climateSwing * w;
  return {
    ...s,
    meanDischarge: s.meanDischarge * (1 + CLIMATE.flow * a),
    floodFrequency: s.floodFrequency * Math.max(0, 1 + CLIMATE.floods * a),
    sedimentSupply: s.sedimentSupply * Math.max(0.05, 1 + CLIMATE.sediment * a),
  };
}

// 'wet', 'dry' or '' (in between), for the readout and the toasts.
export function climatePhase(s, w) {
  if (!(s.climateSwing > 0)) return '';
  const a = s.climateSwing * w;
  return a > CLIMATE.label ? 'wet' : a < -CLIMATE.label ? 'dry' : '';
}
