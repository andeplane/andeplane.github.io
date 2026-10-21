# Kiwi: three vision-only variants

Camera and algorithm research checked against primary sources on 21 October 2026. All three variants use cameras for observing the house, with wheel encoders and a base IMU for internal motion feedback and physical contact bumpers. No external electronic range or distance sensors are included. Software integration and physical performance remain untested.

## Choose the camera capability

| Variant | Proposed hardware | Useful first capability | What it does not establish |
| --- | --- | --- | --- |
| A — Front RGB | One Waveshare OV2735 2MP USB Camera (A), SKU 33122 | Live view, recognizing objects, visual landmarks and inexpensive experiments | A single image does not provide calibrated obstacle distance |
| B — Front + sides | Three of the same RGB modules, facing front, left and right | Observe sideways motion with less turning; choose the relevant view for a task | Independent views are not a synchronized stereo system; rear coverage is still absent |
| C — Front stereo | One Waveshare AR0144 Stereo USB Camera (A), SKU 32695 | Two synchronized views for host-computed metric depth after calibration | It is an image-streaming module, not a guaranteed calibrated depth-output camera |

**Start with A for the lowest-cost starting point. Choose B if looking sideways is the priority. Choose C if experimenting with measured front-facing depth and mapping is the priority.** These are alternative camera builds, not three simultaneous camera purchases.

