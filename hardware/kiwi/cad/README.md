# Kiwi K1 mechanical prototype · revision A

This is an editable engineering prototype for a 292 mm wide, 172 mm tall three-wheel indoor robot. The STEP assembly contains actual printable mounts, split chassis, screw clearances, strap passages and service parts. Purchased motors, wheel interiors, camera optics and electronics are reference/envelope models. Computational checks establish specific geometric properties; they do not establish a successful print, assembly, driving robot or safety function.

## Files and reproduction

- `kiwi.py`: parametric CadQuery source, dimensions in millimetres.
- `assembly.step`: named solids, including purchased reference envelopes.
- `assembly.glb`: coloured named meshes for the browser. Metres, Y up, forward −Z.
- `manifest.json`: one entry per assembled part instance, repeat-part group, STL path, envelope, dimensional status, explode vector and fastener quantities.
- `checks.json`: solid validity, connected printed bodies, 252 mm print-area checks, selected collision tests, analytic clearances and remaining qualification work.
- `top-plan.svg` and `side-section.svg`: dimensioned layout schematics generated from the parameters. Use STEP for exact geometry; the drawings are not GD&T production drawings.
- `stl/`: individual printable parts and two small fit coupons. Repeated parts share an STL; print the quantity in the manifest.

The top-level `P` dictionary records the main dimensions; detailed feature dimensions and mounting positions also live in named construction functions. This is editable feature-based source, not a universal scale control. Changing a wheel, motor or connector requires revisiting the related interfaces and rerunning the checks.

Tested runtime: CadQuery 2.8.0, trimesh 4.8.3 and Python 3.14 on the home Mac mini. Rebuild from the project root:

```sh
python3 -m venv .venv-cad
.venv-cad/bin/pip install -r hardware/kiwi/cad/requirements.txt
.venv-cad/bin/python hardware/kiwi/cad/kiwi.py --output public/hardware/kiwi/cad
```

For this workspace, run the substantial geometry/export step through `codex-home` on `home-mini`. The actual build result and output must be checked, and exported files copied back deliberately; a remote job does not modify the local project.

## Geometry and drivetrain

CAD axes are X right, Y forward and Z up. The three radial motor axes are 30°, 150° and 270° from +X. Each wheel rolls tangentially to that axis. The wheel centres are at radius 131.8 mm and Z = 30 mm. The 60 mm manufacturer wheel envelope touches the Z = 0 floor plane at three points; the support triangle has an inradius of only 65.9 mm. Keep heavy parts near the centre and validate tip margins using the measured finished mass distribution.

The motor is the Pololu 4866, 75:1 MP 12 V encoder gearmotor. The reference stack uses a 25 mm diameter × 23 mm gearbox, a 24.4 mm diameter × 30.8 mm motor and 14.7 mm encoder section: 68.5 mm behind the gearbox face. The 4 mm D shaft is exposed for 12.5 mm. No motor face-hole pattern is needed: a two-station split cradle clamps the gearbox and motor can with nominal 0.6 mm diametral print clearance. Four M3 × 45 screws per station assembly pass through the deck, upper cradle and lower cap into trapped M3 nuts. Tighten evenly and gently; the printed clamp should retain the metal can without distorting it or crushing the encoder.

The gearbox face is at radius 102 mm. The Nexus 18018 hub starts at radius 103 mm, leaving a 1 mm face gap, and the hub flange ends at radius 119 mm. The Nexus 14145 wheel is **25.6 mm wide** in its manufacturer drawing, despite ambiguous 12 mm product prose. Its outboard face is at radius 144.6 mm. The 16 mm hub receives 11.5 mm of the 12.5 mm shaft in this layout. Its radial set screw sits within the shaft engagement. This is a dimensional proposal, not a verified fit: print the clamp coupon and physically verify shaft, D flat, hub set screw, concentricity and loaded retention before printing the full chassis.

