# Inexpensive vision-only camera options

Checked 21 October 2026. Recommend the same **Waveshare OV2735 2MP USB Camera (A), SKU33122** for one front view or three independent front/left/right views. Recommend **Waveshare AR0144 Stereo USB Camera (A), SKU32695** for the stereo experiment.

Manufacturer product/search-index content was retrieved today, but direct Waveshare store opens returned HTTP403. USD prices below are planning references from that indexed manufacturer content; stock, Norway delivery, shipping and final VAT are unverified. Distributor availability was checked separately. No purchase was made.

| Variant | Camera hardware | Quoted hardware subtotal, excluding cables |
| --- | --- | --- |
| Front RGB | 1× OV2735 at USD14.99 | USD14.99 |
| Front + left + right RGB | 3× OV2735 at USD14.99 + Pi USB3 Hub USD14.25 + DFR0849 USD5.90 | USD65.12 |
| Stereo | 1× AR0144 stereo module at USD66.99 | USD66.99 |

Use USD14.99 conservatively for each RGB camera; an indexed three-unit tier of USD14.39 was also displayed. [Manufacturer RGB listing](https://www.waveshare.com/ov2735-2mp-usb-camera-a.htm), [manufacturer stereo listing](https://www.waveshare.com/ar0144-stereo-usb-camera-a.htm).

## Single and three independent RGB cameras

OV2735 is a fixed-focus, rolling-shutter color camera with USB2 Type-C and an alternative SH1.0 four-pin USB header. Manufacturer Linux/Pi5 examples and MJPEG/YUY2 modes are documented. The nominal96° field is **diagonal**, not horizontal. The module is25×25×22.1mm; the visually checked manufacturer outline reproduced by its distributor shows four Ø2 holes on21×21mm pitch,1.6mmPCB, centeredØ14 lens projecting16mm from the PCB front. The USB-C connector is centered on one board edge; orient that edge downward and allow30mm for plug/bend clearance. [Manufacturer wiki](https://www.waveshare.com/wiki/OV2735_2MP_USB_Camera_%28A%29), [outline drawing mirror](https://d2air1d4eqhwg2.cloudfront.net/markdownx/82ec46a9-5b11-422e-8bdf-77a6714958d5.png), [connector photograph](https://d2air1d4eqhwg2.cloudfront.net/markdownx/2053b979-9614-4c13-b42a-935de62146c9.png).

The package lists only a camera and SH1.0 cable: add one USB-A→C **data cable per camera**. Three independent cameras are not synchronized stereo. Use stable USB port-path names when identical cameras have duplicate or absent serial numbers; verify enumeration on the actual units. Begin with MJPEG at a modest frame rate and test simultaneous capture rather than promising three full-resolution30fps streams. Three cameras broaden views but do not establish metric depth or continuous360° coverage.

Switch Science showed three SKU33122 units at JPY2992 including Japanese tax; this is an availability cross-check, not a Norway purchasing recommendation. [Distributor](https://www.switch-science.com/products/10960).

## Stereo capture and depth boundary

AR0144 has a52mm baseline, global shutters and manufacturer-claimed synchronized same-frame output over one USB2 Type-C connection. The published2560×720 combined mode corresponds to two1280×720 views; verify left/right ordering and captured layout before calibration. MJPEG2560×720 at30fps and YUY2 at5fps are listed by the manufacturer. Linux and Raspberry Pi capture instructions are provided. The wiki contains conflicting high-rate mode tables, so request modes withV4L2 and test the actual device rather than relying on every advertised frame rate. [Product](https://www.waveshare.com/ar0144-stereo-usb-camera-a.htm), [Linux/Pi wiki](https://www.waveshare.com/wiki/AR0144_Stereo_USB_Camera_%28A%29).

The manufacturer demonstration shows color imagery, but neither an explicit color/mono order selector nor the fitted sensor suffix was found. Verify the delivered module is color before purchase; do not claim selectable mono/color hardware. No per-unit calibration file, quantitative synchronization tolerance, or onboard depth engine was verified. The unit must be calibrated at its operating resolution, rectified, and matched on the Pi using e.g.OpenCV stereoCalibrate/stereoRectify/StereoSGBM. Textureless, reflective, dark and occluded areas remain problematic; actual Pi frame rate and depth error are unmeasured. [OpenCV calibration](https://docs.opencv.org/4.x/d9/d0c/group__calib3d.html), [StereoSGBM](https://docs.opencv.org/4.x/d2/d85/classcv_1_1StereoSGBM.html).

Published board dimensions are66×30mm. The manufacturer outline has four Ø3.2 mounting holes on60×24mm pitch; lens centers are(7,15) and(59,15)mm, lensØ14, PCB1.6mm. Its17.72mm side dimension appears to exclude the rear USB projection, so CAD should reserve22mm bare depth provisionally plus30mm plug/bend space. Physical measurement remains required. [Manufacturer drawing](https://www.waveshare.com/img/devkit/accBoard/AR0144-Stereo-USB-Camera-A/AR0144-Stereo-USB-Camera-A-details-size.jpg), [visually checked drawing mirror](https://cdn.static.spotpear.cn/uploads/picture/product/module/camera/AR0144-Stereo-USB-Camera-A/AR0144-Stereo-USB-Camera-A-details-06.jpg).

Kamami showed three available at PLN336.01 including local tax, PLN273.18 excluding tax. [Distributor order page](https://kamami.pl/en/cameras/1202626-ar0144-2mp-stereo-usb-camera-module-ar0144-sensor-chip-usb2-0-port-synchronized-same-frame-output-5902186339064.html).

A cheaper synchronized rolling-shutter alternative is Waveshare OS02G10 SKU32639 at USD56.99,100×22×17.72mm,62mm baseline. Its manufacturer lists140mA; **that value must not be transferred to the selected AR0144 or OV2735**. The AR0144 global-shutter option costs only USD10 more. [Alternative manufacturer listing](https://www.waveshare.com/product/os02g10-stereo-usb-camera-a.htm).

## USB and camera power

Complete-module current is unpublished in the accessible primary specifications for both selected cameras. Allocate500mA per RGB camera provisionally; verify USB descriptors and measure startup/streaming current. Three cameras plus a100mA provisional Pico allocation would exhaust Pi5's1.6A aggregate USB budget, so the three-camera design includes an externally powered hub. A hub does not increase the480Mb/s bandwidth shared by its USB2 devices.

Use official **Raspberry Pi USB3 Hub SC1636**, PiShop USD14.25/in-stock shown. It accepts external5V3A over USB-C, has four downstream USB-A ports and an80mm captive upstream USB-A cable. Official approximate dimensions are57.4×52.4×18mm; use a strap carrier. Raspberry Pi engineer`jdb` documents ideal-diode power mixing that prevents upstream back-power. [Official specifications/dimensions](https://www.raspberrypi.com/documentation/accessories/usb.html), [primary engineer explanation](https://forums.raspberrypi.com/viewtopic.php?t=389617), [order link](https://www.pishop.us/product/raspberry-pi-usb-3-hub/).

Use **DFRobot DFR0849** as the dedicated camera power converter, USD5.90 with12left shown. Its6–32V input covers the3S pack; the USB-A output defaults to5V and supports up to3A with protection and charging recognition. Use one output only. Add a standard USB-A→C power cable from this source to the hub power input. This avoids using a USB-C sink breakout as a source. The50×40mm footprint is listed in Mouser's manufacturer record; no assembly-height or mounting-hole drawing was found. CAD reserves25mm height as clearance, **not a measured part dimension**. [Manufacturer supply/order page](https://www.dfrobot.com/product-2299.html), [dimension record](https://www.mouser.com/en/ProductDetail/DFRobot/DFR0849?qs=ljCeji4nMDmXQ1xHHWD9YQ%3D%3D).

```text
3S BAT_SW → 2A input fuse → DFR0849 → one USB-A output
  → USB-A-to-C power cable → Pi USB3 Hub USB-C power input
Pi5 USB3 port ← hub captive USB-A data cable
Hub USB-A ports → three USB-A-to-C data cables → three OV2735 cameras
Pi5 separate USB port → Pico2 Micro-B
```

Join grounds at the existing power-star arrangement; use short20AWG converter supply wiring. Keep the second DFR0849 output unused, and fit no fast-charge trigger. Verify4.75–5.25V at the loaded hub input and2A continuous output across9.9–12.6V battery input, including thermal soak and camera startup. Standard A→C provides legacy CC behavior; do not describe it as3A Type-C advertisement. Confirm hub operation with this exact source/cable under the target load. The main Pi buck retains its separate6A qualification target. Hub/camera cable and fuse costs remain in the unquoted assembly allowance.
