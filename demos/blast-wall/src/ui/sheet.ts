/**
 * The two documents that live inside the app: a first-run guide, and the theory.
 *
 * The full derivation, properly typeset, is a post on the site. This is the version you
 * can read without leaving the thing it describes — which is the whole point, since a
 * demo whose explanation is somewhere else has no explanation.
 *
 * The equations are HTML and Unicode rather than a maths renderer. There are eight of
 * them; a typesetting dependency to set eight formulas would cost more than it returns,
 * and the site has the typeset version one link away.
 */

const SEEN_KEY = 'blast-wall.guide.seen';

export type SheetName = 'guide' | 'theory';

const GUIDE = /* html */ `
<p class="lede">
  You are looking at four brick walls bonded at the corners — 1800 bricks, 28 000 finite
  elements, and every mortar joint between them solved rather than drawn. There is a
  charge outside. Press <b>Detonate</b> and watch what the joints do.
</p>

<ol class="steps">
  <li>
    <b>The red sphere is the charge.</b> Drag it anywhere in the scene, or set its mass and
    standoff in <i>The charge</i>. The expanding shell you see after firing is the shock
    front, leaving at several times the speed of sound and slowing as it goes.
  </li>
  <li>
    <b>Everything happens in 300 milliseconds</b>, so playback starts at 0.03× and goes
    down to 0.003×. At real speed you would miss the entire event between two frames.
  </li>
  <li>
    <b>Colour by joint damage</b> to see the crack path glowing through the mortar, or by
    speed to see what is actually flying. Plain masonry turns both off.
  </li>
  <li>
    <b>Four tools.</b> <i>Select</i> clicks a brick — then Backspace removes it and P pins
    it. <i>Carve</i> sweeps bricks away as you drag. <i>Pin</i> paints fixed supports.
    <i>Opening</i> drags out a window or a doorway.
  </li>
  <li>
    <b>Every material number is a slider</b>, with its literature range behind it. Drive
    the joint tensile strength to zero for a dry-stacked wall held up by friction alone.
    Turn strain-rate hardening off and the same charge does more damage.
  </li>
  <li>
    <b>Try the comparison the demo exists for.</b> Set <i>Plan</i> to one wall, fire it in
    running bond, then switch to stack bond and fire again. Same charge, different crack
    path — because in stack bond the head joints line up and a crack has somewhere to run.
  </li>
</ol>

<p class="foot">
  Drag to orbit · scroll to zoom · shift-drag to pan. The numbers top-right are live, and
  the plot bottom-right is the displacement of the middle of the loaded wall against
  time — the trace a real blast test records. For the maths behind all of it, the
  <b>Theory</b> button sits next to the one that opened this.
</p>
`;

