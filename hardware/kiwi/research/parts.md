# Kiwi / parts and electrical design basis

Research checked **20–21 October 2026**. This is a matched prototype bill of materials, with procurement and bench-test gates called out explicitly. No order has been placed. Prices are observations of the linked storefronts, not a delivered Norway quotation. Shipping, import handling, battery transport, final VAT mode and availability at checkout remain unverified. Keep USD, NOK and INR separate; do not add them without an explicit exchange-rate assumption.

## Locked mechanical references

| Quantity | Part | Drawing dimensions used in CAD | Source |
|---|---|---|---|
| 3 | Pololu **4866**, 75:1 25D MP 12 V gearmotor with 48 CPR encoder | Gearcase Ø25 mm, can Ø24.4 mm; body behind gearbox face 68.5 mm = gearbox 23 + can 30.8 + encoder 14.7; output **4 mm D shaft, 12.5 mm exposed**, last 7 mm flattened; two M3 face holes 17 mm apart, max 6 mm screw engagement | [Product](https://www.pololu.com/product/4866), [manufacturer drawing, page 2](https://www.pololu.com/file/0J1634/25d-metal-gearmotor-dimension-diagram.pdf), [STEP download page](https://www.pololu.com/product/4866/resources) |
| 3 | Nexus **14145** / RobotShop RB-Nex-75, 60 mm double aluminum omni wheel | **Ø60 × 25.6 mm overall width**; 73 g; six small mounting holes on Ø21 mm pitch circle, use alternating three for hub | [Manufacturer](https://www.nexusrobot.com/product/60mm-aluminum-double-omni-wheel-basic-14145.html), [dimension drawing](https://www.nexusrobot.com/wp-content/uploads/2016/09/60mm-Aluminum-Double-Omni-Wheel.pdf), [independent manufacturer sheet confirming 25.6 mm width](https://www.vstone.co.jp/products/nexusrobot/download/nexus_14145.pdf) |
| 3 | Nexus **18018** / RobotShop RB-Nex-78, 4 mm mounting hub specifically for 14145 | Bore Ø4; overall length16; Ø28 flange ×4 thick, Ø15 barrel ×12; M3 radial set screw 8 mm from barrel end; three Ø3.2 flange holes on Ø21 pitch circle | [Manufacturer](https://www.nexusrobot.com/product/4mm-aluminum-mounting-hub-for-60mm-omni-wheel-18018.html), [dimension drawing](https://www.nexusrobot.com/wp-content/uploads/2016/09/4mm-Hub-for-60mm-Omni-Wheel.pdf) |
| 1 | Gens ace G-Tech 2200 mAh 3S 45C XT60, **GEA223S45X6GT**, Elefun **B-45C-2200-3S1P-XT60-GT** | 105 ×34 ×23 mm pack; retailer 190 g / manufacturer about182 g. Use110 ×40 ×30 mm adjustable strapped bay plus separate wire space. | [Manufacturer](https://gensace.de/de/products/gens-ace-g-tech-2200mah-11-1v-45c-3s1p-lipo-battery-pack-with-xt60-plug), [Norwegian retailer](https://www.elefun.no/vare-64255/batteri-lipo-3s-2200mah-45c-gens-ace-g-tech-xt60) |
| 1 | Luxonis **OAK-D Lite Fixed-Focus A00532** | 91 ×28 ×17.5 mm,61 g; saddle/strap mounting; reserve30 mm beyond USB connector. Do not invent case mounting holes. | [Manufacturer storefront and specification](https://checkout.luxonis.com/products/oak-d-lite-1) |
| 9 | Pololu **3415** VL53L1X carrier | 13 ×18 ×2 mm PCB; 6 perimeter and3 downward modules. Leave optical windows uncovered and use open apertures. | [Manufacturer](https://www.pololu.com/product/3415) |
| 1 | IDEC **YW1B-V4E01R**, nonilluminated1NC latching stop | Ø40 mushroom; nominal22 mm mounting class,22.3 mm panel opening; panel0.8–6 mm;45.8 mm rear depth, reserve55 mm with terminals/wires;28.6 mm projection | [Manufacturer](https://www.idec.com/en-apac/switches-indicator-lights/switches-pushbuttons/22mm-25mm-30mm-switches/yw-series/yw1b-v4e01r), [manufacturer dimension sheet](https://eu.idec.com/idec-eu/en_EU/medias/SAPEN01A-B269B300-YW.pdf?context=bWFzdGVyfGRvY3VtZW50c3wxNDQ3MDkzfGFwcGxpY2F0aW9uL3BkZnxoZDIvaGNlLzM0NjMxNTk0Mjc4OTQyL1NBUEVOMDFBLUIyNjlCMzAwLVlXLnBkZnxiM2RjZjg3ZTBlMzZiNzE5N2RiOTY3YzY2NGU5Y2ZmMjAzODNjNDhhYTc0YTJlNDdkN2QzNDlhMzc3YTZjNmJh) |

**Drawing conflict resolved:** the Nexus wheel web description says axial width12 mm; its dimensioned drawing and product sheet say25.6 mm overall. CAD uses25.6 mm. The wheel load rating is3 kg each, but this does not establish shaft bearing life or robot stability. Manufacturer and retailer both explicitly match18018 to14145; an [old retailer discussion documents a corrected mounting drawing](https://community.robotshop.com/forum/t/how-to-adapt-the-rb-nex-75-wheels/24539).

**Shaft engagement:** orient the hub barrel toward the gearbox; set its end1 mm clear of the motor face. Shaft insertion is11.5 mm into the16 mm bore. The set screw then lies9 mm from the face, within the shaft's7 mm long terminal flat. This is a dimensionally plausible assembly; verify actual runout, set-screw access, flange screws and wheel clearance on the first purchased wheel before freezing the printed motor pods. A split clamp avoids guessing motor face tolerances, but it still needs a print-fit coupon.

## Core shopping list

Prices are per item unless extended. Stock statements below are what the page exposed during research; an Add to cart button with backorders allowed is not confirmed inventory.

| Qty | Buy exactly / purpose | Observed price | Availability / order link |
|---:|---|---:|---|
| 3 | Pololu4866 MP12V75:1 encoded motors | USD53.95;161.85 total | Active/preferred; backorders allowed, quantity on hand not exposed. [Pololu](https://www.pololu.com/product/4866) |
| 3 | Nexus14145 wheels | USD15.95;47.85 total | **RobotShop says re-stocking soon, ETA unavailable.** This is a procurement gate. [RobotShop](https://www.robotshop.com/products/60mm-aluminum-omni-wheel). Alternate exact SKU [Oz Robotics](https://ozrobotics.com/shop/omni-wheel-double-aluminum-basic-60mm-14145/) listsUSD15, shipsfromChina, inventoryunconfirmed. [SandoRobotics Mexico](https://sandorobotics.com.mx/producto/14145/) shows10available atMXN820 eachincludingIVA; deliverytoNorwayunverified. |
| 3 | Nexus18018 Ø4 mm hubs | USD7.76;23.28 total | RobotShop16 units shown. [RobotShop](https://www.robotshop.com/products/4mm-aluminum-mounting-hub-60mm-omni-wheel). Alternate [Studica](https://www.studica.com/4mm-hub-for-60mm-omni-wheel) USD4.49,7 units shown. |
| 3 | Pololu**2997 TB9051FTG** single motor drivers | USD12.95;38.85 total | Active/preferred, backorders accepted. Includes headers and2-pin terminal blocks, soldering required. [Pololu](https://www.pololu.com/product/2997) |
| 1 | Raspberry Pi5 **4 GB SC1111/SC1431**, computer | USD110.00 | Current retailer price; do not reuse launch MSRP. [PiShop](https://www.pishop.us/product/raspberry-pi-5-4gb/) |
| 1 | Raspberry Pi**Active Cooler SC1148** | USD10.95 | Add to cart displayed. [PiShop](https://www.pishop.us/product-category/raspberry-pi/raspberry-pi-cooling/) |
| 1 | Raspberry Pi**Pico2 with headers SC1632** | USD6.60 | SparkFun in stock. [SparkFun DEV-29127](https://www.sparkfun.com/raspberry-pi-pico-2-with-headers.html), [manufacturer CAD/product identity](https://pip.raspberrypi.com/categories/1264-raspberry-pi-pico-2-h) |
| 1 | Luxonis**OAK-D Lite Fixed-Focus A00532** | USD269.00 | Store says100+ stock and variant JSON available; generic button also contains out-of-stock text. Confirm selected **Fixed-Focus** variant at checkout. [Luxonis](https://checkout.luxonis.com/products/oak-d-lite-1) |
| 9 | Pololu3415 VL53L1X carriers | USD22.95;206.55 total | Active/preferred, backorders accepted. [Pololu](https://www.pololu.com/product/3415) |
| 2 | Adafruit**2717 TCA9548A** I²C multiplexer | USD6.95;13.90 total | In stock. PCB30.6 ×17.6 ×2.7 mm, headers need solder. [Adafruit](https://www.adafruit.com/product/2717) |
| 1 | Pololu**2798 LSM6DSO** six-axis base IMU | USD19.95 | Active/preferred;13 ×23 ×3 mm. [Pololu](https://www.pololu.com/product/2798) |
| 1 | Pololu**2866 D24V90F5** 5V high-current regulator | USD36.82 | Rationed active, backorders allowed;40.6 ×20.3 ×7.6 mm. Size and output-load test required. [Pololu](https://www.pololu.com/product/2866) |
| 1 | Pololu**5432 D45V5F3**, dedicated3.3V sensor regulator | USD5.75 | Active/preferred, backorders allowed;7.6 ×11.4 ×2.8 mm. [Pololu](https://www.pololu.com/product/5432) |
| 1 | Pololu**2813 Big Pushbutton Power Switch HP**, self-off/reverse protection | USD8.95 | Rationed active, backorders allowed;20.3 ×25.4 mm. **Not the emergency stop.** [Pololu](https://www.pololu.com/product/2813) |
| 3 | Omron / Aratas **D2F-01L** gold-contact hinge-lever SPDT bumper switches | USD0.93;2.79 total | DigiKey81,625 shown. Mounting holes6.5mm apart, body12.8 ×5.8mm. [DigiKey](https://www.digikey.com/en/products/detail/omron-electronics-inc-emc-div/D2F-01L/83264), [manufacturer drawing pp3–4](https://omronfs.omron.com/en_US/ecb/products/pdf/en-d2f.pdf) |
| 1 | Carling **V1D1B60B-CMC00-000** complete20A12VDC rocker main disconnect | USD12.61 reference | Complete switch including actuator, not the bare00000body. Cutout36.83 ×21.08mm;6.3mmspade terminals. [Exact distributor SKU:892stock shown](https://www.digikey.com/en/products/detail/carling-technologies/V1D1B60B-CMC00-000/3025047), [manufacturer family data](https://www.carlingtech.com/sites/default/files/documents/V-Series_datasheet.pdf) |
| 1 | IDEC**YW1B-V4E01R** latching motor cutoff | NOK291.80 ex VAT /364.75 incl shown | DigiKeyNO440 shown. [DigiKey Norway](https://www.digikey.no/en/products/detail/apem-inc/YW1B-V4E01R/15216547). Same manufacturer SKU [TME US](https://www.tme.com/us/en-us/details/yw1b-v4e01r/panel-mount-switches-standard-22mm/idec/) USD10.30,107 shown; delivery/VAT to Norway unverified. |
| 1 | Gens ace G-Tech3S2200mAh45CXT60 battery above | NOK349 displayed | Retail page VAT mode and stock count unclear; manufacturer shop says unavailable. [Elefun64255](https://www.elefun.no/vare-64255/batteri-lipo-3s-2200mah-45c-gens-ace-g-tech-xt60) |
| 1 | Gens ace**iMars Mini G-Tech2–4S60W GEA60WE1** charger kit **with65WUSB-C AC supply** | NOK649 displayed |10–25 shown. [Elefun59757](https://www.elefun.no/vare-59757/computerlader-gens-ace-imars-mini-g-tech-2-4s-60w) |

The USB-powered charger supply is **not** a Pi5 supply: Elefun lists only3A at5V. Charger and battery share3S LiPo chemistry, XT60 main connection and XH/G-Tech balance compatibility. Inspect the package for the XT60 charge lead and USB-C lead before ordering duplicate accessories. The retailer page contains contradictory pasted English100W/6S specifications; use the actual **GEA60WE1 60W2–4S kit** and manufacturer instructions. The selected battery manufacturer page also has a generic T-plug sentence despite the XT60 title/SKU; inspect the exact supplied connector. Charge the disconnected pack through both main and balance connections, with the matching LiPo program; keep the battery out of the robot while charging. These checks precede a final order-ready cart.

## Small parts, wiring and fabrication consumables

These are functional procurement specifications; select a trusted local electronics/fastener shop and verify the exact package lengths before checkout. The allowance below covers them, rather than pretending an unverified generic marketplace item is a matched SKU.

| Qty to buy | Item / exact requirement |
|---:|---|
| 1 |64 GB A2 microSD card, plus USB card reader if absent; use64-bit Raspberry PiOS/Ubuntu image suitable for selected ROS stack |
| 1 | Short USB3 Type-A → Type-C **data** cable,20–30 cm, for OAK; verify USB3 link speed after assembly. OAK kit cable may be longer and can replace this if it fits. |
| 1 | Short USB-A → Micro-B **data** cable for Pico2; official Pico2 uses Micro-B, not USB-C |
| 1 | Official Raspberry Pi27W **EU** USB-C power supply for bench/setup; disconnect battery-fed5V harness while attached |
| 2 pairs | Genuine AMASS XT60 mating connectors with16–18AWG silicone pigtails, one robot main input pair plus service spare. Battery connector gender must be matched physically. |
| 3 | Inline **MINI** blade fuse holders rated≥15A/32VDC with16AWG leads: main10A, motor branch7.5A,5V rail5A. Put main fuse close to battery. |
| 3 each |10A/7.5A/5A MINI fuses including spare sets; Littelfuse297 series examples0297010.L,029707.5L,0297005.L. [Manufacturer ratings](https://www.littelfuse.com/assetdocs/littelfuse-datasheet-297-mini32v?assetguid=42c9dd21-a88e-4328-8e67-2f832444faf1) |
| 1 pair +8contacts | Molex **43025-0400** receptacle + **43020-0401** plug;4×female **43030-0007** +4×male **43031-0007** crimpcontacts,20AWGpaired5V/GNDwires≤150mm. These terminals are20–24AWG, not18AWG. [Female specs7A](https://www.molex.com/en-us/products/part-detail/430300007), [male](https://www.molex.com/en-us/products/part-detail/430310007). Pin1/2=5V,3/4=GND, thenPi2/4and6/9; seewiring.md. |
| 1 | Samtec **SSW-120-01-G-D** 2×20 through-hole female socket on insulated perfboard for the PiGPIOpower adapter; wire both5Vcontacts and twoGNDcontacts to short18AWG conductors with strain relief. Validate connector current/thermal rating in the actual assembly; do not send5A through a single Dupont jumper. |
| 4 | Insulated6.3mmfemale spade terminals and boots for Carling main rocker, rated≥15A and matched to16AWG wire |
| 6 each | M2×10 screws/M2nuts/washers for three D2F switches; add slots for fit adjustment |
| 3 | Removable2-pin motor connectors rated≥3A/contact and mating pigtails; alternatively use included driver screw terminals and ferrules |
| 12 sets | Locking4-way low-current sensor plugs, e.g. JST-PH2.0 with matching crimped leads, for9ToF,IMU andspares. These are a wiring-harness choice, not a native Pololu connector; solder to carrier pads. |
| 1 |100×80 mm perfboard or split smaller boards for driver/control/distribution, with insulated mounting and covered underside; not a solderless breadboard |
| 1 kit |22–26AWG signal wire,16–18AWG power wire, ferrules, heatshrink, cable ties, adhesive tie mounts |
| 20 each |10kΩ and15kΩ1% resistors: six encoder dividers and spares; each divider10k upper/15k lower gives3.0V from5.0V |
| 10 each |4.7kΩ and22kΩ1% resistors for3DIAGdividers(4.7kexternalupper/22klower;boardalreadyhas10k5Vpullup) andspares |
| 5 each |100kΩ and22kΩ1% resistors for battery and switched motor-voltage sensing;100k upper22k lower scales12.6V to2.27V; add100nF atADC node |
| 10 |100nF ceramic capacitors,≥25V;3 across motor terminals, othersADC/filter/decoupling |
| 3 |470–1000µF electrolytics,≥25V, on battery/motor distribution as required by scope testing; keep polarity correct |
| 2 |15V-class unidirectional TVS, e.g.1.5KE15A, for switched motor rail transient suppression; verify actual standoff/clamp values against12.6V pack and28V driver ceiling before assembly |
| 1 | Low-voltage3S balance-connector alarm as a supervised commissioning aid; firmware voltage monitoring and automatic power-off are still required, not supplied by this alarm |
| 1 | Momentary low-current panel button to Pololu2813 switch pads; dimensions remain a replaceable blanking-plate choice |
| 1 | LiPo charging/storage bag, plus2×15–20 mm hook-and-loop battery straps and2 mm closed-cell foam for cradle |
| 12 | M3×45 socket screws + 12 M3 nuts for the final motor split clamps |
| 4 | M3×12 seam splice screws; center splice shares IMU carrier fasteners |
| 38 | M3×10 screws: shell6 +lid8 +Pi risers8 +camera4 +driver risers4 +stop2 +rocker panel2 +spares4 |
| 8 | M3×16 screws: bumper carriers6 +spares2 |
| 20 | M3×14 screws: cliff6 +Pico2 +Pi power2 +disconnect2 +mux4 +IMU/splice2 +spares2 |
| 6 | M3×25 screws for translating bumper guides |
| 30 | M3 nyloc nuts: carriers/power22 +guides6 +spares2; separate12motor nuts remain in clamp sets |
| 52 | M3 plain washers: motor12 +guide6 +carrier/power28 +spares6 |
| 9 sets | M3×10 countersunk screws +9 M3 nuts for hub flanges; **conditional on actual wheel web seating** |
| 6 sets | M2×20 screws +nuts for Omron switches through body/carrier/deck stack |
| 4 | M2.5×8 screws for Raspberry Pi mounting |
| 6 | Guide sleeves, OD5 /ID3.2 /length16mm; source tube and cut/deburr to length |
| 6 | **MISUMI AUA2-20** SUS304 extra-light extension springs. OD2mm, wire0.2mm, free overall hook-to-hook20mm±1mm, estimated coil body16.4mm. Reference k0.032N/mm, initial tension0.13N; nominal0.162N at21mm rest /0.258N at24mm pressed. Maximum extension17.2mm, load0.69N. [Exact order code](https://uk.misumi-ec.com/vona2/detail/110302603670/?HissuCode=AUA2-20), [manufacturer family table and drawing](https://uk.misumi-ec.com/vona2/detail/110302603670/?HissuCode=AUA2-15). MISUMI EU sells to businesses only; price/lead time/Norway checkout unverified. Included in allowance. |
| 12 | Ø1mm steel anchor pins,10mm long each; retain axially. Spring loop ID approximately1.6mm; do not use an M3 shank as the spring hook. |
| 1 pack100 | **ruthex RX-M3Sx4.0 SHORT**, order **GE-M3Sx40-002**. CAD uses40,60spares. EUR8.99incltax; OD4.6,leadingOD3.9,L4.0,recommended bore4.0,minwall1.6,blinddepth≥5.0mm. [Manufacturer order](https://www.ruthex.de/en/products/ruthex-gewindeeinsatz-m3s-100stuck-rx-m3x4-0-short-messing-gewindebuchsen-fur-3d-druck), [manufacturer data PDF](https://www.igo3d.com/mediafiles/Sonstiges/Ruthex/ruthex_Datenblatt_RX-Serie.pdf). Trial coupon3.9–4.2mm. |
| 1 spool /optional | PETG for chassis/motor pods; optional TPU bumper pads. Print mass and structural adequacy remain unmeasured. |

**Bumper spring acceptance:** spring rates and initial tensions are manufacturer reference values, not guaranteed calibrated forces. At the shortest specified free length19mm, nominal force at24mm is0.29N before rate/tension variation. Test all six springs with a small force gauge and the actual sliding carriers; accept only if each returns the bumper against switch/guide friction and force is≤0.3N per spring at24mm. Two springs per segment nominally add0.516N at full travel, while the Omron switch can require0.78N; total bumper contact force is not the spring force alone. A force calculation does not prove reliable return, fatigue life or switch actuation.

**Main rocker packaging:** the manufacturer ConturaIII family drawing shows37.57mm below the bezel seating plane to bare terminal tips and14.80mm above for the illustrated locking rocker. Chosen C actuator is nonlocking, so use the larger illustrated envelope provisionally: face49.09×24.38mm, rear clearance60mm including insulated female spades and wire bend. Cutout36.83×21.08mm; supported panel thickness0.76–6.35mm without gasket. The family drawing is not an exact-SKU assembly drawing; physical verification remains required. [Manufacturer drawing, catalogue p6/PDF p21](https://datasheet.octopart.com/390-09002-001-Carling-datasheet-62278785.pdf), [current manufacturer ratings/cutout](https://www.carlingtech.com/sites/default/files/documents/V-Series_datasheet.pdf).

Wheel hub flange screws require9 positions total. The hub drawing calls outØ3.2 clearance holes rather than tapped holes, so budget9×M3×10 countersunk through bolts +nuts with final length established from the actual wheel stack; do not assume three generic short screws included with a wheel are suitable.

## Electrical architecture and compatibility

```text
3S LiPo: 11.1V nominal, 12.6V charged
  → XT60 → 10A main fuse → Carling20A main disconnect → Pololu2813 HP self-off switch
      ├→ 7.5A motor fuse → motor VM bus
      │    └→ 3 × TB9051FTG → 3 × 12V MP gearmotor
      └→ D24V90F5 → 5A fused5V rail → both Pi5V header pins
               ├→ driver VCC + encoder VCC
               └→ D45V5F3 → 3.3V sensor rail → ToF + muxes + baseIMU
Pi USB3 → OAK-D Lite (power and data)
Pi USB2 → Pico2 (power and serial data)
Pico → 6 PWM + software arm; 6 encoder inputs via dividers
PicoGP17ARM →100Ω → physicalNC latching-stop loop → all3TB9051ENpins
Each EN has10kΩpulldown toGND; allENBpins tiedGND
Pico I2C → TCA9548A0x70 + TCA9548A0x71 → one ToF per channel
Pico I2C → LSM6DSO + separate NC bumper inputs
All grounds meet at a low-impedance distribution point.
```

Motor specifications are100rpm/no-load at12V,1.8A extrapolated stall. At12.6V, a linear winding-resistance estimate gives1.89A per stalled motor,5.67A total. Driver2.6A continuous is above this per-channel estimate; the manufacturer lists5A short peaks. This does **not** permit persistent motor stalls. Add acceleration limits, encoder-stall detection, current/thermal commissioning and an MCU watchdog that returns enables low. The HP5A-stall motor variant is deliberately not substituted. [Motor electrical specification](https://www.pololu.com/product/4866), [driver specification](https://www.pololu.com/product/2997).

At60mm wheel diameter,100rpm gives0.314m/s unloaded at12V. A0.25m/s translational ceiling needs79.6rpm for the most heavily commanded wheel; leave simultaneous rotation/translation saturation headroom. At depleted3S voltage and under load, expect less available speed. The proposed0.25m/s is a **software ceiling**, not measured achieved motion. For2kg and0.3m/s² acceleration, total ideal force is0.6N; traction, roller losses, threshold climbing and motor heating require physical measurement. Do not size from stall torque as a usable continuous torque.

**Encoder level trap:** the encoder requires3.5–20V and outputs0…VCC. Power its blue lead from5V, greenGND, yellow/whiteA/B through10k/15k dividers into3.3V Pico GPIO. Red/black are motor terminals. Never apply encoder5V straight to Pico inputs, and do not power these encoders from3.3V. TB9051FTG requires5V VCC, accepts3.3V control inputs, and its DIAGpull-up is10kΩto5V; use4.7kΩexternalupper/22kΩlower for eachDIAG,about3.0Vincludingtheonboardpullup. Do not reuse the encoderdivider forDIAG. OCM is optional analog current feedback, not a guaranteed motor-protecting current limit. [Motor interface](https://www.pololu.com/product/4866), [driver use/pinout](https://www.pololu.com/product/2997), [manufacturer support clarification for3.3V inputs](https://forum.pololu.com/t/tb9051ftg-compatibility-with-3-3v-system/20752).

**Pi power trap:** generic USB-C PD chargers often supply only3A at5V. Pi5 raises the USB peripheral budget from600mA to1.6A when a5V5A supply is established. The mobile design uses a separate buck with capacity above5A and short fused header wiring. This feed has no USB-PD negotiation; only after load/voltage verification configure `PSU_MAX_CURRENT=5000` and `usb_max_current_enable=1` using official instructions. Do not parallel the bench USB-C supply with battery-fed5V. [Official Pi power documentation](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html), [EEPROM PSU_MAX_CURRENT documentation](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#PSU_MAX_CURRENT), [buck output/thermal curves](https://www.pololu.com/product/2866). D24V90F5 nameplate9A is not an unconditional continuous rating: manufacturer achievable current varies with input, cooling and output voltage, so test6A totaloutput continuously at9.9–12.6V input inside the actual ventilated enclosure. A larger documented alternative is [Pololu5671 D42V110F5](https://www.pololu.com/product/5671), USD59.95 and31.8×43.2×9mm, but its manufacturer category currently says out of stock.

Reserve the full1.6A USB budget: OAK up to5W≈1A, Pico provision0.1A, leaving0.5A nominal margin for the same aggregate USB rail. No USB SSD, display or extra camera is budgeted. The Pi/cooler plus peripherals and logic must remain within the proven5A feed. Nine ToF modules can reach40mA each,360mA combined; this exceeds the comfortable Pico3.3V accessory budget, hence the dedicated500mA sensor regulator. [OAK specifications](https://checkout.luxonis.com/products/oak-d-lite-1), [ToF supply current](https://www.pololu.com/product/3415).

**I²C addressing:** use two2717muxes, addresses0x70/0x71 by settingA0on the second. Keep each VL53L1X at its default0x29 on its own mux channel. Select exactly one sensor channel at a time and deselect the previous mux before selecting the other; do not expose two0x29 devices together. Start ranging asynchronously and read status/results in a deadline-driven loop; blocking9serial50msmeasurements is too slow. Put theIMU on the parent bus at its documented address and use short twistedGND/signal pairs. [Mux operation](https://learn.adafruit.com/adafruit-tca9548a-1-to-8-i2c-multiplexer-breakout), [baseIMU](https://www.pololu.com/product/2798).

**Power-off:** Pololu2813 OFF accepts a high pulse above1V, permitting a low-voltage shutdown sequence: MCUstops motors, asks Pi to halt, then removes power after acknowledgement/deadline. Its own low-voltage operating limit is not a3S battery cutoff. Firmware voltage handling is unimplemented and untested. An RC LiPo pack is not assumed to contain a protective BMS. A faulty firmware implementation could leave the battery draining; keep initial use supervised and physically disconnect the pack after use. A product-grade unattended version needs an independent cell-aware cutoff/BMS and charging architecture.

**Physical stop wiring:** feed PicoGP17ARM(3.3Vdigital) through100Ωandthe normally-closed contact ofYW1B-V4E01R to all three TB9051FTG **EN** pins. Fit one10kΩpulldown from eachEN toGND, leave the EN-to-VCC solder jumpers OPEN, and tie each **ENB** pin toGND as the driver instructions require. Opening the physical stop forces allEN low without a Pi command or MCU software decision; the motor outputs are disabled and coast. It does **not** isolate motor supply voltage and does not prove a specific stopping distance. Keep motorVM energized only until the separate20A-rated Carling main disconnect is opened. PWM commands remain zero during boot/unarmed state; implement watchdog and command expiry. Contacts are used at logic current, avoiding a high-current switching assumption. Keep motor rail capacitance/TVS near drivers. The Pololu self-off switch is not the mechanical disconnect or emergency cutoff. [Driver pin states and enable jumpers](https://www.pololu.com/product/2997), [stop contact identity](https://www.idec.com/en-apac/switches-indicator-lights/switches-pushbuttons/22mm-25mm-30mm-switches/yw-series/yw1b-v4e01r), [self-off switch limits](https://www.pololu.com/product/2813).

Bumper switches useCOM/NC at3.3Vlogic with pull-ups, so a broken loop is also a stop request. The D2F-01L is a microcurrent0.1A30Vcontact model; it must never switch motor current. Its two side mounting holes areØ2mm,6.5mmpitch; mounting-hole axis is2mmabove body bottom. The hinge-lever operating point is6.8±1.5mmabove that axis with freeposition≤10mm and minimum overtravel0.55mm. Use slots to set actuation before a separate mechanical hard stop;3mm bumper travel does not imply3mm of safe lever travel. [Manufacturer dimensions pp3–4](https://omronfs.omron.com/en_US/ecb/products/pdf/en-d2f.pdf).

## Budget and commissioning gates

Core quoted USD components total **USD975.70**, excluding the NOKbattery/charger/stop,EUR8.99ruthexpack,bench supply,wiring,memorycard,filamentandhardware. Add a provisional **USD100–180 allowance** for those small items(excluding theseparatelypricedruthexpack) and bench accessories, plus **NOK1,289.80 displayed/ex-VAT-mixed amount** for battery349 +charger649 +stop291.80. Because the NOKitems have inconsistent VAT display, that addition is an arithmetic subtotal only, **not an invoice amount**. A simpler public-facing estimate is **about USD1,100 in components plus roughly NOK1,300 in Norway-listed battery/charger/stop items, before shipping and final tax reconciliation**. This is a thorough9-ToF research build; omitting the6perimeter units savesUSD137.70 but removes sideways proximity assistance.

Before ordering/fabrication freeze: confirm3wheels available from a manufacturer-identifiable seller; confirm motor/regulator stock and battery shipping; reconcile battery and charger exactSKUs/XT60 leads; verify selected camera variant; compare the final CAD assembly to actual received dimensions. Before driving: wheel-pod fit coupon, shaft runout test, 6A total regulated-rail load test, startup/braking scope test, motor direction/encoder calibration with wheels lifted, thermal/current test, physical stop test, broken-wire bumper test, stale-command stop and battery self-off test. Downward sensing on dark/reflective floors and the sensor-to-wheel lead distance require restrained stair-edge/braking tests before any stairs are in the operating area. These are acceptance gates, not completed validation.

## Alternatives deliberately not assumed available

The [Pichondria5V5A converter](https://pichondria.com/usb-pd-2-0-3-0-to-5v-5a-converter-for-raspberrypi-5/) accepts2–4S packs and includes a20cmUSB-C cable, but [its own store](https://pichondria.com/product/usb-pd-2-0-3-0-to-5v-5a-converter-for-raspberrypi-5/) says out of stock (INR899 displayed). The Tindie page returned503. Its [tutorial](https://pichondria.com/usb-pd-2-0-3-0-to-5v-5a-converter-for-raspberrypi-5-tutorial/) requires explicitPi power configuration, so do not describe it as a plug-and-play5APD-output supply. No mechanical envelope was taken from its10×15×3cmpackage-size field.

No drive servos are required. Positional hobby servos do not provide this drivetrain's continuous speed/odometry behavior. Optional camera pan/tilt, speaker/microphone, lidar, docking and automatic charging are deferred and absent from this BOM.

## Final exported hardware and bumper input revision

The final CAD manifest is authoritative for fasteners; its list includes 40 heat-set inserts, 40 cable ties, and the revised M3×14 carrier screws. The webpage BOM has been synchronized to those counts.

Use three exact **onsemi 2N7000G** TO-92 MOSFETs for bumper inputs. Each gold NC contact is wetted from nominal5V through4.7kΩ (approximately1.06mA when closed). The high-impedance MOSFET gate avoids loading the open contact. Its drain is pulled to Pico3.3V through10kΩ; healthy NC readsHIGH, pressed/broken loop readsLOW. Per channel add10kΩ gate series,1MΩ gate-to-source and10nF gate-to-source. These parts are in the unquoted small-parts allowance. Direct3.3V/10kΩ contact sensing is below the switch's documented microload range and is not this design. [Omron contact range](https://omronfs.omron.com/en_US/ecb/products/pdf/en-d2f.pdf), [onsemi exact MOSFET specification and pinout](https://www.onsemi.com/download/data-sheet/pdf/2n7000-d.pdf). See wiring.md for complete nets and input polarity.
