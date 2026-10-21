# Kiwi: mapping the house from the Mac mini

Research/design proposal checked against primary sources on 21 October 2026. No robot is connected to the website; this change installs no mapping software on the home Macs. The website's interactive map is an illustration using example data, not a scan of this house or an executed SLAM session.

Yes: the robot can send its observations to the Mac mini while driving, and the mini can build a floorplan, estimate the robot's position and maintain object/room labels. For Kiwi, calibrated stereo is the most direct proposed route to metric 3D geometry and a useful 2D occupancy map. More compute does not supply depth missing from a single image.

## Processing split

Keep the robot inexpensive: its cameras capture images and the Pi captures/encodes/streams them, publishes motion feedback and enforces fresh bounded commands. It runs **no object detection, scene-understanding model or LLM**. The Mac mini performs geometric processing (stereo, SLAM, localization and route planning). Vision-capable LLMs and decision models on the mini or in the cloud interpret objects, rooms and goals from selected images and map context. A local vision LLM can run on the macOS host separately from the ROS Linux guest, through a model adapter. The camera BOM needs no AI accelerator.

## What each camera build can map

| Build | Credible starting result | Additional work before a navigation map |
| --- | --- | --- |
| A: one RGB camera | Live view, visual landmarks, wheel/IMU trajectory; candidate monocular SLAM | Deliberate scale alignment, then reconstruction/free-space estimation; a sparse visual feature map is not a floorplan |
| B: three independent RGB cameras at 0°/±45° | The same, with more forward-side context and visual observations | No automatic stereo: multi-camera estimation needs calibration, time handling and suitable software |
| C: synchronized stereo | Metric front-facing depth, visual SLAM and accumulated 3D points after calibration | Validate depth, floor/obstacle segmentation, unknown-space handling and map quality |

