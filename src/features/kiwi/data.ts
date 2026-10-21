import bill from './parts.json'

export interface Part {
  id: string; category: string; name: string; quantity: number; unit: string
  price?: number; currency?: string; url: string; note: string; status?: string
}

export const parts: Part[] = bill.items

export const sources = [
  { title: 'Pololu 75:1 25D MP gearmotor with encoder · #4866', url: 'https://www.pololu.com/product/4866', detail: 'Motor, encoder, speed, stall current, and dimensional drawing.' },
  { title: 'Nexus 60 mm double omni wheel · #14145', url: 'https://www.nexusrobot.com/product/60mm-aluminum-double-omni-wheel-basic-14145.html', detail: 'Wheel specification; the drawing takes precedence over the conflicting width in the listing.' },
  { title: 'Nexus 4 mm mounting hub · #18018', url: 'https://www.nexusrobot.com/product/4mm-aluminum-mounting-hub-for-60mm-omni-wheel-18018.html', detail: 'Manufacturer-matched hub for the wheel and 4 mm shaft.' },
  { title: 'Raspberry Pi 5', url: 'https://www.raspberrypi.com/products/raspberry-pi-5/', detail: 'Board dimensions, connectors, cooling, and power requirements.' },
  { title: 'Waveshare OV2735 USB camera', url: 'https://www.waveshare.com/ov2735-2mp-usb-camera-a.htm', detail: 'Basic 2 MP camera used singly or in front and ±45° forward-side views.' },
  { title: 'Waveshare AR0144 stereo USB camera', url: 'https://www.waveshare.com/ar0144-stereo-usb-camera-a.htm', detail: 'Synchronized stereo pair; calibration and depth computation run on the host.' },
  { title: 'ROS 2 omni wheel controller', url: 'https://control.ros.org/jazzy/doc/ros2_controllers/omni_wheel_drive_controller/doc/userdoc.html', detail: 'Three-wheel kinematics, encoder odometry, and command timeout.' },
  { title: 'RTAB-Map stereo SLAM', url: 'https://github.com/introlab/rtabmap_ros/blob/ros2/rtabmap_slam/doc/rtabmap.md', detail: 'Stereo mapping, loop closure, localization and the limits of RGB-only inputs.' },
  { title: 'Tesla Model 3 camera locations', url: 'https://service.tesla.com/docs/Public/diy/model3/en_us/GUID-682FF4A7-D083-4C95-925A-5EE3752F4865.html', detail: 'A reference for body-integrated cameras. Kiwi’s 0°/±45° layout is our own design choice.' },
  { title: 'OpenAI Decisions API', url: 'https://developers.openai.com/api/docs/guides/decisions', detail: 'Typed choices, predicates, and scores. Public beta documentation checked 20 October 2026.' },
  { title: 'OpenAI function calling', url: 'https://developers.openai.com/api/docs/guides/function-calling', detail: 'Schema-constrained calls for parameterized robot actions through Responses.' },
]