The wheel/hub screw interface uses the 21 mm PCD. The wheel reference mesh deliberately simplifies the internal plates and rollers; a screw does **not** pass through the full 25.6 mm wheel width. The manufacturer's centre web is about 2.5 mm. A 4 mm hub flange, 2.5 mm web and M3 nut suggest M3 × 10 as a starting stack; check head seating, nut and roller clearance on the actual wheel. Do not order a large screw quantity based on the proxy wheel geometry alone.

## Print and assembly sequence

1. Print the insert and motor-clamp coupons first. The insert coupon contains 3.9, 4.0, 4.1, 4.2 and 4.3 mm bores, ordered from left to right. The specified insert is **ruthex RX-M3S×4.0 SHORT**, 4.6 mm outside diameter and 4 mm length, with a manufacturer recommended 4.0 mm pilot bore, 5 mm bore depth and at least 1.6 mm surrounding wall. Use the coupon to select the best bore for your printer/material. Inspect push-out strength after cooling. The full model defaults to 4.0 mm.
2. Print the two 6 mm chassis halves, three underside splice plates and three upper/lower motor cradles. Bolt the seam splices at Y = −46, 0 and +72 mm before installing motors. The seam has 0.5 mm clearance. Four M3 ×12 screws retain the outer two splice plates; two M3 ×14 screws pass through the central IMU carrier and retain the centre splice inserts. Use the current manifest for the complete hardware count.
3. Assemble each motor, hub and wheel off the robot first. Check free rotation and roller motion, then attach the split cradles to the deck. The upper cradle mates to the deck underside at Z = 48 mm; the lower cap has about 13.5 mm ground clearance.
4. Mount the battery and control electronics. The 105 × 34 × 23 mm Gens Ace 3S 2200 mAh XT60 pack rests on 4 mm locating rails, with two 15 mm hook-and-loop straps routed through deck slots. Leave the battery lead and balance connector accessible. Three Pololu2997 TB9051FTG carriers (25.4mm square,7.67mm bare height) sit on the left driver tray, elevated23mm on two inserted risers to clear the contact mechanisms. The Pico2 has its own front-left carrier. The Pololu2866 D24V90F5 5V supply and Pololu2813 motor-power switch have separate right-side carriers. Two Adafruit2717 I2C muxes sit on a front carrier; the Pololu2798 IMU and Pololu5432 3.3V regulator share a central carrier retained by the centre seam-splice screws. Carrier attachment uses the exact chassis hole patterns in the manifest; boards use straps/insulating pads rather than invented PCB holes. Bare board envelopes are documented, but header, terminal and wire routes require bench checks. The deck includes three motor-lead feedthroughs and2.2mm deep signal-wire races, leaving3.8mm of deck web. These are for thin insulated leads; route XT60/USB connectors around the structure and secure them with the tie slots. Check that no wire is pinched under a carrier or battery rail. Insulate the electronics from metal fasteners and do not squeeze the battery with rigid clamps.
5. Fit the four Pi tray risers, then the vented tray. The Pi 5 PCB is 85 × 56 mm. Its four mounting holes form a 58 × 49 mm rectangle, offset 10 mm towards one end relative to the PCB centre; the source uses the documented hole coordinates. M2.5 × 8 screws use printed 2.7 mm pilots in the standoffs. Physically confirm screw engagement and cooler/connector access. The official active-cooler shape is represented as an allocation envelope, not vendor CAD.
6. Fit the independent camera towers and saddle before the cosmetic shell. The OAK-D Lite fixed-focus body is 91 × 28 × 17.5 mm. Use thin closed-cell foam and two light retention straps in the saddle. The lens area is unobstructed; stereo lens proxies use the documented 75 mm baseline. The saddle uses no invented camera mounting holes. The right-angle USB-C cable and 30 mm side bend/strain relief allocation require a physical cable fit check. The camera sits fixed; there is no pan/tilt servo.
7. Install the perimeter and floor ToF carriers with their boards, then the bumper carriers and contact switches. Routing instructions and the mechanical hold points below are part of assembly.
8. Fit the motor-stop tower and switch, then the two shell halves, trim and vented lid halves. Shell pedestals use six inserts and six M3 × 10 screws; eight lid pads use eight inserts and eight M3 × 10 screws. Each half is independently attached. The Carling V1D1B60B-CMC00-000 main rocker is retained by a separate structural rear panel and posts; its shell opening is cosmetic. The cutout is36.83×21.08mm nominal,37.13×21.38mm in the print to allow0.15mm per side. The family reference reserves37.57mm behind the bezel for body/spades, with a60mm total rear wiring zone, and a49.09×24.38mm face extending14.8mm outside. Verify the exact delivered SKU and insulated female terminals before wiring. Opening the rear lid gives battery access; opening the front lid exposes the Pi. The camera and motor mounts remain attached when cosmetic panels are removed.

