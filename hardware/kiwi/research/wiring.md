# Kiwi v0.1 wiring schedule

Design schedule, not an assembled or bench-validated circuit. References and observed prices were checked20October2026. Do not substitute a5A-stall HP motor for the selected1.8A-stall MP motor.

## Power and connector nets

| Net | Wiring |
|---|---|
| BAT_RAW |3S LiPo XT60 positive →10A MINI fuse within50mm of pack lead → Carling V1D1B60B-CMC00-000 main rocker → Pololu2813 VIN. Negative returns directly to star ground. Use16AWG main conductors, insulated6.3mm rocker spades. The rocker is the physical main disconnect; unplugging XT60 isolates the pack for work. |
| BAT_SW |2813 VOUT →7.5A MINI motor fuse → all three2997 **VIN** terminals; also → D24V90F5 VIN. All three driver GNDs have separate18AWG returns to star ground; avoid passing motor current through Pi/Pico grounds. |
| +5_AUX | D24V90F5 VOUT → driver VCC pins, encoder blue leads and D45V5F3 VIN. Green encoder leads to logic GND. Fuse/route any long auxiliary branches appropriately. |
| +5_PI | D24V90F5 VOUT →5A MINI fuse → paired conductors to Pi physical pins2and4; paired returns from physical pins6and9. Keep total one-way harness≤150mm. Add explicit polarity labels at both ends. |
| +3V3_SENS | D45V5F3 VOUT →9×3415 VIN,2×2717 VIN,2798 VIN. Every sensor/mux GND joins logic GND. Do not connect this regulator output to Pico3V3OUT. |
| USB | Pi USB3A→OAK-C using shortUSB3data cable. Pi USB2A→Pico Micro-B for USBserial+power. Do not also feed PicoVSYS from another source. |