**RTAB-Map for C:** it accepts calibrated stereo images and external odometry, or stereo visual odometry. **ORB-SLAM3 for A/B:** a candidate visual tracker whose monocular map needs a metric anchor from wheel motion, known-size landmarks or another calibrated constraint. Its sparse points do not directly describe traversable floor. RTAB-Map's RGB-plus-odometry mode also does not turn ordinary RGB images into its metric depth map. [RTAB-Map input modes](https://github.com/introlab/rtabmap_ros/blob/ros2/rtabmap_slam/doc/rtabmap.md), [ORB-SLAM3 authors' repository](https://github.com/UZ-SLAMLab/ORB_SLAM3).

## Proposed data flow

```text
ROBOT
Camera(s) → Pi capture/encode + calibration data + source timestamps ─────────┐
Encoders + IMU → Pi continuous local odometry ───────────────────┤ Wi-Fi
                                                              ↓
MAC MINI — Ubuntu 24.04 guest / ROS 2 Jazzy
Decode → rectify/synchronize stereo → RTAB-Map SLAM/localization
                                      ├→ 3D point cloud
                                      ├→ 2D occupied/free/unknown grid
                                      └→ global robot pose
Images → offboard vision LLM → object/room hypotheses
Hypotheses + valid geometry + pose → mapped observations → room labels
Map + robot pose + confirmed destination → Nav2 → bounded motion
                                                              ↓
ROBOT
Pi validates fresh commands → Pico wheel PID/watchdog → motors

BROWSER ← map, robot pose, route, observed objects and room names
```

This is a proposed ROS 2 integration, not existing firmware. Keep original acquisition timestamps on images, odometry and IMU measurements; never stamp an image with its arrival time on the mini. The Pi splits a combined stereo frame into two eyes, preserving their common acquisition stamp and the correct per-eye calibration. Send `CameraInfo` and camera-to-base transforms alongside the images. [ROS Image timestamp/frame definition](https://github.com/ros2/common_interfaces/blob/jazzy/sensor_msgs/msg/Image.msg), [stereo calibration](https://github.com/ros-perception/image_pipeline/blob/jazzy/camera_calibration/doc/tutorial_stereo.rst).

On the mini, `stereo_image_proc` can rectify calibrated pairs and compute disparity/points; RTAB-Map can also consume stereo directly. Pick one geometry pipeline so two inconsistent depth estimates are not mixed. The software synchronizer groups corresponding data; it does not synchronize the exposures of three free-running USB cameras. [Jazzy stereo image pipeline](https://github.com/ros-perception/image_pipeline/blob/jazzy/stereo_image_proc/doc/configuration.rst), [RTAB-Map stereo synchronization](https://github.com/introlab/rtabmap_ros/blob/ros2/rtabmap_sync/doc/stereo_sync.md).

## Localization and floorplan

Use one owner for each transform:

| Transform | Proposed owner | Meaning |
| --- | --- | --- |
| `odom → base_link` | Pi: wheel/IMU fusion | Smooth local motion, including sideways movement; may drift |
| `map → odom` | Mini: SLAM/localization | Correct accumulated drift when places are recognized |
| `base_link → camera_optical_frame` | Measured mount/URDF | Fixed camera location and orientation |

Loop closure recognizes a previously visited place and adjusts the map trajectory. It can move the global pose while local odometry remains continuous. If stereo visual odometry is added later, fuse it deliberately rather than letting multiple nodes publish the same transform. [Nav2 state-estimation conventions](https://docs.nav2.org/rolling/getting_started/navigation_concepts/state_estimation/), [wheel/IMU fusion](https://docs.nav2.org/jazzy/configuration_and_development/first_time_robot_setup_guide/odom/setup_robot_localization/).

For C, accumulate valid stereo points in a 3D map, distinguish observed floor from obstacles, and project an appropriate height band into a 2D occupancy grid. RTAB-Map's map assembly supports point clouds and occupancy maps; exact topic names/features depend on the pinned package version. A proposed 5 cm grid is a starting visualization/navigation setting, not an accuracy claim. Unseen areas and invalid depth remain unknown. A saved map can later be used for localization rather than continuously adding map nodes. [RTAB-Map map assembly](https://github.com/introlab/rtabmap_ros/blob/ros2/rtabmap_util/doc/map_assembler.md), [mapping/localization mode parameter](https://github.com/introlab/rtabmap/blob/master/corelib/include/rtabmap/core/Parameters.h).

The resulting display can resemble a robot-vacuum floorplan: occupied walls/furniture, free floor, unexplored areas, robot pose and room regions. Its underlying sensing and measured reliability will differ. It will be a partial reconstruction from the robot's low viewpoints, with gaps around glass, blank surfaces, occlusions and the close floor blind region. A visually attractive map is not evidence of reliable stair detection.

## Objects and room names

Geometry and meaning are separate outputs. Our proposed semantic layer is:

1. Send selected timestamped images and relevant map context to an offboard vision LLM. Retain object/room hypotheses with their source view and observation time. No onboard detector is involved; the model runtime is on the mini or in the cloud.
2. For stereo C, if the model supplies a usable image region, validate that region against the image and depth before associating it with geometry. Reject background/outliers, back-project valid pixels through the calibrated camera model, then transform them into `map` at the observation timestamp. A text-only object name remains a view/room observation rather than a precise 3D point.
3. Associate repeated observations into object tracks with position uncertainty and a last-seen time. Keep the original observations tied to map nodes so loop-closure corrections can move the object locations consistently.
4. For A/B without qualified geometry, display “seen from here” observations rather than inventing a precise object location.
5. Let the user draw/confirm room regions and names. Image context can suggest “kitchen,” but seeing a fridge alone does not establish a room boundary or its name.

For a rectified image, back-projection uses `X = (u − cx) × Z / fx`, `Y = (v − cy) × Z / fy`; the camera point is then transformed through the timestamped TF chain. An object rectangle alone can contain background, so a center-pixel distance is not sufficient. ROS `vision_msgs` provides 3D detection messages with hypotheses, pose and persistent IDs; creating reliable observations remains our integration work. [OpenCV camera geometry](https://docs.opencv.org/4.13.0/d9/d0c/group__calib3d.html), [Detection3D message](https://github.com/ros-perception/vision_msgs/blob/ros2/vision_msgs/msg/Detection3D.msg).

Research systems such as ConceptGraphs demonstrate richer semantic 3D maps from posed RGB-D images. They are useful references, not an assumed turnkey Mac mini package or measured performance baseline. Our proposed semantic path instead starts with offboard vision-LLM observations, stable IDs and user-confirmed labels; the robot captures and transports images only. [Authors' implementation and inputs](https://github.com/concept-graphs/concept-graphs).

“Go to the kitchen” resolves to a confirmed room ID and a reachable free-floor goal. Nav2 plans a route; it does not drive to a guessed label or straight through a detected object. Moving chairs and people stay time-sensitive observations, not permanent room geometry.

## Mac mini, Wi-Fi and timing

Target an **Ubuntu 24.04 arm64 VM on an Apple Silicon mini**, or amd64 on an Intel mini, running ROS 2 Jazzy. Ubuntu has the official binary route; Jazzy's stock macOS route is a source build, with Apple Silicon macOS absent from its platform table. Canonical documents macOS VM support for M-series and Intel Macs. The mini's actual CPU, RAM, OS and VM performance still need checking; do not promise a processing frame rate or Metal/CUDA acceleration inside the guest. [Jazzy platform table](https://github.com/ros-infrastructure/rep/blob/master/rep-2000.rst#jazzy-jalisco-may-2024---may-2029), [Jazzy installation](https://github.com/ros2/ros2_documentation/blob/jazzy/source/Installation.rst), [Canonical VM prerequisites](https://canonical.com/multipass/docs/latest/how-to-guides/install-multipass/).

A practical first network target is **two 640 × 360 grayscale images at 10 pairs/s** for stereo geometry: about **36.9 Mbit/s raw pixel data**, before headers. Lossless compression can reduce that, depending on image content. Uncompressed RGB would be about 110.6 Mbit/s. Send color previews/model snapshots separately at a lower/event-driven rate if the delivered module supplies color. This target is not a home Wi-Fi measurement or a SLAM speed claim. Prefer wiring the mini to the access point and qualify the robot's moving Wi-Fi link.

Use lossless image transport initially for geometry; JPEG is an optional measured tradeoff because artifacts can affect feature/stereo matching. Lossless network encoding cannot remove artifacts already introduced by camera MJPEG. Enumerate actual UVC capture modes, then benchmark image age, bitrate, dropped pairs, map quality and CPU while replaying a recording. Reduce resolution/rate if necessary. [RTAB-Map compressed-stereo guidance](https://github.com/introlab/rtabmap_ros/blob/ros2/rtabmap_sync/doc/stereo_sync.md#compressing-for-a-slow-link).

Synchronize the Pi and Linux guest to one time reference, for example a LAN chrony server, and measure their clock offset. Map Pico sample times into the Pi clock and measure camera/USB latency. NTP clock synchronization does not synchronize camera exposures. Configure short image queues and compatible sensor-data QoS so old frames do not accumulate; verify VM/LAN DDS discovery, using an explicit discovery route if multicast is unavailable. [chrony LAN clocks](https://chrony-project.org/faq.html), [ROS 2 sensor QoS](https://github.com/ros2/ros2_documentation/blob/jazzy/source/Concepts/Intermediate/About-Quality-of-Service-Settings.rst), [ROS 2 discovery-server route](https://github.com/ros2/ros2_documentation/blob/jazzy/source/Tutorials/Advanced/Discovery-Server/Discovery-Server.rst).

The robot stops if commands expire, Wi-Fi fails, tracking is lost or the observations supporting motion become too old. Fast motor control, the heartbeat timeout and physical stop remain on the robot. The browser can retain the last map while clearly showing disconnected/stale status. Qualify this with recorded-data replay, then slow supervised driving on a bounded flat floor; the illustrative website map proves none of those physical behaviors.