Suggested first print: PETG for structure/shell and compliant bumper parts, 0.2 mm layers, 4–5 perimeters and about 30% infill. These are slicer starting settings, not measured strength data. The 252 mm maximum part dimension leaves about 2 mm per side on a 256 mm bed. Avoid an external brim that exceeds that footprint; use inward tabs or a build surface appropriate to the material. Decks/lids/trays lie flat; motor clamp STLs are rotated so the motor axis is vertical. Thin trim is cosmetic and may be replaced with paint. Inspect supports and bridge direction in the slicer; towers, side ledges and the camera saddle may need local supports. Do not scale STLs to make them fit the bed, because that changes hardware clearances.

## Bumper: actual contact mechanism, limited coverage

Three 80° ring segments span 240° around the shell, at radius 143–146 mm and height 62–74 mm. The remaining three 40° sectors are wheel gaps. Low objects and obstacles entering those gaps can contact a wheel or structure before a bumper. This is **not** 360° contact protection.

Each segment translates radially inward by 3 mm. Two 5 mm OD / 3.2 mm ID × 16 mm steel spacer sleeves, M3 × 25 retaining screws and washers guide its 5.4 mm wide obround slots. Fixed posts end below the moving arm; the sleeves set washer height so tightening the screws does not clamp the slider. The printed tab contacts fixed hard-stop blocks at 3 mm travel, independently of the switch lever. Check sleeve height and free movement by hand after printing.

An Omron D2F-01L switch lies on a fixed carrier. Two M2 × 20 screws pass through the switch's documented 6.5 mm mounting-hole pitch, carrier and deck into nuts below. The radial slots allow ±2 mm switch adjustment. The bumper actuator rests at radius 124 mm and reaches 121 mm at the hard stop. The nominal switch lever operating point is about 121.8 mm, leaving 0.8 mm nominal overtravel, above the 0.55 mm manufacturer minimum. This depends on the actual switch's tolerance and lever shape: adjust each switch to trip before the stop, then verify overtravel, release and repeatability. The switch must never be the mechanical end stop.

Twin **MISUMI AUA2-20** extension springs return each segment outward. Each spring has2mm outside diameter,0.2mm wire,20mm overall free length,0.13N initial tension and0.032N/mm nominal rate. The geometry gives21mm pin spacing at rest and24mm when pressed, corresponding to about0.162N and0.258N per spring. Its hook inside diameter is about1.6mm. Each printed anchor therefore has a1.1mm bore and3mm wide access notch for a **1mm steel pin,10mm long**; the spring loads the metal pin rather than a thick printed peg. Ream/drill carefully, fit the spring before sliding in the pin, and retain pin ends with a small adhesive dab outside the hook-bearing surface. Verify the actual hook dimensions and free movement. Measure total actuation force including switch and slider friction; spring tolerances, force and the contact circuit remain physical hold points. The rendered spring tubes show the selected2mm envelope, not helical manufacturing geometry. European personal-order availability may require a distributor or equivalent matched spring.

## Sensors and service clearances

