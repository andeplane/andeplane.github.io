# Kiwi: sensing and autonomy reference architecture

Research checked against primary documentation on 20 October 2026. This is an engineering proposal for the 270–290 mm indoor platform. Package integration, Pi performance, stopping distances, depth quality and navigation have not yet been measured on the physical robot.

## Camera recommendation

Use one **fixed-focus Luxonis OAK-D Lite**, connected by USB 3 to the Pi 5. One enclosure already contains an RGB camera and two synchronized monochrome cameras for stereo depth. A second ordinary RGB camera is unnecessary for the first build. The product is RVC2 based and performs stereo matching on the device. Confirm the exact autofocus/fixed-focus SKU and supplied cable before ordering. [Luxonis hardware documentation](https://docs.luxonis.com/hardware/products/OAK-D%20Lite), [official product listing](https://checkout.luxonis.com/products/oak-d-lite-1).

| Option | Useful capability | What we would still have to solve | Recommendation |
| --- | --- | --- | --- |
| One ordinary RGB camera | Teleoperation, recognizing people/objects, visual landmarks | Dense metric depth needs additional constraints or a learned estimate; no direct range measurement | Good minimum-cost teleoperation prototype |
| Two separate Pi cameras | Can produce real stereo depth after calibration | Rigid baseline, camera intrinsics/extrinsics, synchronization, rectification, stereo matching, exposure behavior, Pi processing | Interesting camera-development project; more integration work |
| Calibrated OAK-D Lite stereo unit | RGB plus metric stereo depth in a ready-mounted sensor | Driver integration, robot-to-camera calibration, confidence filtering and scene testing | Preferred first autonomous prototype |

Two camera connectors are available on Pi 5. Raspberry Pi also documents software camera synchronization, so DIY stereo is possible; simply plugging in two cameras does not create a calibrated depth system. [Pi camera hardware](https://www.raspberrypi.com/documentation/accessories/camera.html), [camera synchronization](https://www.raspberrypi.com/documentation/computers/camera_software.html#software-camera-synchronisation).

Monocular models such as Depth Anything V2 have both relative-depth and metric fine-tuned variants. A learned metric prediction can be useful for scene understanding, but it remains an inference from appearance and training. It should not be the sole braking or stair detector on this robot. That last restriction is our engineering choice. [Authors' project and model descriptions](https://depth-anything-v2.github.io/), [paper](https://arxiv.org/abs/2406.09414).

## What depth means on this robot

Rectified stereo finds the horizontal pixel separation, or disparity, of the same feature in two images:

`Z = fx × B / d`

Here `Z` is distance in metres, `fx` is calibrated focal length in pixels, `B` is the baseline in metres, and `d` is disparity in pixels. For an illustrative `fx = 440 px`, `B = 0.075 m`, and `d = 33 px`, the result is `Z = 1.0 m`. Use the calibration returned by the actual camera rather than these illustrative numbers. With decreasing disparity, small matching errors produce larger distance errors. Unknown or invalid depth is not free space. [Luxonis stereo configuration and derivation](https://docs.luxonis.com/hardware/platform/depth/configuring-stereo-depth).

The Lite's baseline is **75 mm**. Its stereo sensors are 480P-class OV7251 sensors. Luxonis lists approximately 20 cm minimum depth with 400P plus extended disparity, depending on configuration; other settings have a larger minimum. Its advertised useful range is room scale. These figures are manufacturer guidance, not our acceptance results. The product page currently contains a conflicting “75cm” baseline sentence; the depth-accuracy documentation explicitly identifies Lite's baseline as 75 mm. [Hardware and minimum-depth settings](https://docs.luxonis.com/hardware/products/OAK-D%20Lite), [75 mm baseline and accuracy categories](https://docs.luxonis.com/hardware/platform/depth/depth-accuracy).

Passive stereo needs visual texture. Blank walls, glossy floors, glass, dark surfaces and poor lighting can leave holes or inaccurate matches. The Lite has no IR dot projector. Enabling extended disparity improves close-range reach but does not make the immediate bumper area observable. Start with lower-resolution depth and inspect validity/confidence in the actual house. [Depth sensing and texture limitations](https://docs.luxonis.com/hardware/platform/depth/configuring-stereo-depth), [Lite hardware](https://docs.luxonis.com/hardware/products/OAK-D%20Lite).

Mount the camera rigidly on the removable upper body, clear of the bumper and shell, at approximately 140–180 mm optical height with adjustable pitch during commissioning. These are proposed packaging targets, subject to the actual CAD envelope and floor-view test. Lock the final pitch and measure its transform to `base_link`. Reserve a service loop and strain relief for USB. A forward camera does not see behind the robot when it drives sideways or reverses.

## Additional sensing is still needed

The proposed first build uses wheel encoders, a gyro/accelerometer, perimeter short-range ToF assistance, a segmented contact bumper and downward-facing cliff sensors. They solve different problems:

| Input | Job | Important limit |
| --- | --- | --- |
| Three motor encoders | Wheel-speed feedback and short-term motion estimate | Omni roller slip causes drift |
| Six-axis IMU | Rotation-rate measurement and local motion fusion | No absolute position; gyro yaw drifts |
| Perimeter ToF | Samples near obstacles around the chassis | Discrete cones leave gaps and can miss thin objects |
| Contact bumper | Last-resort contact detection | Detects contact after it occurs |
| Downward ToF/reflectance | Detect change from expected floor | Floor finish, mounting lead and stopping distance must be tested |
| Forward stereo camera | Depth, mapping, visual landmarks, semantics | Forward field of view, minimum range, lighting and texture limits |

For a VL53L1X implementation, ST specifies 27° typical full field of view and up to 50 Hz ranging. Six such sensors cannot claim uninterrupted 360° coverage. Time-stagger overlapping emitters and validate each sensor's window/crosstalk behavior in its finished mount. Perimeter ToF is assistance, not a complete side/back depth camera. [ST VL53L1X specification](https://www.st.com/en/imaging-and-photonics-solutions/vl53l1x.html).

**Do not assume every OAK-D Lite includes an IMU.** Luxonis lists BMI270 on current hardware but explicitly says Kickstarter-backed units omitted it. Check the purchased unit/SKU and detected hardware. A separately specified base IMU avoids depending on camera stock history. If using camera IMU data, establish the camera-to-IMU and robot transforms before fusion. [Luxonis IMU caveat](https://docs.luxonis.com/hardware/products/OAK-D%20Lite), [driver extrinsics behavior](https://docs.luxonis.com/software-v3/depthai/ros/driver).

Until coverage has been measured, allow only low-speed lateral/reverse travel through recently observed clear space; rotate the camera to inspect a new direction before committing. Stairs remain physically excluded during commissioning. Cliff detection becomes an accepted capability only after loaded braking tests show it stops before any supporting wheel crosses the edge in every travel direction. A compact round base gives little sensor-to-wheel lead.

For commissioning, calculate the required detection lead from:

`d_stop = v × t_reaction + v² / (2 × a_brake) + margin`

For example, `v = 0.10 m/s`, measured reaction time `0.10 s` and measured deceleration `0.50 m/s²` already require `20 mm + margin`. These reaction/deceleration values are illustrative, not measured. A 200 Hz control loop does not make a 20 Hz range sensor update at 200 Hz. [Nav2 stopping-zone formulation](https://docs.nav2.org/rolling/tutorials/general_tutorials/using_collision_monitor/using_collision_monitor/).

## Algorithms and where they run

The design uses three timescales. Rates below are **design targets**, not benchmarks.

| Layer | Runs on | Target | Responsibility |
| --- | --- | --- | --- |
| Wheel control and stop enforcement | MCU | 100–200 Hz | Encoder PID, PWM, acceleration limits, heartbeat expiry, bumper/cliff stop inputs |
| Perception and navigation | Pi 5 | 10–30 Hz where feasible | Read depth, update obstacles, track trajectory; reduce mapping/image rates if CPU requires it |
| Intent and semantic decisions | Home Mac or cloud service | Event driven; slower | Interpret a request or scene, select a destination/task, ask for clarification |

The MCU must stop on its own if Pi commands expire. A physical stop switch interrupts motor enable/power through a suitable hardware path. Navigation and model latency do not define the braking loop. Sensor timing and stopping behavior still need physical validation.

The reference software pipeline is:

1. **DepthAI ROS driver:** publish synchronized RGB, aligned depth and calibration; enable only the streams we need. The official v3 driver has an RTAB-Map launch example, but RTAB-Map is installed separately. [Driver and launch files](https://docs.luxonis.com/software-v3/depthai/ros/driver).
2. **`ros2_control` omni wheel controller:** convert body `vx`, `vy`, `wz` to three wheel velocities and calculate encoder odometry. The controller explicitly supports three or more equally spaced omni wheels and stamped velocity commands. Use feedback, not open-loop odometry. Set a command timeout. [Jazzy controller documentation](https://control.ros.org/jazzy/doc/ros2_controllers/omni_wheel_drive_controller/doc/userdoc.html).
3. **`robot_localization` EKF:** combine encoder-derived planar velocities and IMU gyro data in `two_d_mode`. Do not copy a differential-drive configuration that forces lateral velocity to zero; `vy` is real on a kiwi drive. Tune covariances from measurements and avoid treating derived wheel pose and velocity as independent evidence. [Maintainers' configuration guide](https://github.com/cra-ros-pkg/robot_localization/blob/rolling-devel/doc/configuring_robot_localization.rst).
4. **RTAB-Map:** build a visual RGB-D/stereo map, recognize revisited places, and output an occupancy grid for navigation. Start by supplying fused wheel/IMU odometry; visual odometry is an additional option to evaluate. The package supports external odometry, occupancy grids and Nav2 examples. Record data before attempting to tune the whole stack live. [RTAB-Map ROS 2 documentation](https://github.com/introlab/rtabmap_ros/blob/ros2/README.md).
5. **Nav2:** use a 2D holonomic global planner such as NavFn or Smac 2D; use DWB for the first local-controller bring-up with lateral velocity samples enabled. MPPI with the Omni model is an alternative after profiling and tuning. A differential-drive or Ackermann configuration would discard this platform's lateral motion. [Navigation plugins](https://docs.nav2.org/rolling/configuration_and_development/navigation_plugins/), [DWB Jazzy implementation](https://raw.githubusercontent.com/ros-navigation/navigation2/jazzy/nav2_dwb_controller/README.md), [MPPI Jazzy implementation](https://raw.githubusercontent.com/ros-navigation/navigation2/jazzy/nav2_mppi_controller/README.md).
6. **Collision Monitor plus independent MCU stop:** apply obstacle slow/stop zones after the planner using depth points and range messages. This is an additional local software layer; it does not replace independent stops or prove a safety-rated system. [Nav2 Collision Monitor](https://docs.nav2.org/rolling/configuration_and_development/configuration_guide/core_servers/collision_monitor/configuring_collision_monitor_node/).

Use one owner for each dynamic TF transform: RTAB-Map owns `map → odom`; the EKF owns `odom → base_link`; the robot description owns the fixed camera/motor/sensor transforms. Disable the omni controller's duplicate odometry TF when the EKF publishes it. Use the complete shell/bumper footprint and configured clearance in costmaps. Depth samples without valid range must not clear unseen obstacles.

Optional printed AprilTag/ArUco landmarks make the first room/dock demonstrations easier: identify the tag, use known marker dimensions and calibrated intrinsics, then solve its camera-relative pose. This is a useful reference/docking aid, not a replacement for general obstacle sensing. [OpenCV marker detection and pose estimation](https://docs.opencv.org/4.13.0/d5/dae/tutorial_aruco_detection.html).

## Pi OS and package compatibility

Use **Ubuntu Server 24.04 64-bit with ROS 2 Jazzy** as the first integration target. ROS's Pi guide recommends a Tier 1 arm64 Ubuntu configuration for binary packages; Raspberry Pi OS is a different Debian-based integration path, often using Ubuntu ROS containers. The existence of Pi binaries does not prove this entire camera/navigation combination has been installed. [ROS maintainers' Raspberry Pi guide](https://github.com/ros2/ros2_documentation/blob/jazzy/source/How-To-Guides/Installing-on-Raspberry-Pi.rst).

DepthAI v3 currently documents Humble/Jazzy packages with the `_v3` suffix, e.g. `depthai_ros_driver_v3` and Debian package `ros-jazzy-depthai-ros-v3`. Its newest Humble/Jazzy packages can require ROS's testing apt repository before a stable sync. Kilted uses unsuffixed v3 names. Pin the chosen driver and DepthAI dependency versions after installation; do not mix v2 examples with v3 APIs. Prefer a stable-synced release when available; otherwise document and test the chosen source/testing build. [Luxonis distribution and package guidance](https://docs.luxonis.com/software-v3/depthai/ros).

RTAB-Map lists ROS 2 Jazzy on Ubuntu 24.04 and documents binary installation. Verify actual arm64 package availability on the flashed Pi, run a camera stream/USB soak test, inspect synchronization/TF, and replay a recorded mapping bag before claiming compatibility. MPPI parameter schemas differ across ROS releases: Jazzy uses `motion_model: Omni`, whereas newer rolling documentation can show plugin-style motion-model configuration. [RTAB-Map support matrix](https://github.com/introlab/rtabmap_ros/blob/ros2/README.md), [Jazzy MPPI configuration](https://raw.githubusercontent.com/ros-navigation/navigation2/jazzy/nav2_mppi_controller/README.md), [later Nav2 migration](https://docs.nav2.org/rolling/configuration_and_development/migration_guides/kilted/Kilted/).

Keep camera, stop enforcement and routine navigation on the robot. Offload semantic inference and optional offline map optimization to the home Mac. Keeping the Pi's immediate control path local means a slow Wi-Fi/model service can pause the task without preventing a local stop.

## OpenAI Decisions and a local model adapter

The current **OpenAI Decisions API** accepts text/images and typed questions. As checked on 20 October 2026, it is public beta, supports `gpt-6-luna`, and uses `POST /v1/decisions`. Request fields are `model`, `input`, and `questions`; the returned `answers` contain predicate probabilities, choices from supplied options, or rubric scores. This fits selecting a **fixed high-level intent**, such as `wait`, `visit_kitchen`, `return_home`, or `needs_help`. Handle refusals, unknown choices and low confidence by waiting. [Official Decisions guide](https://developers.openai.com/api/docs/guides/decisions).

For arbitrary parameterized actions, use a separate model adapter backed by Responses structured output/function calling, or a local model with validated output. Decisions is not an arbitrary JSON-action or tool-calling endpoint. [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [function calling](https://developers.openai.com/api/docs/guides/function-calling).

The following is our **internal, provider-neutral action envelope**, not a claim about an OpenAI or local-model HTTP schema:

```json
{
  "request_id": "example-17",
  "action": "navigate_to_named_place",
  "place_id": "kitchen_entry",
  "map_revision": "home-map-03",
  "issued_at": "2026-10-20T12:00:00Z",
  "expires_at": "2026-10-20T12:00:05Z"
}
```

A trusted gateway verifies authentication, allowed action/place names, map revision, timestamps and replay/duplicate requests. The robot resolves a known place into a Nav2 goal and reports progress. The model never supplies motor PWM or overrides the stop layer. Keep provider credentials on the home gateway/server, outside the public webpage, downloadable CAD and robot-facing browser code. A local service implements its own adapter; compatibility with OpenAI Decisions is not assumed.

Give the model selected RGB snapshots and a compact state summary, including current named location, battery state, task progress, valid sensor coverage, confidence and recent failures. Keep dense depth and wheel feedback local. Model confidence is not a calibrated physical-clearance guarantee. For “go to the kitchen,” the model chooses `visit_kitchen`; navigation finds the route; the MCU controls wheel speeds and enforces timeouts.

## Acceptance sequence

1. Wheels raised: verify encoder signs, individual wheel direction, current limit, stop switch, watchdog and disconnect handling.
2. Closed flat test area: measure forward, sideways and rotation response; characterize slip, odometry and loaded braking distances.
3. Record RGB/depth/IMU/encoder data; inspect timestamps, calibration, scene texture and near-field gaps.
4. Teleoperate one room, build a map, replay data, and verify relocation/map consistency before autonomous goals.
5. Test known-place navigation, obstacle appearance, blocked routes, stale sensors, lost Wi-Fi and model timeout/refusal.
6. Validate individual bumper, perimeter and floor sensors in final mounts. Treat stair avoidance and unattended use as unaccepted until physical evidence supports them.

The first useful milestone is a teleoperated robot with a working independent stop. The next is repeatable one-room mapping and named-place navigation. Natural-language decisions sit above that verified motion stack.
