# Kiwi: inset cameras and viewing directions

Target layout for the new CAD revision, checked on 21 October 2026. The camera boards sit inside the body, with optical apertures in the shell. Mount positions, cable space and ray clearance still need inspection on the physical parts; CAD clearance alone does not verify useful images.

| Version | Target arrangement | Purpose |
| --- | --- | --- |
| A: one RGB module | One forward-facing inset camera | Lowest-cost view for teleoperation, landmarks and recognition |
| B: three RGB modules | Forward, front-left and front-right; axes at 0°/approximately ±45° | More forward-side context while keeping the boards integrated into the shell |
| C: stereo module | One rigid forward-facing two-eye board, 52 mm lens-center baseline | Synchronized overlapping images for calibrated host-computed depth |

The angles describe the optical viewing direction from the robot's front, not a guaranteed coverage boundary. For B, label the views `front`, `front_left` and `front_right`. These are diagonal views; the robot still has to turn to inspect areas behind it. A more sideways ±90° arrangement would trade some shared forward context for side coverage. The chosen ±45° arrangement should be verified using actual calibrated images rather than a decorative view cone.

## What we take from Tesla

Tesla distributes cameras at the windshield, door pillars, front fenders and rear of the Model 3. That is a useful example of integrating cameras into a vehicle and using multiple viewpoints. It does not specify the 0°/±45° arrangement chosen here: those angles are our indoor-robot design choice, with a different body, lens and driving environment. [Tesla Model 3 camera locations](https://service.tesla.com/docs/Public/diy/model3/en_us/GUID-682FF4A7-D083-4C95-925A-5EE3752F4865.html).

## Coverage is not stereo

Three OV2735 cameras remain independent USB image streams. Moving two cameras toward overlapping views does not synchronize their exposures, establish their exact relative pose or supply a stereo estimator. Camera-to-base calibration helps associate observations with the robot; it does not by itself establish metric scene depth. The front/diagonal views can help recognition and supply features to a suitable multi-camera tracker, with integration still required.

For C, the AR0144 manufacturer documents hardware-synchronized output, global shutters and a fixed 52 mm baseline. The pair still needs per-eye calibration and rectification at the selected capture mode. A software synchronizer only groups messages; matching timestamps assigned after capture cannot repair exposures taken at different times. [Manufacturer stereo specifications](https://www.waveshare.com/product/raspberry-pi/cameras/ar0144-stereo-usb-camera-a.htm), [ROS stereo calibration](https://github.com/ros-perception/image_pipeline/blob/jazzy/camera_calibration/doc/tutorial_stereo.rst), [RTAB-Map synchronization](https://github.com/introlab/rtabmap_ros/blob/ros2/rtabmap_sync/doc/stereo_sync.md).

## Apertures and useful field of view

The OV2735's quoted 96° is **diagonal**, not horizontal. AR0144 specifies 65° horizontal, 43° vertical and 74° diagonal. Do not add diagonal angles or drawn cones to claim full surround coverage. Capture mode, crop, lens distortion, rectification and the housing all affect the useful view. Confirm the delivered stereo module's color/mono format separately; geometry does not establish color output. [OV2735 specifications](https://www.waveshare.com/ov2735-2mp-usb-camera-a.htm), [AR0144 specifications](https://www.waveshare.com/product/raspberry-pi/cameras/ar0144-stereo-usb-camera-a.htm).

An inset lens can be clipped by a thick aperture, a nearby shell edge or the lip of its mount. Keep the lens opening clear throughout the calibrated view. Inspect the front and diagonal extremes, both stereo eyes, cable bend and plug access. Use real component measurements and a small fit coupon before printing the full shell. Avoid adding an unqualified transparent cover: reflections, scratches and refraction can change the image and calibration.

The low camera position also creates a floor blind region. As a simple geometric estimate, with lens height `h` and the lowest useful viewing ray `α` below horizontal, the first visible flat floor is `d = h / tan(α)` away. Lens recess and the robot's body can extend that gap. This estimate is not a minimum stereo-depth specification or a verified obstacle envelope. Pitching a camera down can reveal nearer floor while losing higher scene context; measure that tradeoff with the final mount.

## Calibration and qualification

1. Confirm the delivered board, lens centers, connector envelope and native image layout.
2. Calibrate each camera's intrinsics at the actual image mode, then measure its transform to the robot base. Recalibrate after changing lens focus, crop, mount or image geometry.
3. For stereo, calibrate the pair together using a measured target, inspect epipolar alignment and test known distances; retain the baseline in the right camera's projection matrix.
4. Capture a floor/obstacle test set in the final shell, including low obstacles near the body, edges of view, reflections, dim light and robot motion.

ROS optical frames use image-right X, image-down Y and optical-forward Z. Those axes differ from the robot base frame; preserve the transform rather than treating camera pixels as robot-forward coordinates. [ROS image frame convention](https://github.com/ros2/common_interfaces/blob/jazzy/sensor_msgs/msg/Image.msg), [OpenCV calibration/rectification geometry](https://docs.opencv.org/4.13.0/d9/d0c/group__calib3d.html).

The inset design improves packaging. Useful visibility and mapping accuracy remain commissioning results to measure on the assembled robot.
