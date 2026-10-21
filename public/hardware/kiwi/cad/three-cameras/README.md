# Kiwi K1 camera variants · editable mechanical prototype

Three separate CAD assemblies share a 292mm wheeled/contact-bumper platform. All three variants are171.6mm tall overall, set by the top-mounted stop button. Camera boards and frames remain below the lid. Each export has its own actual geometry, named STEP, GLB, individual STLs, drawings, print queue, hardware quantities and qualification report.

| Variant | Camera hardware | Additional camera electronics |
|---|---|---|
| `front-camera` | One Waveshare OV2735 USB Camera(A), SKU33122, facing forward | Direct USB connection to Pi |
| `three-cameras` | Three OV2735 modules facing front0°, left+45° and right−45° | Raspberry Pi USB3Hub SC1636 and dedicated DFRobot DFR0849 5V camera supply |
| `stereo` | One Waveshare AR0144 Stereo USB Camera(A), SKU32695, with two synchronized views and52mm baseline | Direct USB connection to Pi |

All variants retain wheel encoders, an internal IMU and mechanical contact bumpers. There are no ToF modules, rangefinder carriers, sensor multiplexers or dedicated3.3V rangefinder supply in these assemblies. Camera performance, motion estimation and stopping behavior require software and physical validation; these are supervised, stair-free indoor prototypes.

## Source and reproduction

`kiwi.py` contains the editable CadQuery construction. The main dimension dictionary, camera configurations and named functions define the mechanical features; this is not a universal scaling control. Changing motors, wheels, connectors or camera boards requires reviewing their related interfaces and rerunning the checks.

Tested requirements are pinned in `requirements.txt`: CadQuery2.8.0 and trimesh4.8.3. Install them into a fresh virtual environment and export from the project root:

```sh
python3 -m venv .venv-cad
.venv-cad/bin/pip install -r hardware/kiwi/cad/requirements.txt
.venv-cad/bin/python hardware/kiwi/cad/kiwi.py --variant front-camera --output public/hardware/kiwi/cad/front-camera
.venv-cad/bin/python hardware/kiwi/cad/build_variants.py
.venv-cad/bin/python hardware/kiwi/cad/package.py
```

After extracting `source.zip` into its own folder, the equivalent single-model command is `python kiwi.py --variant front-camera --output ./front-camera`; the shorter file paths apply because the source bundle is flat. `package.py` is a repository packaging helper.

For this workspace, substantial geometry/export work runs on a home worker through `codex-home`. A remote build does not update the local checkout: check its actual exit status, retrieve the requested CAD outputs and verify their source hashes before packaging.

Each variant export includes:

- `assembly.step`: named printable solids and purchased reference components.
- `assembly.glb`: colored named meshes in meters, Y up, forward−Z; CAD source uses millimeters, Z up, forward+Y.
- `manifest.json`: every assembled instance, dimensional status, print-file grouping, hardware quantities, source hash and camera configuration and `cameraPlacement` poses/ports in CAD millimeters and GLB meters.
- `assembly-fasteners.json`: hardware schedule with stable item IDs for the purchasing table.
- `validation.json` / `checks.json`: identical computational qualification reports.
- `assembly-drawing.svg`: combined dimensioned top/side layout; STEP is the geometry authority.
- `stl/` and `print-queue.csv`: unique print files and required quantities, including two small coupons.
- `kiwi-print-pack.zip`, `source.zip` and `assembly-guide.md`.

Purchased boards, optical glass, connector details, wheel rollers and switch bodies are documented envelopes/reference geometry rather than vendor manufacturing models. The DFR0849 is specifically a50×40mm board footprint with a25mm height reservation; that height is not a measured manufacturer dimension.

## Common drivetrain and structure

Three wheel/motor stations are radial at30°,150° and270° from+X. Wheel centers are at radius131.8mm and Z30mm. The60mm manufacturer wheel envelope reaches the Z0 floor plane at three contact points. The support triangle's inradius is only65.9mm: keep heavy components central and low, and measure the finished mass distribution before considering payloads.

