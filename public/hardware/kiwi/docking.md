# Kiwi: optional charging dock research

Primary-source research checked 21 October 2026. **Future upgrade proposal only:** no dock CAD, charging PCB, firmware, thermal test or autonomous charging system has been implemented or qualified. The current robot design remains a manually charged prototype.

## Feasibility and baseline

Yes: a rechargeable robot that returns to a charging station is feasible. The baseline 3S 2200 mAh LiPo is already rechargeable; it is disconnected and balance charged manually with the specified iMars charger. Its estimated nominal energy is `11.1 V × 2.2 Ah = 24.42 Wh`. Automatic docking is an additional capability, not a reason to add a second copy of the baseline battery to the BOM.

The present unprotected RC LiPo must **not** be connected to exposed contacts and a generic “12 V supply.” The dock revision needs a matched battery/BMS/charger system, protected contact input, temperature monitoring and a defined power path. A BMS protects cells; it does not replace a charger with a correct constant-current/constant-voltage profile.

## Credible battery candidates; selection still pending

**Preferred direction:** order a professionally assembled 3S Li-ion pack with its full charge/discharge BMS installed, rather than constructing a cell pack from loose cells. Require at least 10 A continuous protected output, documented cell balancing, a pack temperature sensor and 12.6 V CC/CV charging compatibility. This is the specification for the next electrical design, not a claim that every listed option satisfies every requirement.

