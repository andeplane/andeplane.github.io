/**
 * Material parameters, in SI, with the literature ranges they came from.
 *
 * Units are near-elastic here; all the interesting nonlinearity is in the joints, which
 * is both the physical truth for masonry under blast and the reason a simplified
 * micro-model is worth building at all.
 */

export interface Materials {
  /** Brick Young's modulus, Pa. 16–24 GPa for clay units. */
  E: number;
  /** Brick Poisson ratio. */
  nu: number;
  /** Brick density, kg/m³. */
  density: number;

  /** Joint normal stiffness, Pa/m. Lourenço & Rots calibrate 82 N/mm³ = 8.2e10 Pa/m. */
  kn: number;
  /** Joint shear stiffness, Pa/m. 36 N/mm³. */
  ks: number;
  /** Joint tensile strength, Pa. van der Pluijm: 0.25–0.40 MPa. */
  ft: number;
  /** Mode I fracture energy, J/m². 5–20 J/m². */
  gf: number;
  /** Joint cohesion, Pa. Typically ≈ 1.3 ft. */
  cohesion: number;
  /** tan φ, the Coulomb friction coefficient. φ ≈ 18–37°. */
  tanPhi: number;
  /**
   * Compressive strength of the joint, Pa — the cap of the composite interface model.
   *
   * Easy to talk yourself out of: reflected blast pressures are 0.1–1 MPa and masonry
   * crushes around 10 MPa, so the cap looks like a formality. It is not. A wall held at
   * top and bottom resists by arching, and an arch concentrates its thrust onto a sliver
   * of joint at each hinge, which multiplies the stress by an order of magnitude. Leave
   * the cap out and such a wall is literally unbreakable — it just rings.
   */
  fc: number;

  /** Mass-proportional damping, 1/s. Kills the ring the lumped mass introduces. */
  damping: number;
  /** Strain-rate hardening on ft and c: 0 disables it. */
  dif: number;
}

export function defaultMaterials(): Materials {
  return {
    E: 16.7e9,
    nu: 0.15,
    density: 1900,
    kn: 8.2e10,
    ks: 3.6e10,
    ft: 0.3e6,
    gf: 12,
    cohesion: 0.4e6,
    tanPhi: 0.75,
    fc: 10e6,
    damping: 1.5,
    dif: 1,
  };
}

/**
 * Dynamic increase factor on the joint strengths.
 *
 * Measured masonry DIFs are large — mortar tensile strength roughly triples at 1 s⁻¹,
 * brick compressive strength more than doubles by 150 s⁻¹ — so a blast-loaded joint is
 * genuinely stronger than the quasi-static number. A logarithmic fit through those two
 * anchors is enough to show that it matters; the switch exists so you can see it.
 *
 * ponytail: one curve for tension and cohesion together. Split them if a case ever
 * turns on the difference between mode I and mode II rate sensitivity.
 */
export function dynamicIncrease(strainRate: number, enabled: number): number {
  if (enabled <= 0) return 1;
  const ref = 1e-4; // quasi-static reference rate, s⁻¹
  const r = Math.max(strainRate, ref);
  return Math.min(4, 1 + 0.45 * Math.log10(r / ref) * enabled);
}
