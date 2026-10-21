# Kiwi optional arm: a small mobile manipulator

Research checked 21 October 2026. This is an optional expansion study, separate from the base robot and its CAD. No arm has been ordered, mounted, calibrated or physically tested.

## Recommendation for the page

**Yes: add one printable SO-101 follower arm with a tiny wrist RGB camera.** It gives Kiwi a useful next challenge: stop beside a small object, inspect it, grasp it, put it in a tray, and fold the arm before driving again. Start with foam blocks, LEGO-sized objects and similar items up to a proposed **100 g object payload**, with a **250 mm tool radius measured from the robot center**. These are commissioning limits to validate, not an accepted load rating. A leader arm is optional for teaching demonstrations; it does not ride on Kiwi.

The SO-101 is five positioning joints plus one gripper actuator; vendors often call this “6 DOF.” It cannot independently set every arbitrary six-dimensional tool pose. Its printable frame, STEP files, camera mounts and LeRobot support make it the strongest match for this project. The [upstream hardware project](https://github.com/TheRobotStudio/SO-ARM100) supplies the designs; the [official LeRobot SO-101 guide](https://huggingface.co/docs/lerobot/so101) covers setup and calibration.

**Show the arm budget separately near the top: approximately USD 250–300 extra**, before Norway delivery/import charges, when building one follower from individual parts and printing its frame. The itemized observed-price subtotal below is USD 171.99–173.99; the rest is an explicitly estimated integration allowance. Do not silently add this USD figure to a NOK base cost. A full leader/follower motor kit costs more than the follower-only component path and is an alternative purchase, not another required line.

## Three credible routes

| Option | Observed asking price | Mechanism / published size | Fit for Kiwi |
| --- | --- | --- | --- |
| **SO-101 follower, printed locally — preferred** | Six 12 V C047 servos at USD 22 each; optional full leader/follower motor kit USD 249.90 | 5 joints + gripper; upstream URDF sums to **0.632006 kg** before camera, adapter and mounting | Best open hardware path and joint feedback. Use a restricted workspace; measure actual assembled mass and COM. |
| **Waveshare RoArm-M2-S** | Manufacturer combines S/Pro variants in **USD 179.99–299.99** range; exact S checkout still needs selection | 4 DOF; 5 bus servos; **826 ±15 g** excluding its 290 g table clamp; maximum horizontal workspace diameter **1090 mm** | Convenient built-in ESP32/USB/UART JSON and inverse kinematics, but its native reach is excessive for this support triangle. |
| **Hiwonder ArmPi mini, without Pi 5** | **USD 129.99** on the live current Pi-5 product page; an older indexed Pi-4 variant showed USD 119.99 | 4 DOF + gripper, **208 × 134 × 309 mm**, **0.7 kg**; supplied RGB camera | Lower kit price and compact. Uses a vendor Pi expansion board and servo stack; less attractive for a shared Pi/navigation design than a separate bus arm. |

Sources: [Seeed C047 servo](https://www.seeedstudio.com/STS3215-30KG-Serial-Servo-p-6340.html), [Seeed SO-101 Pro motor kit](https://www.seeedstudio.com/SO-101-Low-Cost-AI-Arm-Kit-Pro-p-6427.html), [SO-101 URDF with model masses](https://github.com/TheRobotStudio/SO-ARM100/blob/main/Simulation/SO101/so101_new_calib.urdf), [Waveshare manufacturer specification and variant prices](https://www.waveshare.com/product/roarm-m2-s.htm), [ArmPi mini current product page](https://www.hiwonder.com/products/armpi-mini).

The upstream URDF is a simulation description, not a physical weighing certificate or load test. It contains roughly 116 mm shoulder-to-elbow and 135 mm elbow-to-wrist joint offsets; stock reach extends beyond our proposed 250 mm working radius. Vendor desktop payload claims do not establish what a wheeled Kiwi can lift without tipping. The PartaBot follower-only alternative was listed at USD 299 and **sold out** when checked: [product listing](https://partabot.com/products/so-arm101-follower-only).

## Follower-only shopping basket

| Qty | Item / exact identity | Observed USD | Interface / integration note |
| --- | --- | ---: | --- |
| 6 | [Feetech ST3215-C047 12 V, 1:345, Seeed SKU 108090003](https://www.seeedstudio.com/STS3215-30KG-Serial-Servo-p-6340.html) | 132.00 | All six follower actuators must be this 12 V variant. Do not mix the 7.4 V leader motors into its power bus. |
| 1 | [Waveshare Bus Servo Adapter (A), SKU 25514](https://www.waveshare.com/bus-servo-adapter-a.htm) | 9.99–11.99 advertised range | USB-C host connection / UART and 3-wire ST servo bus. Select the board/cable variant before checkout. |
| 1 | [Seeed RGB USB camera 100° 720P, SKU 100079619](https://www.seeedstudio.com/Camera-Module-OV9732-1MP-100-USB2-0-USB2-0-L38-W38-H16-05mm-p-6982.html) | 30.00 | USB2 UVC RGB; nominal 38 × 38 × 16.05 mm module envelope from product identity. Focus distance, hole pitch and actual mass still need checking. |
| — | Printed arm links, wrist bracket and structural adapter; fasteners / finger pads | **25–40 estimate** | Print the upstream matched revision. Existing 32 mm camera mounts are not an automatic fit for this 38 mm camera. |
| — | Dedicated fused actuator harness, power disconnect / switched power path, connectors, cable protection and USB lead | **35–55 estimate** | This allowance is not a fully selected electrical shopping basket. Final switch, fuse, wire and connector ratings follow measured currents. |
| — | Mount backing plate / low central ballast / contingency | **15–30 estimate** | Reserve provisionally; quantify after weighing the assembled robot. |
| | **Observed hardware subtotal** | **171.99–173.99** | Currency USD; no purchase was made. |
| | **With explicit integration allowances** | **246.99–298.99** | Round to **USD 250–300 extra** for planning; delivery and import charges excluded. |

Camera price is visible in the [manufacturer SO-101 bundle options](https://www.seeedstudio.com/SO-ARM101-Pro-Unassembled-Bundle.html). Adapter range appears in [Waveshare's product catalog](https://www.waveshare.com/product/index.htm?dir=desc&limit=80&order=name&p=4); its direct product page returned an access error to the research tool, so treat that line as an advertised range, not a confirmed cart total. The [current adapter documentation](https://docs.waveshare.com/Bus_Servo_Adapter_A) explicitly supports 9–12.6 V input and identifies its power/data interfaces.

The [USD 249.90 Seeed Pro motor kit](https://www.seeedstudio.com/SO-101-Low-Cost-AI-Arm-Kit-Pro-p-6427.html) is an alternative if a leader is wanted for demonstrations. Its motor-only package excludes printed parts and camera. Confirm the current packing list and included supplies/cables; do not buy that kit plus the six individual follower servos. The complete bundle currently displays USD 309.80 with printed parts and camera selected; selector defaults and discount behavior should be confirmed at checkout.

## Motors, power and mechanical interfaces

The exact C047 manufacturer specification gives **45.2 × 24.7 × 35 mm**, **55 ±1 g**, a **25T / 5.9 mm output**, **4–14 V input** and a three-pin **5264-3P** connection: GND, VCC, TTL signal. At 12 V it specifies **0.9 A rated current**, **2.7 A stall current**, **10 kg·cm rated torque** versus **30 kg·cm stall torque**. Stall torque is not a continuous operating limit. Six simultaneously blocked joints could demand **16.2 A**, before the drive base and Pi. [Feetech C047 original datasheet](https://files.seeedstudio.com/products/Feetech/108090003_FEETECH_ST-3215-C047-Datasheet.pdf).

Use the existing 3S pack through a **separate actuator power branch** with its own disconnect, protection, current measurement and ground routing. The selected C047 and Waveshare adapter voltage ranges permit the pack's 12.6 V maximum; no 12 V boost converter is required for these exact parts. Torque will change as the battery discharges. Validate voltage sag and brownouts with drive, camera and arm operating together. Do not power servos from the Pi's 5 V regulator or USB. A separate physical battery is optional, but it adds weight and does not remove the need for a shared signal reference. [Adapter voltage documentation](https://docs.waveshare.com/Bus_Servo_Adapter_A), [servo power and calibration instructions](https://wiki.seeedstudio.com/lerobot_so100m_new/).

The serial adapter connects the Pi to the daisy-chained servo bus. Allocate unique IDs, use calibrated joint ranges, read positions/current/temperature, and limit speed, acceleration and load in a local controller. Absolute joint encoders do not identify the printed arm's installed zero angles automatically. Calibrate the actual unit and verify its startup pose before enabling motion. URDF `effort=10` and `velocity=10` values are simulation parameters, not validated C047 continuous torque/speed limits; replace them with commissioned controller limits.

A power stop can let a gravity-loaded arm fall. Provide a supported folded parking pose, prevent an uncontrolled drop from becoming the normal stop behavior, and verify hold-versus-power-cut behavior physically. The independent hardware power disconnect remains available. Use a service loop with strain relief around each moving joint; the wrist camera cable must not become an unplanned tendon.

Mount the arm close to the chassis center through a rigid adapter and backing plate tied into the chassis/standoffs. A cosmetic PETG lid alone is not its structural mount. Reserve approximately a **100 × 100 mm central structural region** as a packaging allowance; final bolt pattern comes from the selected upstream base revision. Keep the battery low. This study intentionally does not add arm holes to the base CAD or claim a verified mechanical fit.

## The three-wheel tipping constraint

Kiwi's wheel centers form a triangle with circumradius **131.8 mm**. Its weakest support-edge distance from the center is therefore only **65.9 mm**, regardless of the approximately 292 mm external envelope. Evaluate the combined COM against every edge; the arm can rotate toward the weakest direction.

For a level, stationary robot, projected in the direction perpendicular to one edge:

```text
x_COM = (m_base*x_base + Σ m_link*x_link + m_tool*x_tool) / M_total
edge margin = 65.9 mm - x_COM
```

All distances must be in the same robot frame; camera and gripper mass count as well as the object. For a simplified grouped stress case, assume base mass 2.0 kg centered at x=0, arm model mass 0.632006 kg grouped at x_arm, and 150 g at the tool (100 g object plus 50 g wrist camera/bracket/cable allowance):

| Illustrative condition | Tool radius | Assumed arm-group COM radius | Combined COM x | Weak-edge margin | Restoring / overturning moment ratio |
| --- | ---: | ---: | ---: | ---: | ---: |
| Restricted manipulation envelope | 250 mm | 150 mm | **47.6 mm** | **18.3 mm** | **1.63** |
| Longer overhang stress case | 400 mm | 250 mm | **78.4 mm** | **−12.5 mm** | **0.79** |

These arm-group COM positions are explicit stress-case assumptions, not a computed SO-101 pose or a measured load test. The table demonstrates sensitivity; it does not certify either envelope. A proper controller uses each link's transformed mass center and the measured base COM. Mount hardware/ballast centered low can improve the numbers; a raised payload and a slope worsen them.

For the restricted row, assuming base COM height 80 mm, arm COM height 300 mm, and tool mass height 250 mm gives total COM height about **139 mm**. The idealized lateral acceleration tipping threshold would then be `g × 18.3 / 139 ≈ 1.29 m/s²`, or about **7.5°** tilt in the unfavorable direction. Those are physical boundaries in an ideal static model, not permitted driving settings: arm acceleration, wheel compliance, rolling, floor slope and impacts consume margin.

Initial operating rules are therefore **park before manipulation; fold before travel; no simultaneous driving and arm extension**. Require a measured margin in all directions, limited object mass and local motion limits. Three mechanically load-bearing deployable feet would be a useful later expansion of the support polygon; they need their own CAD and floor-contact validation. More reach is not automatically more useful on this small base. The arm will handle floor/low-surface tasks, not reach normal kitchen countertops from the floor.

## Wrist camera and depth

Keep the selected fixed cameras on the body for mapping and overview; add one small RGB camera beside the gripper for close alignment. **This is two viewpoints, not automatically a stereo camera pair.** A moving wrist and fixed body camera require calibration and synchronization before combined triangulation could be trusted.

The selected AR0144 body camera’s useful close-depth range has not been measured. The final centimeters of a grasp can be occluded or outside useful depth/focus range. The wrist camera adds a close view for the offboard vision model; it does not produce metric depth by itself.

Start with a **known working plane / tray and a few known-sized objects**. Calibrate camera intrinsics, the body camera to robot transform, the wrist camera to gripper transform, and joint zeros. AprilTags on the tray and/or wrist provide scale and pose checks. OpenCV hand-eye calibration estimates the camera/gripper relationship; AprilTag pose estimation requires known tag size and camera intrinsics. [OpenCV calibration functions](https://docs.opencv.org/4.13.0/d9/d0c/group__calib3d.html), [AprilRobotics pose estimation](https://github.com/AprilRobotics/apriltag/blob/master/apriltag_estimate_tag_pose.docstring).

On the Mac mini, use qualified stereo overview depth for a coarse target and offboard wrist-image feedback for small final alignment steps. Only close the gripper after local workspace, geometry and contact checks pass. Servo current can flag a blocked gripper but is not a calibrated force/pressure sensor. If arbitrary close-range 3D grasping later becomes important, evaluate a dedicated near-field depth camera as another upgrade rather than assuming the RGB wrist camera solves it.

## Decisions API, algorithms and the actual data path

```text
Selected body camera(s) + wrist RGB + joint feedback
  → Pi streams images and motion feedback
  → Mac mini computes calibrated geometry / tray pose
  → offboard vision LLM interprets images
  → Mac/cloud decision model chooses a bounded task or candidate grasp
  → local feasibility + stability + collision checks
  → inverse kinematics and timed joint trajectory
  → bus servos execute with encoder feedback
  → camera and joint state verify result
```

The OpenAI **Decisions API** currently returns a predicate, a supplied choice or a rubric score from text/images. It can choose among locally generated grasp candidates such as `grasp_A`, `grasp_B`, `rescan`, `wait`, or classify whether the object is visibly held. It does not generate an arbitrary joint trajectory or general JSON command. For parameterized `pick(object_id, destination_id)` calls, use Responses strict function calling or a local-model adapter that validates the same internal action schema. A schema-correct response can still be physically wrong; the local controller must reject unreachable, stale, colliding or unstable requests. [Official Decisions guide](https://developers.openai.com/api/docs/guides/decisions), [official function-calling guide](https://developers.openai.com/api/docs/guides/function-calling).

Offboard geometric processing on the Mac mini: AprilTag / OpenCV for calibrated tray pose; validated vision-LLM object observations on a known tray plane; forward/inverse kinematics; short collision-checked trajectories; wrist image alignment; gripper state checks. MoveIt 2 is suitable when the ROS integration is ready, but requires our robot model, joint limits, driver and collision geometry. Its planning scene handles robot/world collision checks; it does not automatically know Kiwi's support polygon or certify stability. [MoveIt planning scene documentation](https://moveit.picknik.ai/main/doc/examples/planning_scene/planning_scene_tutorial.html).

LeRobot is useful for leader teleoperation, recording demonstrations and later ACT/SmolVLA experiments trained on our hardware/tasks. It is not evidence that a generic vision-language model can already pick arbitrary household objects. Verify the deployment hardware and policy on recorded data before enabling motion. [Seeed LeRobot workflow and camera examples](https://wiki.seeedstudio.com/lerobot_so100m_new/).

An internal task might be `pick("blue_block_7", "front_tray")`; local code owns coordinates and motion. The Pi runs the motor-facing task/controller path, while a home Mac or cloud model provides slower semantic decisions. Reject expired/duplicate requests; pause safely on lost Wi-Fi or missing sensor state. Do not put API keys in the public project website.

## Before upgrading this from concept to build instructions

1. Select the exact follower/servo/camera revisions and verify the final packing lists, close focus and current delivered prices.
2. Build and calibrate the arm on a fixed bench, weigh all parts, check joint feedback, motion limits, gripper load and power-stop behavior.
3. Reconcile arm adapter geometry with the actual chassis and add a structural load path; check shell, camera, wiring and wheel clearance through the allowed swept volume.
4. Weigh the complete base, find its COM and calculate every allowed arm pose against all support edges. Add low ballast or load-bearing feet where necessary, then recheck drive load capacity.
5. With a tether and a clear flat floor, physically validate stationary 100 g lifts and the restricted reach, wheel rolling, voltage sag and stopping behavior. Keep the base parked throughout manipulation.
6. Demonstrate known objects on a marked plane before autonomous household grasping. Rendering, CAD and simulated trajectories do not prove physical grasp success.

Image concept: the same low round Kiwi body with one centrally mounted, folded five-joint printed arm, a small two-finger gripper and a visible square wrist RGB camera. Show modest reach and a lightweight foam block. Label it **optional arm concept**; do not present an imagegen rendering as CAD-verified geometry.
