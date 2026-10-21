# Kiwi: One front camera

Selected camera: 1 × [Waveshare OV2735 2MP USB Camera (A)](https://www.waveshare.com/ov2735-2mp-usb-camera-a.htm). No distance sensors, multiplexers or dedicated distance-sensor power rail are included.

## Shared wiring — vision-only revision

This is an electrical design, not a tested assembly. All three versions omit distance sensors, I²C multiplexers and their separate 3.3 V regulator. The IMU and wheel encoders measure the robot's own movement. Bumpers are contact switches.

### Power rails

| Rail | Connections |
|---|---|
| BAT_RAW | 3S LiPo XT60 positive → 10 A MINI fuse within 50 mm of the pack → Carling V1D1B60B-CMC00-000 main rocker → Pololu 2813 VIN. Use 16 AWG main wiring and insulated 6.3 mm spades. Battery negative goes to star ground. |
| BAT_SW | Pololu 2813 VOUT → 7.5 A MINI fuse → three TB9051FTG motor-driver VIN terminals. Also feeds the Pololu D24V90F5 regulator VIN. Give drivers separate 18 AWG ground returns. |
| +5_AUX | D24V90F5 output → motor-driver VCC, encoder blue leads, and bumper input circuits. Encoder green leads go to logic ground. |
| +5_PI | D24V90F5 output → 5 A fuse → paired 20 AWG positive wires to Pi pins 2 and 4; paired returns from pins 6 and 9. Keep the one-way harness under 150 mm. |
| +3V3_IMU | Pico 3V3OUT → Pololu 2798 IMU VIN; common ground. Reserve 10 mA for the IMU and verify the actual board draw. This is the only external load on this accessory rail. |
| USB control | Pi USB-A → Pico 2 Micro-B using a data cable. USB powers the Pico; do not also feed VSYS from another supply. |

The Pi power harness uses Molex 43025-0400 / 43020-0401 housings, four 43030-0007 female and four 43031-0007 male terminals. Use paired 20 AWG conductors: connector pins 1/2 = +5 V, 3/4 = ground. Terminate at an insulated Samtec SSW-120-01-G-D 2×20 socket; use only Pi pins 2/4 and 6/9. The terminals accept 20–24 AWG, so do not force an 18 AWG wire into them. Cover solder joints and add strain relief. [Molex terminals](https://www.molex.com/en-us/products/part-detail/430300007), [Samtec socket](https://www.samtec.com/products/ssw-120-01-g-d).

Do not connect the bench USB-C Pi supply while the battery-fed GPIO harness is attached. Test on the official 27 W EU supply first. The mobile GPIO supply has no USB-PD negotiation. After proving the supply capacity, configure `PSU_MAX_CURRENT=5000` and `usb_max_current_enable=1` as required by the [official Pi power documentation](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html).

Qualify the main 5 V regulator at 6 A total output and 9.9–12.6 V input, inside the enclosure. This covers a 5 A Pi branch, including its directly attached USB devices, with auxiliary margin. A regulator's nominal 9 A name does not establish its enclosed thermal performance. Measure voltage at the Pi during boot, capture and motor reversals.

### Cameras by version

| Version | Data connection | Camera power |
|---|---|---|
| One front camera | One OV2735 USB-A → USB-C data cable to Pi. | Pi USB rail. Reserve up to 500 mA for the module and 100 mA for Pico until actual current and USB descriptors are measured. |
| Front + left + right | Three OV2735 cameras → Raspberry Pi USB 3 Hub SC1636; captive hub USB-A lead → Pi USB 3. Pico uses a separate Pi port. Label cameras front/left/right using stable USB paths. | Externally power the hub as below. Three provisional 500 mA allocations plus Pico would otherwise use the full Pi 1.6 A USB budget with no margin. |
| Stereo pair | AR0144 stereo module → Pi using one USB-A → USB-C data cable. Split the combined side-by-side image only after checking the actual capture format. | Pi USB rail. Verify the module's USB current request and measured load before accepting the configuration; complete-module current was not published in the retrieved specification. |

For the three-camera version, BAT_SW → separate 2 A input fuse → **DFRobot DFR0849** 6–32 V input USB-A buck source. Use one USB-A output and a standard USB-A → USB-C power cable to the hub's external power input. Common ground is required. This is a separate converter, so the Pi regulator does not supply the three-camera hub branch. Insulate and restrain the board; leave the other USB-A output unused. It defaults to 5 V and supports charging protocols: measure 5 V with the actual cable/hub before attaching the cameras, then qualify a 2 A camera/hub operating load. A fuse protects the wiring; it is not precision current regulation. [DFRobot source](https://www.dfrobot.com/product-2299.html).

The official hub accepts external 5 V power and isolates its upstream supply through ideal-diode mixing; it does not feed its external supply backwards into the Pi. [Hub documentation](https://www.raspberrypi.com/documentation/accessories/usb.html), [Raspberry Pi engineer confirmation](https://forums.raspberrypi.com/viewtopic.php?t=389617). Do not substitute a hub that backfeeds its host. A generic USB-C breakout with 5.1 kΩ resistors is a sink, not a correctly advertised source; this design uses the separate USB-A source and a normal A-to-C cable instead.

Three cameras also share USB bandwidth. Start with modest capture settings, measure frame latency and dropouts, and use only the needed views for inference. A powered hub adds ports and power; it does not create bandwidth.

### Pico 2 pin assignment

Wheel identities follow the CAD angles 30°, 150° and 270°. Physical pin numbers refer to Pico 2, not Pi GPIO.

| GP | Physical pin | Net |
|---:|---:|---|
| 0 / 1 | 1 / 2 | Wheel 1 encoder A/B through dividers |
| 2 / 3 | 4 / 5 | Wheel 2 encoder A/B through dividers |
| 4 / 5 | 6 / 7 | Wheel 3 encoder A/B through dividers |
| 6 / 7 | 9 / 10 | Driver 1 PWM1/PWM2 |
| 8 / 9 | 11 / 12 | Driver 2 PWM1/PWM2 |
| 10 / 11 | 14 / 15 | Driver 3 PWM1/PWM2 |
| 12 / 13 | 16 / 17 | I²C SDA/SCL to the single base IMU |
| 14 / 15 / 16 | 19 / 20 / 21 | Bumper MOSFET drains; 10 kΩ pull-ups to Pico 3.3 V; HIGH healthy, LOW stop |
| 17 | 22 | ARM output → 100 Ω → physical normally-closed stop contact → shared DRIVER_EN |
| 18 / 19 / 20 | 24 / 25 / 26 | Driver 1/2/3 DIAG through separate dividers |
| 21 | 27 | Spare; former multiplexer reset removed |
| 22 | 29 | Pololu 2813 OFF via 100 Ω, with 100 kΩ pull-down |
| 26 | 31 | Battery ADC: BAT_SW through 100 kΩ / 22 kΩ divider, 100 nF to ground |
| 27 | 32 | Motor-rail ADC: same divider/filter |
| 28 | 34 | Spare test point |

Use the documented Pico ground pins for logic returns. [Pico documentation](https://www.raspberrypi.com/documentation/microcontrollers/pico-series.html). IMU address is the board's documented default 0x6B; use 3.3 V VIN and short wiring. No multiplexers or ranging startup sequence remain. [IMU](https://www.pololu.com/product/2798).

### Motor drivers, input levels and stop loop

For each TB9051FTG: motor wires go to OUT1/OUT2, VIN to the fused motor rail, VCC to +5_AUX, ground common. Tie ENB to ground; leave OCC low/default for latched overcurrent faults and leave the EN-to-VCC jumper OPEN. GP17 passes through the normally-closed stop contact to all three EN pins. Fit a separate 10 kΩ EN-to-ground pull-down at each driver. Opening the stop disables the drivers even if GP17 remains high. It causes coast and leaves motor VIN live; the separate main rocker disconnects power. [Driver pin states](https://www.pololu.com/product/2997).

Use 20 kHz PWM on the two PWM inputs, not EN. With EN high and ENB low, one PWM leg high drives/brakes; both PWM inputs low brake. Controlled stopping can brake before disabling; the physical stop immediately disables/coasts. Measure the resulting stopping distance.

Encoder VCC must be 5 V: the motor encoder requires at least 3.5 V. Each of six encoder A/B lines uses 10 kΩ in series from the encoder and 15 kΩ to ground at Pico, giving about 3.0 V. Each driver DIAG has its own onboard 10 kΩ pull-up/220 Ω series path: add 4.7 kΩ external upper and 22 kΩ lower divider resistors for about 3.0 V. Do not apply raw 5 V to Pico. OCM remains unused. [Motor](https://www.pololu.com/product/4866), [driver schematic](https://www.pololu.com/file/0J1514/tb9051ftg-single-brushed-motor-driver-carrier-schematic.pdf).

### Bumper inputs

Use three exact onsemi **2N7000G** MOSFETs to read the Omron D2F-01L gold contacts with adequate wetting current.

For each channel: +5_AUX → 4.7 kΩ → WET_SENSE. Switch COM connects to WET_SENSE, NC to ground, NO unused. WET_SENSE → 10 kΩ → MOSFET gate; add 1 MΩ and 10 nF from gate to source. Source goes to ground; drain goes to Pico GP14/15/16, with a 10 kΩ pull-up to Pico 3.3 V. TO-92 pin assignment is **1 source, 2 gate, 3 drain**.

A healthy closed NC contact carries about 1.06 mA, holds the gate low and gives Pico HIGH. A pressed switch or broken contact loop raises the gate to about 4.93 V, turns the MOSFET on and gives Pico LOW: **LOW means stop**. Firmware still debounces and latches the stop. Test opening either switch wire. A direct 3.3 V / 10 kΩ contact pull-up is below the switch's documented 1 mA at 5 V microload range. [Omron](https://omronfs.omron.com/en_US/ecb/products/pdf/en-d2f.pdf), [onsemi pinout](https://www.onsemi.com/download/data-sheet/pdf/2n7000-d.pdf).

Add 100 nF across each motor, 470–1000 µF / 25 V near the motor drivers, and the specified TVS. Check noise and transient clamping on the bench.

### Startup and shutdown

Start with GP17 low, PWM inputs low and OFF low. Test the physical stop before enabling motion. Commands need sequence numbers, freshness limits and a watchdog. Missing Pi/USB commands, a bumper hit or driver fault requests a stop. DIAG is low while disabled; firmware must distinguish this from an armed fault.

No distance-sensor stop inputs exist in these vision-only versions. The Pi must stop issuing motion when camera observations are missing or too old. The microcontroller still stops on an expired command stream.

The low-battery sequence requests a Pi halt, waits for acknowledgement or a timeout, then pulses GP22 OFF. It is not implemented. The RC LiPo is not assumed to have a BMS; use supervised operation and physically disconnect after use. Charge the removed battery with the matching balance charger. Autonomous docking needs the separate protected-pack/charger redesign described in docking.md.