Six Pololu 3415 VL53L1X boards face outwards at 60° intervals. Three more use downward/outward carriers beside the wheel stations. Each board proxy is the manufacturer's 13 × 18 × 2 mm envelope. Carrier attachment uses foam and small cable ties, so no undocumented PCB hole pattern is assumed. Apertures and emitter/receiver position must be checked on the actual boards; avoid reflective cover plastic over ToF optics.

The floor probes are at wheel angles 30°, 150° and 270°, radius108mm, tangential offset+42mm and Z≈37mm, pitched50° outward from vertical. The central floor ray intersects near local radius152mm/tangent+42mm, ahead of the wheel's 144.6 mm radial edge. The tangential offset allows the ray to pass beside the wheel rather than through it. This is a geometric placement check only. The FoV, floor reflectivity, rug edges, movement direction, oblique drop edges, braking distance and sensor latency are not validated. The first robot is for a **stair-free, supervised floor area**. Do not infer stair safety from the CAD or three probes.

The IDEC YW1B-V4E01R motor stop uses a nominal 22.3 mm panel cutout, modelled as 22.5 mm for printing. The head is 40 mm wide and about 28.6 mm above the panel, giving the robot its 171.6 mm total height. The reserved rear extent is 45.8 mm, with additional space needed for leads. The head, neck and rear body are simplified envelopes; physically check panel thickness, antirotation feature, locknut and terminal access. Its normally closed contact should drive a suitable motor-power disconnect circuit; it does not replace battery protection or proper power wiring.

## What the checks establish

The exporter rejects invalid/non-positive solids, disconnected printed bodies, oversized print boxes and unintended static intersections between every pair of printed parts, plus the selected purchased-part pairs listed in `checks.json`. It also tests all registered electronics-carrier shaft paths through the chassis. Bounding boxes use exact BRep geometry, excluding cached display-triangle deflection. Three contact locations are calculated from the **manufacturer wheel envelope**; individual roller proxies are illustrative. The manifest distinguishes purchased envelope facts from adjustable printed interfaces and unverified details.

The static printed-part check does not constitute an exhaustive collision analysis of moving purchased parts, wires, connectors and tolerances, or a stiffness, thermal, electronics or safety analysis. Cables, connectors, washer stacks, insert seating, spring force, hub retention and every actual purchased part must be checked during the coupon and bench stages. Do not print the entire robot or buy the full optional sensor quantity before the motor/hub/coupon interface has been verified.

## Dimension sources

- [Pololu 4866](https://www.pololu.com/product/4866) and [25D motor dimension diagram](https://www.pololu.com/file/0J1634/25d-metal-gearmotor-dimension-diagram.pdf).
- [Nexus 60 mm double omniwheel drawing](https://www.nexusrobot.com/wp-content/uploads/2016/09/60mm-Aluminum-Double-Omni-Wheel.pdf); matching hub is Nexus 18018, 4 mm bore.
- [Pi 5 mechanical drawing](https://datasheets.raspberrypi.com/rpi5/raspberry-pi-5-mechanical-drawing.pdf).
- [OAK-D Lite hardware](https://docs.luxonis.com/hardware/products/OAK-D%20Lite).
- [Pololu 3415 VL53L1X carrier](https://www.pololu.com/product/3415).
- [Gens Ace 3S 2200 mAh XT60 pack](https://www.elefun.no/vare-64255/batteri-lipo-3s-2200mah-45c-gens-ace-g-tech-xt60).
- [Omron D2F datasheet](https://omronfs.omron.com/en_US/ecb/products/pdf/en-d2f.pdf).
- [Ruthex RX-series insert dimensions](https://www.igo3d.com/mediafiles/Sonstiges/Ruthex/ruthex_Datenblatt_RX-Serie.pdf).


- [MISUMI AUA2-20 extension spring](https://uk.misumi-ec.com/vona2/detail/110302603670/?HissuCode=AUA2-20).
- [Carling V1D1B60B-CMC00-000](https://www.digikey.com/en/products/detail/carling-technologies/V1D1B60B-CMC00-000/3025047).