Nexus Battery Systems lists a **3s1p Samsung 50S 5000 mAh pack**, 10.8 V nominal/12.6 V full, at **USD 65**. The configurable **full DALY 3S 20 A BMS** adds **USD 19.99**, and an XT30 dedicated charge port adds **USD 4.99**: approximately **USD 89.98** for those selected options. Do not choose the similarly named **“BYPASSED / Charge ONLY”** BMS option. The battery uses 21700 cells, not 18650 cells. Base dimensions are approximately 71 × 25 × 72 mm, excluding configuration-dependent BMS/cables. It requires a revised cradle and clearance check. [Pack assembler's listing](https://nexusbatterysystems.com/products/3s1p-50s).

The assembler also lists a **3s1p Molicel P30B 3000 mAh 18650 pack**, **USD 57**, 32.4 Wh, approximately 61 × 22 × 67 mm. Confirm the full BMS and connector configuration with the assembler before treating it as a protected pack. Neither pack is a direct fit replacement for the current flat LiPo pocket. [P30B pack](https://nexusbatterysystems.com/products/3s1p-p30b).

The standalone **DALY G-series 3S 20 A BMS** listing specifies 20 A discharge/charge and links its manufacturer manual. The manual requires an NTC input and shows a common protected charge/discharge path. However, the examined material does **not** establish exact balancing current, balancing thresholds or the complete temperature/protection specification for the configured pack. Those are ordering/design holds; a “balance lead” alone does not prove active balancing functionality. [BMS listing](https://nexusbatterysystems.com/products/3s-10-8v-daly-bms), [manufacturer manual supplied with it](https://cdn.shopify.com/s/files/1/0733/7476/1218/files/GHKM-Series-Hardware-BMS-Manual1.pdf?v=1745467123).

A separately documented balancing reference is BatterySpace **PCM-LI11.1V10A / #4345**, **USD 17.83**, with 10 A continuous output and an explicitly described equilibrium function. It is a board for professional pack assembly, not a complete battery or charger. Its protection thresholds are emergency limits, not normal operating or charging targets. Do not add it in series with another pack BMS without a reviewed design. [Assembler/manufacturer specification](https://www.batteryspace.com/pcmwithequilibriumfunctionandfuelgaugefor111vli-ionbatterypackat10alimit.aspx).

For sizing, the selected motor's 1.8 A stall figure at 12 V scales illustratively to about `1.8 × 12.6 / 12 = 1.89 A` per motor at full charge, or **5.67 A for three motors**, before compute power. This is an electrical sizing estimate, not permission to stall the motors. Actual current limits and transient measurements must determine the final fuse, pack, wire and connector ratings.

## Charging and power path

Two architectures are possible; neither circuit has been selected:

1. **Charger on robot:** an isolated low-voltage brick powers dock contacts; an onboard 3S CC/CV charger with a proper system power path powers electronics and charges the protected pack separately.
2. **Charger in dock:** a matched 12.6 V CC/CV charger reaches the pack through protected charging contacts; a separately managed supply path keeps electronics alive without confusing charger termination. This needs explicit load sharing/isolation. Simply attaching the running Pi to the charger's battery terminals is not an accepted power-path design.

A concrete reference for architecture 1 is **TI BQ24133**: a 1–3 cell Li-ion charger with up to 2.5 A charge current, 4.2 V/cell selection, thermistor monitoring, dynamic input power management and external adapter/battery power-path MOSFETs. It is an IC/reference design requiring a reviewed PCB, not a finished hobby module. It does not supply pack cell balancing by itself. [TI product documentation](https://www.ti.com/product/BQ24133).

TI's power-path design connects the system to the adapter voltage when docked. Thus, a 15 V adapter must **not** be allowed to apply 15 V directly to Kiwi's nominal 12 V motor rail. A proposed topology keeps motors on the protected battery branch and disables their hardware enable while charging; a separately rated buck powers Pi/camera electronics. Final MOSFET, regeneration, grounding, protection, connector and termination behavior remain schematic holds. [TI power-path and dynamic power management description](https://www.ti.com/lit/ds/symlink/bq24133.pdf).

**MEAN WELL GST60A15-P1J**, 15 V/4 A, is an example of an enclosed isolated mains-to-low-voltage adapter suitable for evaluating the TI direction. Its 60 W nameplate is not a robot power measurement. Select the proper regional mains lead and verify the finished charger input current. Mains stays inside the purchased adapter, outside the printed dock. [Manufacturer datasheet](https://www.meanwell.com/Upload/PDF/GST60A/GST60A-SPEC.PDF).

Size the input for electronics plus charging: `P_dock ≥ P_electronics / efficiency_system + V_pack × I_charge / efficiency_charger`, with additional transient/thermal margin. A Pi/camera budget near 25 W plus 2.5 A charging near 12.6 V can exceed a 60 W source once losses are included. Begin evaluation at a lower charge-current target, such as 1–1.5 A, and verify input limiting and net charge current under actual load. These are proposed settings, not validated limits for the final pack.

For architecture 2, BatterySpace **CH-L1118** is a documented 12.6 V/1.8 A 3S charger, listed **from USD 34.65** depending on connector configuration. This is an example of the correct charger category, not a selected Norway order: exact variant price, regional mains connection, polarity and integration need resolving. Its presence does not resolve robot load sharing. [Charger listing and options](https://www.batteryspace.com/Smart-Charger-1.8A-for-11.1V-Li-ion/Polymer-Rechargeable-Battery-Pack.aspx).

## Why the inexpensive UPS module is not a whole-robot solution

**Waveshare UPS Module 3S** is a useful comparison: **USD 21.99** base listing, three 18650 cells excluded, with a 12.6 V/2 A charger option. Waveshare documents protection/equalizing charge, simultaneous charge/output, a 5 V/5 A regulator, and a 60 × 93 mm board. Its raw 3S interface is labeled **12.6 V/2 A**. That output must not be assumed capable of the motor budget above. [Manufacturer listing](https://www.waveshare.com/product/ups-module-3s.htm), [module documentation](https://www.waveshare.com/wiki/UPS_Module_3S).

Even its 5 V/5 A advertisement does not establish loaded Pi 5 plus the selected cameras, USB-C 5 A identification, cable voltage drop, cooling or recharge power remaining while operating. It could be investigated for electronics, but bypassing its protected path to feed motors would require another reviewed battery architecture. It is not selected for this dock revision. Do not count a separate set of UPS cells plus a replacement traction battery as though they were one battery upgrade.

## Contact and monitoring hardware

Use guided mechanical alignment and compliant **spring contacts on the fixed dock**, mating to recessed, replaceable pads on the robot. The guides carry side load; the contacts supply controlled axial compliance. The final design needs polarity keying, spring travel limits, strain relief, a protected current-limited dock output and reverse-current blocking so the undocked robot cannot energize exposed pads. Define a dock-present/pilot signal and fault state before energizing the power interface. These are design requirements, not completed wiring.

**Mill-Max series 858** is a concrete contact family to investigate: 4 mm grid, 2–6 positions, mounting tabs and manufacturer-rated 9 A contacts under stated temperature-rise conditions. Choose the exact contact/target suffix after current, stroke, PCB and alignment calculations. Avoid substituting the smaller prewired series 867 at the same current: that family is specified at 2 A continuous. [858/867 manufacturer catalog](https://www.mill-max.com/sites/default/files/external/catalog/2018-07/004-022.pdf), [manufacturer docking/contact guidance](https://www.mill-max.com/engineering-notebooks/introduction-to-wire-termination/solder-cup-contact-and-connector-applications).

Two readily documented electronics candidates are **Adafruit #6359 LM73100**, **USD 4.95**, for reverse blocking on a suitable dock/electronics branch, and **Adafruit #4226 INA260**, **USD 9.95**, for voltage/current measurement. The LM73100 board's 5 A limit makes it unsuitable as the single main motor/whole-robot path. The current sensor must measure **net battery current**, with its sign calibrated, to distinguish pack charging from a dock merely supplying electronics. These components do not constitute a complete charger or interlock. [LM73100 board](https://www.adafruit.com/product/6359), [INA260 board](https://www.adafruit.com/product/4226).

Charging current should decrease or stop if the pack thermistor reports an unacceptable temperature, and hardware must enforce the limit independently of a model or Wi-Fi connection. Exact temperature/current thresholds come from the selected cell, pack and charger specifications. Contact bounce, blocked contacts, shorts, reverse mating, deeply discharged pack recovery and power interruption require bench tests before autonomous use.

## Docking algorithms

On the Mac mini, use **Nav2's Jazzy Docking Server** after regular navigation reaches a known staging pose. A fiducial tracker on the Mac mini refines dock pose, then a low-speed local approach controller seats the contacts. The framework provides docking plugins, detection timeouts, retries, and charge confirmation. It is separate from simply navigating to a map coordinate. The normal forward/turn docking behavior can be used by this omni base; lateral capability does not need to be exploited in the final contact approach. Integration is still pending. [Nav2 docking tutorial](https://docs.nav2.org/jazzy/tutorials/general_tutorials/using_docking/).

Proposed sequence:

1. A deterministic battery supervisor requests `return_home` early enough to preserve a measured docking reserve; the model may request the same high-level intent.
2. Navigate to a clear staging pose using the existing map.
3. Observe a calibrated AprilTag/ArUco marker and transform its measured pose into the dock-contact frame.
4. Approach slowly with fresh pose feedback; stop on lost detection or unexpected obstacle.
5. Confirm seating using a separate contact/dock signal. Disable motors, establish the protected power connection, and confirm expected net charging current/charger status.
6. On failure, de-energize appropriately, back off through an observed clear path and retry a bounded number of times. Stop and report failure rather than repeatedly pushing.
7. After charging, disable/release the charge interface as required, confirm the undock path is clear, and undock under local control.

Nav2's `use_battery_status` and `charging_threshold` support battery-current-based confirmation; setting charging equal to “pose reached” is inappropriate for this design. Handle a nearly full battery explicitly, because valid charging can taper below a fixed current threshold. A custom plugin/state machine may be needed for actual hardware status and “already full” behavior. Keep independent stops active while allowing only the specifically designed docking contact event. [Jazzy docking parameters](https://docs.nav2.org/jazzy/configuration_and_development/configuration_guide/core_servers/configuring_docking_server/).

Calibrate actual marker dimensions, camera intrinsics, `base_link → camera`, and marker-to-contact geometry. The camera must still see enough of the marker during the final approach: a marker immediately above the contact plane may leave the image or become too large/blurred at close range. Position the marker behind/above the contact plane with tested geometry; do not use stereo depth below its configured minimum range. The last centimeters use the calibrated marker view, odometry and a contact signal; these vision-only versions do not add a range sensor. Model image interpretation does not replace these measurements.

## Budget and double counting

Budget **USD 150–250 in goods** as a provisional allowance for a protected replacement pack, charging/power-path hardware, contacts, monitoring, dock print and wiring. The lower **USD 100–200** figure is only an early design allowance; the observed protected 50S configuration plus example charger already totals about **USD 124.63**, leaving many unresolved items. TI-based PCB development or expensive regional/battery freight could exceed the allowance.

For a simple planning comparison, assume **USD 1 = NOK 10**, a **1.25 tax multiplier**, and **NOK 300–600 shipping**. Applying that multiplier to goods plus shipping gives roughly **NOK 2,250–3,875**, before any carrier handling fees. These are stated arithmetic assumptions, not a live exchange-rate/tax quotation or checkout total.

Count the new pack **instead of** the original LiPo if buying the docking version from scratch; subtract the original battery's observed price when comparing variants. If a matched dock charger fully replaces the manual balance-charging route, remove the unused manual charger from the new-build comparison too. If upgrading an already purchased prototype, these are replacement purchases rather than cash refunds. Reuse the existing Pi, camera, motors, regulators or current monitor only when their ratings and topology remain suitable. Do not add both example charger architectures or the rejected UPS candidate into one total.

Before this becomes an order-ready upgrade: select the exact protected/balanced/temperature-monitored pack; review the charger/power-path and motor-rail schematic; revise the battery cradle/contact CAD; verify thermal and electrical faults; then demonstrate repeated dock, charge confirmation, interruption and undock behavior on the real floor. Until then, the page should say **“Optional charging dock — researched future upgrade.”**