const THEORY = /* html */ `
<p class="lede">
  This is a finite element model, not a spring toy. Here is the chain, and then an honest
  list of what it leaves out.
</p>

<h3>What is being solved</h3>
<p>
  Each brick is a continuum obeying momentum balance, <span class="eq">ρ ü = ∇·σ + ρb</span>.
  What makes it masonry is the other condition: between two bricks sits a surface across
  which displacement may be <i>discontinuous</i>, carrying a traction that depends on how
  far the faces have opened or slid, <span class="eq">T = T(Δu)</span>. A wall is a few
  hundred continua stitched together by tens of thousands of those surfaces, and nearly
  everything interesting lives in the stitching.
</p>

<h3>The element</h3>
<p>
  Trilinear hexahedra — eight nodes, <span class="eq">N<sub>a</sub> = ⅛(1+ξ<sub>a</sub>ξ)(1+η<sub>a</sub>η)(1+ζ<sub>a</sub>ζ)</span>.
  The geometry is boxes on a lattice, so hexahedra tile it exactly and there is no meshing
  step. Linear tetrahedra would be constant-strain and far too stiff; quadratic elements
  would shorten the explicit time step and complicate mass lumping. Full 2×2×2 Gauss
  rather than one-point reduced, so there are no hourglass modes needing an artificial
  stabilising stiffness.
</p>

<h3>The integrals</h3>
<p class="eq block">K<sub>e</sub> = ∫ B<sup>T</sup> D B dΩ = Σ<sub>g</sub> w<sub>g</sub> B<sup>T</sup>(ξ<sub>g</sub>) D B(ξ<sub>g</sub>) det J</p>
<p>
  For an axis-aligned box the Jacobian is constant, <span class="eq">det J = abc/8</span>,
  and two-point Gauss integrates the trilinear integrand exactly. Because every unit sits
  on one lattice and is subdivided uniformly, <b>every element in the model is the same
  box</b> — so this 24×24 matrix is built once and shared by all 28 000 of them. The mass
  matrix is row-summed to a diagonal, <span class="eq">M<sub>aa</sub> = ρV/8</span>, which
  turns the time step into a division instead of a linear solve.
</p>

<h3>Large rotations</h3>
<p>
  A tumbling brick has small strain and an enormous rotation, and linear elasticity reads
  that rotation as strain. So the rotation is extracted from the deformation gradient by
  iterative polar decomposition — warm-started from the previous step, so it converges in
  one or two iterations — and the strain measured in the element's own frame:
</p>
<p class="eq block">f<sub>int</sub> = −R K<sub>e</sub> ( R<sup>T</sup>x − X )</p>

<h3>The joints</h3>
<p>
  Elastic stiffness comes from smearing the real mortar over its thickness,
  <span class="eq">k<sub>n</sub> = E<sub>u</sub>E<sub>m</sub> / t<sub>m</sub>(E<sub>u</sub>−E<sub>m</sub>)</span>
  ≈ 80 N/mm³, which is what the experiments calibrate to. Then a bilinear cohesive law in
  tension, rising to f<sub>t</sub> and falling linearly to zero at
</p>
<p class="eq block">δ<sub>f</sub> = 2G<sub>f</sub>/f<sub>t</sub>&nbsp;&nbsp;&nbsp;so that&nbsp;&nbsp;&nbsp;∫ σ dδ = ½ f<sub>t</sub> δ<sub>f</sub> = G<sub>f</sub></p>
<p>
  — the area under the curve <i>is</i> the fracture energy, by construction. Damage is a
  loss of secant stiffness, so unloading returns to the origin. Sliding is Coulomb,
  <span class="eq">|τ| ≤ c(1−D) + max(0,−σ)·tanφ</span>, and compression is capped at
  f<sub>c</sub> with a permanent set. That cap is not decorative: a wall held top and
  bottom resists by arching, and an arch concentrates its thrust onto a sliver of joint,
  so without the cap such a wall is unbreakable.
</p>

<h3>Time integration</h3>
<p class="eq block">v<sup>n+½</sup> = v<sup>n−½</sup> + Δt M<sup>−1</sup>( f<sub>ext</sub> − f<sub>int</sub> )&nbsp;&nbsp;&nbsp;u<sup>n+1</sup> = u<sup>n</sup> + Δt v<sup>n+½</sup></p>
<p>
  Central difference on a diagonal mass — no solve, and it keeps running after elements
  lose all their stiffness, which is exactly what a wall coming apart does to them. It is
  conditionally stable at <span class="eq">Δt ≤ 2/ω<sub>max</sub></span>, and ω<sub>max</sub>
  is <i>measured</i> by power iteration on the element, then compared against the joint
  springs and the ground contact; the smallest wins. Which of the three governs changes the
  moment you drag a stiffness slider.
</p>

<h3>The load</h3>
<p>
  A modified Friedlander pulse,
  <span class="eq">p = P<sub>r</sub>(1 − τ)e<sup>−bτ</sup></span>, with peak and duration
  from the Kinney &amp; Graham fits in scaled distance Z = R/W<sup>⅓</sup>, the reflected
  peak from Rankine–Hugoniot, and a CONWEP blend giving each face its own pressure by
  incidence angle. Arrival times integrate dR/U(R), so the front decelerates — and the
  drawn shock sphere reads the same table, so the picture and the load cannot disagree.
  Faces that cannot see the charge are found by a line-of-sight march over the lattice and
  are not loaded.
</p>

<h3>What this is not</h3>
<ul class="caveats">
  <li><b>Explicit only.</b> No tangent stiffness, no Newton iteration, no equation solving. None of this would work for a static problem.</li>
  <li><b>Corotational linear, not large-strain.</b> Valid for small strain with arbitrary rotation.</li>
  <li><b>The interface is integrated nodally</b>, not by quadrature with interface shape functions.</li>
  <li><b>H8 locks in bending.</b> It matters less here because a wall's compliance is in its joints, but it is a real limitation.</li>
  <li><b>One damage variable</b> couples mode I and mode II, so mode II fracture energy is not independently controllable.</li>
  <li><b>No fragment-to-fragment contact.</b> A joint can close back up; two pieces that fly into each other pass through.</li>
  <li><b>The blast is prescribed</b>, not solved. No fluid, no clearing, no diffraction into shadow.</li>
  <li><b>Bricks cannot break.</b> All damage is in the joints.</li>
</ul>

<p class="foot">
  The full derivation, properly typeset — weak form, quadrature, stability — is at
  <a href="/blog/a-brick-wall-from-the-weak-form-up">A brick wall, from the weak form up</a>.
</p>
`;

const TITLES: Record<SheetName, string> = {
  guide: 'What you are looking at',
  theory: 'The theory',
};

const BODIES: Record<SheetName, string> = { guide: GUIDE, theory: THEORY };

export class Sheet {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly body: HTMLElement;

  constructor() {
    this.root = document.getElementById('sheet')!;
    this.title = document.getElementById('sheet-title')!;
    this.body = document.getElementById('sheet-body')!;
    document.getElementById('sheet-close')!.addEventListener('click', () => this.close());
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.close();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.root.hidden) this.close();
    });
  }

  open(name: SheetName): void {
    this.title.textContent = TITLES[name];
    this.body.innerHTML = BODIES[name];
    this.body.scrollTop = 0;
    this.root.hidden = false;
  }

  close(): void {
    this.root.hidden = true;
  }

  /** Show the guide the first time someone opens the lab, and never nag after that. */
  openIfFirstVisit(): void {
    try {
      if (localStorage.getItem(SEEN_KEY)) return;
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Private windows and blocked site data throw here; showing the guide once per
      // session is a fine outcome, so carry on.
    }
    this.open('guide');
  }
}