Use a removable4-way Micro-Fit3.0 harness: **Molex43025-0400** receptacle + **43020-0401** plug,4× **43030-0007** female +4× **43031-0007** male crimp terminals. These terminals accept20–24AWG, so use two20AWG positive and two20AWG return conductors, not an18AWG wire forced into an undersized crimp. Pin assignment on the numbered molded housing:1=+5V-A,2=+5V-B,3=GND-A,4=GND-B. On the Pi end, terminate into a **SamtecSSW-120-01-G-D**2×20socket mounted on insulated perfboard: pins2/4=+5V,6/9=GND. Leave all other40way contacts electrically unused. Fit strain relief and a cover over solder joints. Connector polarity/continuity and thermal load testing are acceptance gates. [Molex plug](https://www.molex.com/en-us/products/part-detail/430200401), [female terminal7A/20–24AWG](https://www.molex.com/en-us/products/part-detail/430300007), [male terminal](https://www.molex.com/en-us/products/part-detail/430310007), [Samtec socket](https://www.samtec.com/products/ssw-120-01-g-d), [Samtec current test conditions](https://suddendocs.samtec.com/productspecs/tsw-sxx.pdf).

Do not connect the bench USB-C Pi supply while this header feed is connected. Commission on the official27W EU supply first; disconnect the battery harness for that step. The mobile header supply has noPDnegotiation; after proving its capacity set `PSU_MAX_CURRENT=5000` in EEPROM and `usb_max_current_enable=1` in the appropriate bootconfig. [Official power documentation](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html).

Budget the Pi branch for5A **including** USB loads; OAK can use1A and Pico provision0.1A within the Pi's1.6AaggregateUSB limit, leaving0.5AUSB margin. Provision another0.4A-equivalent maximum at5V for the external sensor/encoder/logic branches; qualify the buck at **6A output** and9.9–12.6V input, not merely its nominal9Aname. Scope the Pi5V pins during boot, camera inference and motor reversals, and check regulator/harness heat in the enclosure. NineToF peak360mA +IMU provision10mA +muxes/pullups provision25mA ≈395mA on the500mA3.3Vregulator. Verify that rail under simultaneous ranging. Estimated all-motor stall5.67A at12.6V plus up to3.3Abattery input for electronics at low battery remains below10A; fuses protect wiring, not a prolonged stalled motor. These are calculated budgets, not measurements.

## Pico2 pin assignment

Use this table for firmware constants and harness labels. Wheel IDs follow theCAD drive angles30°,150°,270°. The physical-pin column refers to the40pin Pico2 board, not thePi GPIOheader. [Official Pico documentation](https://www.raspberrypi.com/documentation/microcontrollers/pico-series.html).

| GP | Physical pin | Net |
|---:|---:|---|
|0 /1|1 /2|Wheel1 encoderA/B, divided |
|2 /3|4 /5|Wheel2 encoderA/B, divided |
|4 /5|6 /7|Wheel3 encoderA/B, divided |
|6 /7|9 /10|Driver1 PWM1/PWM2 |
|8 /9|11 /12|Driver2 PWM1/PWM2 |
|10 /11|14 /15|Driver3 PWM1/PWM2 |
|12 /13|16 /17|I2C0 SDA/SCL, sensor bus |
|14|19|Bumper1 MOSFET drain;10kΩpullup toPico3V3;HIGHhealthy/LOWstop |
|15|20|Bumper2 MOSFET drain;10kΩpullup toPico3V3;HIGHhealthy/LOWstop |
|16|21|Bumper3 MOSFET drain;10kΩpullup toPico3V3;HIGHhealthy/LOWstop |
|17|22|ARM output →100Ω → physicalNCstop → shared DRIVER_EN bus |
|18 /19 /20|24 /25 /26|Drivers1/2/3 DIAG, divided separately |
|21|27|Both mux RESET inputs;10kΩpullup tosensor3.3V |
|22|29|Pololu2813 OFF,100Ωseries,100kΩpulldown; highpulse powersoff |
|26|31|ADC0 batteryBAT_SW100kΩ/22kΩdivider,100nF toGND |
|27|32|ADC1 motor fused bus divider100kΩ/22kΩ,100nFtoGND |
|28|34|Reserve / test point; do not connect unknown5Vsignals |

Available GP0–22and26–28 are all accounted for, withGP28reserved. Use GND pins3,8,13,18,23,28,33/38 as convenient for logic harness returns. GP21 resets the muxes on a stuckI²Cbus; bus recovery still needs explicit firmware.

## Drivers, stop loop and signal levels

For **each** TB9051FTG: motorred→OUT1,black→OUT2 (swap interpretation in calibration if needed); VIN=BAT_SWmotorfused, VCC=+5_AUX, GND=common. Set **ENB toGND**, leave **OCC low/default** so overcurrent faults latch, leave **EN-to-VCC jumper OPEN**. GP17 goes through the physicalstop'sNCcontact to all3ENpins, with an individual10kΩpulldown from eachEN toGND. Enable only after arming and fresh commands. The stop opensEN even if software is stuck commandinghigh. Driverdisabled means coast and still-liveVIN; use the mainrocker for powerisolation. No certified safety or stoppingdistance claim follows from this wiring. [Driver truth table/pin defaults](https://www.pololu.com/product/2997).

Use20kHz PWM on the twoPWMinputs (not onEN); withENhigh/ENBlow, onePWM leg and the otherlow drives/brakes, bothPWMslow brakes. Firmware should briefly brake controlled stops before loweringEN; physicalstop immediatelycoasts. This distinction matters for cliff lead-distance testing.

EncoderVCC must be5V: its minimum is3.5V. Six encoderA/B lines each use **10kΩseries upper /15kΩ toGND**, producing3.0V from5V. DriverDIAG has an onboard10kΩpullup to5V and220Ωseries, so use **4.7kΩexternalupper /22kΩlower** perDIAG, giving about3.0V high including the onboardpullup. A10k/15kDIAGdivider would unnecessarily lower its high level. Do not connect any raw5Vencoder/DIAG directly toPico. DriverOCM pins remain unconnected/reserved in this schedule; no three-channel motorcurrent telemetry is claimed. [Encoder levels](https://www.pololu.com/product/4866), [driver schematic](https://www.pololu.com/file/0J1514/tb9051ftg-single-brushed-motor-driver-carrier-schematic.pdf).

**Bumper inputs use 5V contact wetting and three onsemi 2N7000G MOSFETs, not direct3.3V contact pullups.** For each channel: +5_AUX →4.7kΩ →WET_SENSE; switch COM→WET_SENSE, NC→logicGND, NOunused. WET_SENSE →10kΩ →MOSFETgate. Add1MΩ gate-to-source and10nF gate-to-source. MOSFETsource→logicGND; drain→assigned PicoGP14/15/16 with10kΩ pullup toPico3V3. Use the manufacturer's TO-92 Case29/Style22 orientation: pin1SOURCE,pin2GATE,pin3DRAIN. Do not swap source/drain.

A healthy closed NC contact sinks approximately5V/4.7kΩ=1.06mA; gate isLOW, MOSFETOFF, Pico inputHIGH. A pressed switch or broken contact loop leaves the gate near4.93V, MOSFETON, Pico inputLOW: **LOW means STOP**. The signal filter is roughly0.1–0.15ms; firmware still latches stops and debounces re-arming. Opening either contact wire must cause a stop in the physical acceptance test. The manufacturer's minimum-applicable microload is1mA at5V, so the earlier3.3V/10kΩ direct circuit is outside its documented range. The onsemi MOSFET has a guaranteed switching-resistance specification at4.5Vgate, above the needed0.33mAdrain load. The contacts carry only wetting current. [Omron microload range](https://omronfs.omron.com/en_US/ecb/products/pdf/en-d2f.pdf), [exact onsemi datasheet/pinout](https://www.onsemi.com/download/data-sheet/pdf/2n7000-d.pdf). Motornoise suppression starts with100nFacross eachmotor,470–1000µF/25Vbulk near driverpower and TVS as specified inparts.md; confirm actual transientclamping with a scope.

## Sensor bus and startup

MUX_A address0x70:channels0–5 perimeterP0…P5,6–7 cliffC0/C1. MUX_B address0x71(setA0high):channel0cliffC2,othersunused. DefaultToF address0x29. Deselect bothmuxes before selecting onechannel; never expose multiple0x29 devices. BaseIMU stays on theparentbus at its configured/documented0x6B(default), awayfrommotorloops. Use3.3V VIN on allI²Ccarriers so theirpullups/levelshifters matchPico. Configure separateasynchronousrangingdeadlines and treatstale/invalidreturns asunknown. [Mux](https://learn.adafruit.com/adafruit-tca9548a-1-to-8-i2c-multiplexer-breakout), [ToF](https://www.pololu.com/product/3415), [IMU](https://www.pololu.com/product/2798).

Bootstate: GP17low, PWMslow,OFFlow. Configurewatchdog andtestphysicalstop beforemotion. StartUSBserialCRC/sequence/deadline protocol; loss ofPi/USBcommand, activebumper, cliff/invalidsensor ordriverfaultrequestsstop. DIAG is expectedlow whileENdisabled, so faultlogic must distinguishunarmedstate. A depletedbatterysequence must requestPihalt thenpulseGP22OFF; it is not yetimplemented, and theRCLiPo has noassumedBMS. Noautonomous/unattendedoperation until firmware, cellvoltagehandling andphysicaltests areaccepted.
