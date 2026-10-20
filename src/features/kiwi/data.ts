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
  { title: 'Luxonis OAK-D Lite hardware', url: 'https://docs.luxonis.com/hardware/products/OAK-D%20Lite', detail: 'Calibrated stereo pair, RGB camera, dimensions, and USB interface.' },
  { title: 'ROS 2 omni wheel controller', url: 'https://control.ros.org/jazzy/doc/ros2_controllers/omni_wheel_drive_controller/doc/userdoc.html', detail: 'Three-wheel kinematics, encoder odometry, and command timeout.' },
  { title: 'OpenAI Decisions API', url: 'https://developers.openai.com/api/docs/guides/decisions', detail: 'Typed choices, predicates, and scores. Public beta documentation checked 20 October 2026.' },
  { title: 'OpenAI function calling', url: 'https://developers.openai.com/api/docs/guides/function-calling', detail: 'Schema-constrained calls for parameterized robot actions through Responses.' },
]