Pololu4866 motors use a25mm diameter×23mm gearbox,24.4mm diameter×30.8mm motor can and14.7mm encoder section:68.5mm behind the gearbox face. The4mm D shaft is exposed12.5mm. Two-station split cradles clamp the gearbox and motor can with0.6mm nominal diametral print clearance, so the design does not depend on guessed motor face holes. Each assembly uses four M3×45 through-bolts and trapped M3 nuts. Tighten evenly without distorting the metal can or pressing on the encoder.

The gearbox face is at radius102mm. The Nexus18018 hub begins at103mm, leaving1mm face clearance; its flange ends at119mm. The Nexus14145 double omniwheel is25.6mm wide in its drawing, despite ambiguous12mm product prose. The outboard face is at144.6mm. The proposed hub stack engages11.5mm of the shaft, and its set screw falls within the engaged D-flat region. Fit, concentricity and loaded retention remain physical hold points.

Wheel/hub mounting uses the21mm PCD and the actual thin center web, not the full25.6mm wheel width. A4mm flange, about2.5mm web and M3 low-profile nut suggest M3×10 as an initial stack. Confirm head seating, nut protrusion and roller clearance on the actual wheel before accepting that hardware.

The6mm deck splits into two parts with0.5mm seam clearance. Three underside splice plates sit at Y−46,0 and+72mm. The center plate is retained through the IMU carrier using M3×14 screws. In the three-camera assembly, the front plate is retained through the camera-power carrier with M3×14; otherwise the front and rear splice plates use M3×12.

The105×34×23mm Gens Ace3S2200mAh XT60 pack rests on4mm locating rails, held by two15mm hook-and-loop straps. Three motor-lead feedthroughs, tie slots and2.2mm signal-wire races leave3.8mm of deck web. Route large XT60 and USB connectors around the structure; do not force them through small signal passages or pinch leads beneath carriers.

Three Pololu2997 TB9051FTG driver boards occupy the left carrier raised23mm to clear bumper mechanisms. The Pico2 has its own front-left carrier. Pololu2866 D24V90F5 Pi power and Pololu2813 motor disconnect have separate right-side carriers. The Pololu2798 IMU uses the central carrier. Board attachment uses insulating pads/straps where a hole pattern has not been deliberately modeled.

The Pi5 uses documented85×56mm PCB dimensions and58×49mm mounting-hole pitch, offset10mm towards one end relative to the PCB center. Four41mm risers support its ventilated tray. The active-cooler and connector models reserve space; verify the actual cooler, GPIO power lead and USB bends. The Carling V1D1B60B-CMC00-000 rear main rocker is retained by a structural panel and posts. Its printed opening is37.13×21.38mm for a nominal36.83×21.08mm cutout. The family rear envelope is37.57mm with a60mm total terminal/wire zone; physically check the delivered switch and insulated terminals.

## Camera mounting and cable access

All camera centers are at Z117mm inside the body. Only the optical glass is visible through shell ports: no camera PCB, camera post or USB connector projects above the lid. The camera structures attach to the chassis or Pi tray, so cosmetic shell removal does not remove their support. The lid has its service ventilation and stop-button opening; there are no camera cutouts in the roof.

The front frame is supported by two short forks attached to the deck at X±43/Y94mm. Their upper bridges meet the frame at X±43/Y106/Z96mm with M3×10 screws. In the three-camera model, the oblique modules point45° either side of forward. Each frame has a diagonal structural arm that meets an existing Pi tray front-corner riser at X−47/Y58 or X+47/Y58/Z99mm. Replace those two tray-top M3×10 screws with M3×14 screws to include the4mm mounting foot; these are real mechanical mounts rather than camera posts carried by the shell. All cameras face level; the view angles are design choices, not claims about any vehicle manufacturer's camera layout.