The OV2735 module is fixed focus with a rolling shutter, USB 2.0 and MJPEG/YUY2 image formats. Its published 96° field of view is diagonal, not a promise of 96° horizontal coverage. The camera board is approximately 25 × 25 × 22.1 mm; the current listing is USD 14.99 each. [Manufacturer specifications](https://www.waveshare.com/ov2735-2mp-usb-camera-a.htm).

The AR0144 module has two global-shutter color cameras, hardware synchronization and a 52 mm baseline. Published dimensions are 66 × 30 × 17.72 mm, with 65° horizontal/74° diagonal field of view and USB 2.0. The proposed process computes depth on the Pi or home Mac. No factory calibration file or ready-made depth output is assumed. [Manufacturer product](https://www.waveshare.com/product/ar0144-stereo-usb-camera-a.htm), [capture formats and host examples](https://www.waveshare.com/wiki/AR0144_Stereo_USB_Camera_%28A%29).

## A: useful vision with one camera

The immediate software stack is simple: show the camera stream, track a few visual landmarks, recognize objects on the home Mac, and move through short known-clear routes using wheel/IMU feedback. Printed AprilTag/ArUco markers are a practical first way to identify a room, tray or dock. Known marker dimensions and calibrated camera intrinsics let OpenCV estimate a marker's pose in metric units. [OpenCV marker detection and pose estimation](https://docs.opencv.org/4.13.0/d5/dae/tutorial_aruco_detection.html).

For more general visual tracking, **ORB-SLAM3** is an established candidate supporting monocular, stereo and visual-inertial configurations. Its upstream camera-calibration and integration work still has to be done; its supplied ROS examples are not proof of a ready-to-install Jazzy/Pi package. [Authors' repository](https://github.com/UZ-SLAMLab/ORB_SLAM3).

A monocular visual map has an unknown scale: a small room viewed nearby can produce the same image geometry as a larger room viewed farther away. Camera intrinsics correct projection and distortion; they do not independently solve that scene-scale ambiguity. Kiwi can obtain metric scale by deliberately aligning/fusing visual motion with calibrated wheel odometry, known-size landmarks, or another known geometric quantity. Camera-to-base calibration and synchronized measurements matter. Merely placing an unscaled visual pose into a standard EKF does not fix its scale. [Visual–inertial–wheel odometry research](https://www.sciencedirect.com/science/article/pii/S0921889024000691), [known camera-height/ground-plane scale research](https://arxiv.org/abs/1903.00912).

A simple illustration: if a calibrated, non-slipping straight motion is 0.40 m while the visual tracker reports 2.0 arbitrary units, the initial scale estimate is 0.20 m per unit. Repeated motion, outlier rejection and drift handling are needed for a useful system. Omni-wheel slip can bias that estimate. A car/differential-drive wheel-fusion implementation must not silently impose zero sideways velocity on this robot.

Monocular learned-depth models such as **Depth Anything V2** can add a relative-depth display or a metric prediction from their fine-tuned variants. They infer depth from learned appearance, and their predicted metres are not a guaranteed clearance measurement in this house. They are useful experiments above the local control layer. [Authors' model descriptions](https://depth-anything-v2.github.io/), [paper](https://arxiv.org/abs/2406.09414).

## B: more viewpoints, not automatic stereo

Run the same front-camera pipeline and add independent left/right images for scene understanding and lateral inspection. Give the model the view that matters, or a clearly labeled set of snapshots. Side views can also supply visual features, but multi-camera SLAM requires its own calibration and estimator support; three independent monocular trackers cannot simply be merged into one consistent map.

The proposed cameras face different directions. A useful stereo pair must observe matching scene content with known relative geometry and sufficiently aligned exposure times. Non-overlapping views mainly improve coverage. Three USB cameras without documented synchronization should not be marketed as a three-camera depth system. Calibrate each lens and its mounting transform even when using the views independently. [OpenCV camera and stereo geometry](https://docs.opencv.org/4.13.0/d9/d0c/group__calib3d.html).

Avoid adding advertised diagonal fields of view to claim 360° coverage. Inspect the actual horizontal fields, mount occlusion and close floor visibility. The rear still requires turning to inspect; a sideways-capable base does not imply it can see every direction.

## C: synchronized stereo and metric depth

The AR0144's fixed baseline and synchronized global-shutter images make it a sensible budget stereo starting point. The host pipeline is:

1. Capture its combined image and verify which half belongs to each eye.
2. Calibrate both cameras and their relative pose at the exact capture resolution; save the measured baseline/intrinsics/distortion.
3. Rectify the pair with OpenCV so matching points lie on corresponding image rows.
4. Run **StereoSGBM** or StereoBM, reject inconsistent/low-confidence matches, and convert valid disparity to depth.
5. Use the resulting depth and camera calibration with a stereo/RGB-D mapping pipeline such as RTAB-Map.

OpenCV supplies the calibration, rectification and stereo correspondence building blocks; this still requires implementing and testing the image pipeline. [OpenCV calibration reference](https://docs.opencv.org/4.13.0/d9/d0c/group__calib3d.html), [stereo depth tutorial](https://docs.opencv.org/4.13.0/dd/d53/tutorial_py_depthmap.html), [RTAB-Map ROS 2](https://github.com/introlab/rtabmap_ros/blob/ros2/README.md).

Stereo depth follows `Z = fx × B / disparity`: with illustrative `fx = 500 px`, `B = 0.052 m` and disparity `26 px`, the depth is 1.0 m. Use the actual calibration, not that example focal length. The near/far usable envelope depends on focus, capture mode and disparity settings. No minimum-depth number from a different camera is carried over to AR0144.

Stereo still needs texture and useful lighting. Blank surfaces, reflections, glass and occluded regions can leave invalid matches. Invalid depth remains unknown space. This variant measures depth only within the overlapping front view, including its unmeasured close blind region. It does not become an all-direction depth sensor.

## Practical image rates and power

These are starting targets to profile on the actual Pi, not measured performance promises:

| Variant | Initial processing target | Practical qualification |
| --- | --- | --- |
| A | Front image about 640 × 360 at 15–20 processed frames/s | Capture a supported 16:9 mode and downscale without distorting geometry |
| B | Front about 640 × 360 at 15 frames/s; each side about 10 frames/s | Process the newest images; keep model snapshots event driven |
| C | About 640 × 480 per eye; begin with 10–15 depth updates/s | Verify side-by-side split, calibration and stereo CPU load in the chosen mode |

For OV2735, the manufacturer explicitly lists 720p/1080p MJPEG at 30 frames/s. If the device does not negotiate a lower-resolution/rate mode, capture that supported mode and process selected downscaled frames; this does not reduce the USB capture bandwidth automatically. For AR0144, a documented starting transport is combined 1280 × 480 YUY2 at 15 frames/s, approximately 18.4 MB/s before overhead. Verify the actual left/right layout before calibrating. The product's advertised maximum capture rate is not a Pi stereo-processing benchmark. [OV2735 modes](https://www.waveshare.com/ov2735-2mp-usb-camera-a.htm), [AR0144 modes](https://www.waveshare.com/wiki/AR0144_Stereo_USB_Camera_%28A%29).

Prefer MJPEG for multiple RGB streams if supported reliably, while measuring decoding cost and image age. Do not send every full-resolution frame through a language-model API. Publish a live preview locally and send selected compressed snapshots to the home Mac/cloud when there is a useful decision to make.

Camera current consumption is not established by these mode tables. The three-camera design includes an externally powered Raspberry Pi USB 3 Hub and a separate DFR0849 camera converter; the Pico remains directly connected to the Pi. Verify the actual hub/cable/source combination and measure each camera's startup and operating current. The other two versions power their camera module from the Pi and must remain within its aggregate USB budget. See wiring.md for the selected power paths. [Official Pi USB power guidance](https://www.raspberrypi.com/documentation/hardware/raspberrypi/usb/configuration.html).

## Motion control stays local

The three timescales remain the same:

| Layer | Runs on | Responsibility |
| --- | --- | --- |
| Wheel control | Pico MCU, proposed 100–200 Hz | Encoder PID, PWM, acceleration limits, heartbeat timeout and bumper inputs |
| Vision/navigation | Pi, proposed 10–30 Hz where feasible | Track the robot, inspect images/depth as available, choose a local trajectory |
| Intent/semantics | Home Mac or cloud, event driven | Interpret requests, identify objects and select known tasks/destinations |

A physical stop opens the motor-driver enable loop; the main switch provides power isolation. The MCU stops when commands expire. Camera/model delay does not control wheel PWM directly. Initial operation is slow on a bounded flat floor; the chosen viewpoints and their floor blind regions do not establish stair-avoidance capability.

Use the **ROS 2 Jazzy omni wheel controller** for three equally spaced omni wheels, and **robot_localization** to fuse metric wheel velocities with base IMU measurements. Keep actual sideways velocity in the state. CAD uses +Y forward/+X right, whereas ROS uses +X forward/+Y left: `vx_ros = vy_cad`, `vy_ros = -vx_cad`, with unchanged yaw rate. [Omni controller](https://control.ros.org/jazzy/doc/ros2_controllers/omni_wheel_drive_controller/doc/userdoc.html), [EKF configuration](https://github.com/cra-ros-pkg/robot_localization/blob/rolling-devel/doc/configuring_robot_localization.rst).

For stereo C, RTAB-Map can build a metric map and occupancy grid after the stereo pipeline is qualified. Nav2 can use a holonomic planner/controller such as NavFn/Smac 2D with DWB or Omni MPPI. For A/B, start with known routes, wheel/IMU localization and visual landmarks; a sparse monocular map or an object detector alone is not a complete obstacle costmap. Camera-based floor segmentation/ground projection is a possible later experiment, with its flat-floor assumptions explicit. [RTAB-Map capabilities](https://github.com/introlab/rtabmap_ros/blob/ros2/README.md), [Nav2 navigation plugins](https://docs.nav2.org/rolling/configuration_and_development/navigation_plugins/).

Use **Ubuntu Server 24.04 arm64 / ROS 2 Jazzy** as the integration target. Verify UVC capture and actual arm64 package installation on the Pi. Pin working versions after calibration and recorded-data replay. Package documentation does not establish this combined build's performance. [ROS maintainers' Pi guide](https://github.com/ros2/ros2_documentation/blob/jazzy/source/How-To-Guides/Installing-on-Raspberry-Pi.rst).

## Model decisions

OpenAI's documentation distinguishes **Decisions** typed choices/predicates/scores from **Responses** structured outputs/function calling for parameterized actions. A model can choose `wait`, `visit_kitchen` or `return_home`; a local adapter validates the result and turns it into a bounded robot task. Local models use their own adapter rather than assumed Decisions compatibility. Provider credentials stay on the trusted gateway/server. [Decisions guide](https://developers.openai.com/api/docs/guides/decisions), [function calling](https://developers.openai.com/api/docs/guides/function-calling).

For “go to the kitchen,” the camera provides scene context; wheel/IMU and calibrated visual localization estimate movement; navigation resolves a known destination; the MCU controls wheels. Stereo adds geometric front depth. More model confidence does not create missing metric scale or unseen camera coverage.

## First demonstrations

1. Verify wheels, encoder signs, stop switch, contact bumpers and watchdog with wheels raised.
2. Teleoperate on a flat enclosed floor; measure loaded stopping distance and camera visibility.
3. Calibrate the chosen camera build and record images with encoder/IMU timestamps.
4. A/B: demonstrate known visual landmarks and short repeatable routes. C: demonstrate validated stereo depth, then one-room mapping.
5. Add model-selected known goals; test poor images, lost tracking, slow responses and Wi-Fi loss.

This is a staged route to a useful vision-based robot. The documents and viewer remain design/research artifacts until the selected variant is assembled and tested.
