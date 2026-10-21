## Shared base and purchasing notes

All three robots share the same 29 cm omni-wheel base, Raspberry Pi 5, Pico motor controller, rechargeable battery and manual balance charger. Only the camera assemblies and the three-camera version's powered USB branch change. The selected version's complete machine-readable BOM and CSV accompany this document.

There are no distance sensors, I²C multiplexers or dedicated ranging-sensor regulator in any version. The IMU and motor encoders measure motion. Physical bumper switches register contact.

### Camera choices

- **One front camera:** Waveshare OV2735 2MP USB Camera (A), SKU 33122, USD 14.99 observed. Basic fixed-focus USB video.
- **Front + left + right:** three of the same modules, plus official Raspberry Pi USB 3 Hub SC1636 and the DFRobot DFR0849 separate USB power converter. More coverage; these independent cameras are not a stereo pair.
- **Stereo:** Waveshare AR0144 Stereo USB Camera (A), SKU 32695, USD 66.99 observed. The synchronized pair requires calibration and host-computed depth; it is not an OAK depth processor.

See camera-options.md for source links, exact mechanical interfaces and USB qualification notes. Camera current was not published in the retrieved complete-module specifications, so measure actual draw and descriptors before accepting the wiring. Verify the stereo module's delivered color/mono specification; no selectable color variant has been assumed.

### Matched drive interfaces

Use three Pololu **4866 75:1 25D MP 12 V encoder motors**, not an HP variant. Each has a 4 mm D shaft with 12.5 mm exposed length, 100 rpm unloaded speed and 1.8 A stall at 12 V. The selected drivers are three **2997 TB9051FTG** carriers. [Motor](https://www.pololu.com/product/4866), [driver](https://www.pololu.com/product/2997).

Wheels are Nexus **14145**, 60 mm double omni wheels, with matching **18018 4 mm hubs**. Use the manufacturer's 25.6 mm overall wheel drawing width; a retailer text says 12 mm. Final shaft engagement, hub retention, screw seating and a full wheel rotation need checking with received hardware. Wheel stock remains a procurement hold. [Wheel](https://www.nexusrobot.com/product/60mm-aluminum-double-omni-wheel-basic-14145.html), [hub](https://www.nexusrobot.com/product/4mm-aluminum-mounting-hub-for-60mm-omni-wheel-18018.html).

### Battery and manual charging

Battery: Gens ace G-Tech **3S 2200 mAh 45C XT60**, GEA223S45X6GT / B-45C-2200-3S1P-XT60-GT, nominal 105 × 34 × 23 mm. Charger: **iMars Mini G-Tech 60 W GEA60WE1** 2–4S kit with 65 W USB-C AC supply. Check the actual XT60 and balance leads before buying duplicates. The charger kit's 5 V / 3 A supply is not the Pi's mobile supply. Use the battery removed from the robot and the matching LiPo balance-charge program. [Battery](https://www.elefun.no/vare-64255/batteri-lipo-3s-2200mah-45c-gens-ace-g-tech-xt60), [charger](https://www.elefun.no/vare-59757/computerlader-gens-ace-imars-mini-g-tech-2-4s-60w).

### What the materials allowance covers

The webpage includes an adjustable allowance for these items, rather than pretending they have a checked-out price:

- 64 GB A2 microSD and reader if needed; official 27 W EU Pi bench power supply.
- Short USB data cables: one per camera module and one Micro-B cable for Pico. The stereo pair uses one USB cable; the three-camera version also needs a USB-A → USB-C power cable to its hub.
- Genuine AMASS XT60 connectors; 16–18 AWG battery/motor wiring; paired 20 AWG Pi power wires; signal wiring, ferrules and insulated terminals.
- MINI fuse holders: 10 A main, 7.5 A motor branch and 5 A Pi branch. Three-camera version adds a 2 A input fuse for its separate camera converter.
- Molex Micro-Fit 3.0 power harness and Samtec GPIO socket, as specified in wiring.md.
- Encoder/DIAG divider resistors, bumper-input resistors, three onsemi 2N7000G MOSFETs and capacitors. Use the complete wiring schedule, including the 5 V contact-wetting circuit.
- Motor suppression capacitors, bulk capacitor, TVS, heatshrink, strain relief, ties, foam pads, battery straps and filament.
- Fasteners, bumper sleeves and spring anchor pins. Use the **selected variant's assembly guide and print queue** for actual counts and lengths; camera mounts differ between versions.

The separately priced ruthex **RX-M3Sx4.0 SHORT** 100-pack is outside that allowance. Its nominal insertion bore is 4 mm with 5 mm blind depth; print the fit coupon first. The exact six bumper springs are **MISUMI AUA2-20** with 1 mm steel anchor pins; business-account eligibility, price, shipping and physical return force remain unconfirmed.

### Before ordering and building

Prices are observed store listings from 20–21 October 2026. The webpage converts them to NOK using visible assumptions and includes estimated import VAT and shipping. Confirm final VAT, freight, battery transport and stock in the actual cart. No orders have been placed.

Print the insert and motor fit coupons first. Confirm dimensions of received parts before printing the body. Then check electrical polarity and rails, encoder levels, stop and broken-wire bumper behavior with wheels raised. Finally test camera frames, delay and low-speed driving on a flat floor. The design and exports are not physical test results.