The OV2735 PCB is25×25×1.6mm, with four2mm holes on21×21mm pitch. The modeled lens is14mm diameter and projects16mm from the PCB front. PCB rear radius is107.4mm and glass front radius125mm. A20mm circular port in the curved126mm shell leaves the glass approximately1mm recessed. Use four M2×10 screws and nuts per camera, tightening lightly. The printed frame holes are2.2mm. Optical glass and USB housing details are reference geometry. The connector is centered on one board edge, oriented down, with a modeled14×10×30mm plug/bend zone below it and a tie relief ear. Check the delivered plug and cable against this allocation.

For the mono modules, the96° nominal diagonal field of view gives approximately88.14° horizontal and57.14° vertical under a16:9 pinhole assumption. The three poses nominally span178.14° with43.14° overlap between neighbors. This is a planning estimate; the actual lens distortion, active image crop and entry pupil require calibration. The aperture check conservatively expands the entire14mm lens front by those ray slopes across the1mm glass setback. The20mm port has about1.89mm radial planning margin. Check a large physical field-of-view target with the shell installed before accepting the view; a clear CAD cone does not establish image quality or absence of vignetting.

The stereo PCB is66×30×1.6mm, with four3.2mm holes on60×24mm pitch. Lens centers are52mm apart, each7mm from a board end, with14mm diameter barrels. The17.72mm front extent from the PCB rear and3.5mm reference USB rear allowance set its board rear at Y106.28mm and glass at Y124mm. A shell-integrated82×28mm flat front facet has an outer face at Y125mm and a3mm front skin with two20mm lens ports. This avoids the circular shell sag intersecting the wide stereo lens pair. The manufacturer nominal65° horizontal and43° vertical field of view leave about2.25mm radial planning margin across the1mm setback. The stereo frame top is Z138mm, below the lid at139.4mm; PCB top is132mm. Four M3×12 screws and nuts attach the board to3.4mm frame holes. No supplied calibration or depth accuracy is implied by the mechanical52mm baseline.

The three-camera assembly adds the57.4×52.4×18mm SC1636 hub on a raised central cradle above the IMU, below the Pi tray. Four10mm risers use M3×10 bottom screws and shorter M3×8 top screws so opposed screws do not collide. Its captive upstream lead is80mm: confirm reach and bend radius to the actual Pi USB socket before installing panels.

The dedicated DFR0849 supply sits on a separate front carrier, rotated90° so its USB-A outputs face robot right. Its50×40mm footprint is documented; the25mm vertical allocation must be checked against the delivered assembly. Preserve30mm side plug/bend space. Its5V output powers the hub through a proper USB-A-to-C cable; the input, fused branch, current capability and upstream isolation are electrical commissioning requirements. The hub does not increase USB2 bandwidth, and neither module's full system current is certified by this CAD.

## Contact bumper mechanism

Three80° segments cover240° at radius143–146mm and Z62–74mm. Three40° wheel sectors remain open. Low objects and obstacles entering a gap can hit a wheel or frame first. This is not360° contact protection.

Each segment moves inward3mm on two5mm OD/3.2mm ID×16mm steel sleeves, M3×25 retaining screws and washers. The sleeve height prevents tightening the screw onto the slider. Independent printed stop blocks limit travel; the switch is never the end stop. Check free movement and washer clearances after printing.

An Omron D2F-01L switch uses its documented6.5mm hole pitch, M2×20 through-bolts and radial adjustment slots. The actuator moves from radius124 to121mm. Adjust each switch to trip before the hard stop and confirm at least its specified0.55mm overtravel without overstressing the lever. The nominal model permits0.8mm; tolerance and actual lever shape require measurement.

Two MISUMI AUA2-20 springs per segment have2mm OD,0.2mm wire,20mm free overall length,0.13N initial tension and0.032N/mm nominal rate. Pin spacing21mm at rest and24mm pressed gives about0.162/0.258N per spring. Its approximately1.6mm hook ID fits a1mm steel anchor pin,10mm long, through a1.1mm printed bore and access notch. Ream carefully, fit springs before pins, and retain pin ends outside the bearing surface. Confirm force, release and repeatability physically; spring tubes in the GLB are envelopes, not helical manufacturing geometry.

## Printing and assembly qualification

Print the motor-clamp and insert coupons first. Inserts are ruthex RX-M3S×4.0 SHORT,4.6mm outside diameter and4mm long, using the manufacturer's4mm bore and5mm depth. The coupon contains3.9/4.0/4.1/4.2/4.3mm bores left to right. Check cooled retention and tune the bore for your printer/material before fitting all inserts.

PETG,0.2mm layers,4–5 perimeters and about30% infill are starting slicer settings, not measured strength data. The252mm maximum part dimension leaves2mm per side on a256mm bed; avoid an external brim that exceeds the bed. Do not scale STLs. Decks/lids/carriers lie flat; motor cradles export with the motor axis vertical. Towers, ledges and camera frames may need local supports. Inspect the slicer preview and remove supports without damaging small holes.

Follow `print-queue.csv`, then assemble: seam plates and motor cradles; drivetrain fit; battery/electronics; Pi tray; contact mechanisms; internal camera forks/frames; variant USB/power carriers; main/stop switches; shell and lid halves. Wire routing and hardware stack checks happen before closing the shell. The accessible IDEC stop uses22.5mm printed panel clearance for its22.3mm nominal cutout,40mm head and28.6mm projection. Verify its retention and the real motor-power disconnect circuit on the bench.

The exporter rejects invalid/non-positive solids, disconnected printed bodies, print footprints over252mm, blocked registered chassis fastener paths and unintended static intersections between all printed parts. It also checks selected purchased-part interfaces, all camera PCB envelopes within the shell, camera fastener paths, the specified downward USB plug zones against structural/electronics obstacles, and outward planning cones against printed parts. These cone checks use nominal pinhole angles and a documented lens-front allowance, not a measured optical model. Exact BRep boxes ignore display-triangulation inflation. Wheel contact points derive from the manufacturer envelope; roller shapes remain illustrative.

These checks do not qualify printed strength, moving-part tolerances, measured optical visibility, USB power/bandwidth, wiring, hub retention, thermal behavior, braking, tip margin or autonomous operation. Camera-only perception is not a validated stair detector. The initial operating area is supervised and stair-free. Perform the coupons, single motor/hub bench check and physical electrical tests before ordering or printing the entire build.

## Dimensional sources

- [Pololu4866](https://www.pololu.com/product/4866) and [25D motor drawing](https://www.pololu.com/file/0J1634/25d-metal-gearmotor-dimension-diagram.pdf).
- [Nexus60mm double omniwheel drawing](https://www.nexusrobot.com/wp-content/uploads/2016/09/60mm-Aluminum-Double-Omni-Wheel.pdf), matching18018 hub.
- [Pi5 mechanical drawing](https://datasheets.raspberrypi.com/rpi5/raspberry-pi-5-mechanical-drawing.pdf).
- [Waveshare OV2735](https://www.waveshare.com/ov2735-2mp-usb-camera-a.htm) and [outline drawing](https://d2air1d4eqhwg2.cloudfront.net/markdownx/82ec46a9-5b11-422e-8bdf-77a6714958d5.png).
- [Waveshare AR0144 stereo](https://www.waveshare.com/ar0144-stereo-usb-camera-a.htm) and [outline drawing](https://cdn.static.spotpear.cn/uploads/picture/product/module/camera/AR0144-Stereo-USB-Camera-A/AR0144-Stereo-USB-Camera-A-details-06.jpg).
- [Raspberry PiUSB hub](https://www.raspberrypi.com/documentation/accessories/usb.html) and [DFRobot DFR0849](https://www.dfrobot.com/product-2299.html).
- [Omron D2F](https://omronfs.omron.com/en_US/ecb/products/pdf/en-d2f.pdf), [MISUMI AUA2-20](https://uk.misumi-ec.com/vona2/detail/110302603670/?HissuCode=AUA2-20) and [ruthex inserts](https://www.igo3d.com/mediafiles/Sonstiges/Ruthex/ruthex_Datenblatt_RX-Serie.pdf).
