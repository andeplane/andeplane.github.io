"""Kiwi K1: editable, parameter-driven CadQuery prototype (all source units mm).

Run: python kiwi.py --variant front-camera --output public/hardware/kiwi/cad/front-camera
Requires CadQuery 2.8 and trimesh. Purchased parts are envelope/reference models,
not vendor CAD. This is a prototype engineering baseline, not a qualified build.
"""
from __future__ import annotations

import argparse
import json
import hashlib
import math
from collections import Counter
from pathlib import Path

import cadquery as cq
import numpy as np
import trimesh
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib

P = dict(
    deck_radius=126.0, deck_bottom=48.0, deck_thickness=6.0,
    seam_gap=0.50, shell_inner=123.4, shell_outer=126.0,
    shell_bottom=63.0, shell_top=139.0, lid_bottom=139.4, lid_thickness=3.6,
    motor_face_radius=102.0, motor_center_z=30.0,
    motor_body_length=68.5, gear_length=23.0, motor_length=30.8,
    gear_diameter=25.0, motor_diameter=24.4, shaft_diameter=4.0,
    shaft_exposed=12.5, hub_motor_gap=1.0, hub_length=16.0,
    wheel_diameter=60.0, wheel_width=25.6,
    wheel_angles_deg=[30, 150, 270],
    clamp_gear_radius=95.0, clamp_rear_radius=63.0,
    clamp_gear_clearance_diameter=25.6, clamp_rear_clearance_diameter=25.0,
    battery_length=105.0, battery_width=34.0, battery_height=23.0,
    battery_center_y=-45.0, battery_bottom=58.0,
    pi_length=85.0, pi_width=56.0, pi_hole_x=58.0, pi_hole_y=49.0,
    tray_bottom=95.0, tray_thickness=4.0,
    m3_clearance=3.4, m3_insert_hole=4.0, insert_depth=5.0,
)
P['wheel_inner_radius'] = P['motor_face_radius'] + P['hub_motor_gap'] + P['hub_length']
P['wheel_center_radius'] = P['wheel_inner_radius'] + P['wheel_width']/2
P['radial_envelope_diameter'] = 2*(P['wheel_inner_radius']+P['wheel_width'])

STRUCTURAL_MOUNTS = {
    'stop':[(54,-20),(98,-20)],'driver':[(-74,-52),(-66,-74)],
    'pico':[(-74,35),(-74,65)],'piPower':[(76,-8),(76,32)],
    'disconnect':[(75,55),(75,73)],
    'mainPanel':[(-27,-101),(27,-101)],
}

COLORS = dict(white=(0.88,0.87,0.82,1), charcoal=(0.095,0.12,0.135,1),
              teal=(0.08,0.53,0.49,1), silver=(0.55,0.59,0.61,1),
              black=(0.025,0.035,0.04,1), green=(0.06,0.35,0.20,1),
              battery=(0.20,0.24,0.29,1), red=(0.8,0.08,0.045,1),
              copper=(0.71,0.47,0.18,1), lens=(0.05,0.13,0.16,1))

VARIANTS={
    'front-camera':dict(label='Single front camera',stereo=False,poses=[('front',0)],hub=False),
    'three-cameras':dict(label='Front, left and right cameras',stereo=False,poses=[('front',0),('left',90),('right',-90)],hub=True),
    'stereo':dict(label='Synchronized stereo camera pair',stereo=True,poses=[('front',0)],hub=False),
}
VARIANT='front-camera'
CONFIG=VARIANTS[VARIANT]
PARTS=[]


def configure(variant):
    global VARIANT,CONFIG
    VARIANT=variant;CONFIG=VARIANTS[variant];PARTS.clear()
    CONFIG.update(width=66.0 if CONFIG['stereo'] else 25.0,height=30.0 if CONFIG['stereo'] else 25.0,
                  cameraZ=154.0 if CONFIG['stereo'] else 151.0,
                  holeX=60.0 if CONFIG['stereo'] else 21.0,holeZ=24.0 if CONFIG['stereo'] else 21.0,
                  holeD=3.2 if CONFIG['stereo'] else 2.0)
    STRUCTURAL_MOUNTS['cameraFront']=[(-43,94),(43,94)]
    if CONFIG['hub']:
        STRUCTURAL_MOUNTS['cameraSides']=[(-99,-9),(-99,9),(99,-9),(99,9)]
        STRUCTURAL_MOUNTS['usbHub']=[(-22,-20),(22,-20),(-22,26),(22,26)]
    else:
        STRUCTURAL_MOUNTS.pop('cameraSides',None);STRUCTURAL_MOUNTS.pop('usbHub',None)
    P.update(variant=variant,camera_width=CONFIG['width'],camera_height=CONFIG['height'],
             camera_centre_z=CONFIG['cameraZ'],camera_board_rear_y=114.0,
             camera_hole_pitch_x=CONFIG['holeX'],camera_hole_pitch_z=CONFIG['holeZ'],
             camera_baseline_mm=52.0 if CONFIG['stereo'] else None,
             active_distance_sensors=0)


def exact_bb(shape):
    # Ignore cached display triangulation; otherwise OCC inflates boxes by mesh deflection.
    bound=Bnd_Box()
    BRepBndLib.AddOptimal_s(shape.wrapped,bound,False,False)
    return cq.BoundBox(bound)

def box(x,y,z,cx=0,cy=0,cz=0):
    return cq.Workplane('XY').box(x,y,z).translate((cx,cy,cz)).val()

def cyl(r,h,p=(0,0,0),d=(0,0,1)):
    return cq.Solid.makeCylinder(r,h,cq.Vector(*p),cq.Vector(*d))

def annulus(outer,inner,z,h):
    return cyl(outer,h,(0,0,z)).cut(cyl(inner,h+2,(0,0,z-1)))

def union(*shapes):
    result=shapes[0]
    for s in shapes[1:]: result=result.fuse(s)
    return result.clean()

def cut(s,*tools):
    for t in tools: s=s.cut(t)
    return s.clean()

def holes(s,points,r,z,h):
    return cut(s,*[cyl(r,h,(x,y,z)) for x,y in points])

def xy(r,a):
    a=math.radians(a)
    return (r*math.cos(a),r*math.sin(a))

def radial(shape,angle):
    return shape.rotate((0,0,0),(0,0,1),angle)

def add(id,name,shape,color='white',kind='printed',source='Kiwi K1 parametric design',
        status='designed; physical fit pending',explode=(0,0,0),group=None,
        stl=True,print_rotation=None,notes=None):
    item=dict(id=id,name=name,shape=shape,color=COLORS[color],kind=kind,
              source=source,dimensionalStatus=status,explode=list(explode),
              group=group or id,printable=(kind=='printed' and stl),
              printRotation=print_rotation or [],notes=notes or [])
    PARTS.append(item)
    return shape

def halved(shape,side):
    # 0.5 mm split allows assembly/print tolerance; no hidden overlapping seam.
    x = -150-P['seam_gap']/2 if side=='left' else 150+P['seam_gap']/2
    return shape.intersect(box(300,400,260,x,0,100)).clean()

def motor_clamp(upper=True):
    rings=[]
    for r,inner in [(95,12.8),(63,12.5)]:
        ring=cyl(16.5,9,(r-4.5,0,30),(1,0,0)).cut(cyl(inner,11,(r-5.5,0,30),(1,0,0)))
        ring=ring.intersect(box(120,70,50,75,0,55 if upper else 5))
        ears=union(box(9,10,18 if upper else 16.5,r,19,39 if upper else 21.75),
                   box(9,10,18 if upper else 16.5,r,-19,39 if upper else 21.75))
        rings.append(union(ring,ears))
    # Side rails join both clamping stations while clearing the motor body.
    rails=[box(41,6,5,79,t,45.5 if upper else 16) for t in (-19,19)]
    s=union(*rings,*rails)
    if upper:
        # Flat top pads seat against deck underside z48.
        s=union(s,box(41,9,2,79,-19,47),box(41,9,2,79,19,47))
    for r in (63,95):
        for t in (-19,19):
            s=s.cut(cyl(1.7,50,(r,t,8)))
            if not upper:
                nut=cq.Workplane('XY').polygon(6,6.5).extrude(2.8).translate((r,t,13.4)).val()
                s=s.cut(nut)
    return s.clean()

def make_deck():
    s=cyl(126,6,(0,0,48))
    for a in P['wheel_angles_deg']:
        # Entire rotating wheel swept envelope plus radial and tangential allowance.
        s=s.cut(radial(box(60,70,18,137,0,54),a))
    for a in P['wheel_angles_deg']:
        for r in (63,95):
            for t in (-19,19):
                p=radial(box(1,1,1,r,t,0),a).Center()
                s=s.cut(cyl(1.7,10,(p.x,p.y,46)))
    # Three removable splice plates, two bolts each.
    for y in (-46,0,72):
        s=holes(s,[(-13,y),(13,y)],1.7,45,15)
    # Strap slots: two 15 mm straps wrap around the pack along its 105 mm axis.
    for x in (-57,57):
        for y in (-54,-36): s=s.cut(box(3.5,16,12,x,y,51))
    # Raised battery locating rails, 1.2 mm side clearance.
    for y in (-64.2,-25.8): s=s.fuse(box(112,2.4,4,0,y,56))
    for x in (-55.5,55.5): s=s.fuse(box(3,40.8,4,x,-45,56))
    # Four upper tray risers bolt from above; inserts are pressed into risers.
    for x,y in [(-47,-8),(47,-8),(-47,58),(47,58)]:
        s=s.cut(cyl(1.7,12,(x,y,46)))
    # Six integrated shell pedestals, radial positions avoid wheel cutouts.
    for a in range(0,360,60):
        x,y=xy(120,a)
        boss=cyl(4.8,7,(x,y,54))
        boss=boss.cut(cyl(2.0,5,(x,y,56)))
        boss=boss.cut(cyl(1.7,8,(x,y,53)))
        s=s.fuse(boss)
    # Bumper carriers in wheel gaps: two screws and two steel-sleeve guide bolts.
    for a in (90,210,330):
        for r,t in [(110,-10),(110,10),(113.5,-20),(113.5,20)]:
            q=radial(box(1,1,1,r,t,0),a).Center()
            s=s.cut(cyl(1.7,12,(q.x,q.y,46)))
        for t in (-3.25,3.25):
            s=s.cut(radial(radial_slot(115,t,46,6.2,2.2,16),a))
    # Open2.2mm-deep wiring races connect small motor feedthroughs to the sensor bus.
    # Remaining deck web3.8mm; thin signal leads only, not forced XT60 connectors.
    for x in ((-35,35) if CONFIG['hub'] else(-27,27)):s=s.cut(box(6,88,2.2,x,24,52.9))
    s=s.cut(box(33,6,2.2,13.5,-25,52.9))
    for a in P['wheel_angles_deg']:
        s=s.cut(radial(box(12,8,10,32,0,51),a))
    # Cable ties, no invented connector mounting pattern.
    for x,y in [(-74,3),(74,3),(-47,22),(47,22)]:
        s=s.cut(box(3.5,10,12,x,y,51))
    # Registered structural mounting pattern for all electronics/service carriers.
    s=holes(s,[q for pattern in STRUCTURAL_MOUNTS.values() for q in pattern],1.7,46,12)
    return s.clean()

def make_splice(y):
    s=box(40,16,5,0,y,45.5)
    s=holes(s,[(-13,y),(13,y)],1.7,41,10)
    s=holes(s,[(-13,y),(13,y)],2.0,43,5.0)
    return s

def make_shell():
    s=annulus(126,123.4,63,76)
    s=s.fuse(annulus(126,116.8,61,4))
    for a in range(0,360,60):
        x,y=xy(120,a)
        s=s.cut(cyl(1.7,10,(x,y,59)))
    # Camera adapter plates pass through the top rim; optics sit above it.
    for label,yaw in CONFIG['poses']:
        width=(max(100,CONFIG['width']+12) if label=='front' else 30)+2
        s=s.cut(radial(box(width,32,14,0,123,134),yaw))
    # Structural rear main-switch opening.
    s=s.cut(box(64,20,44,0,-124,104))
    # Openings for sliding bumper arms/actuator; free3mmradialtravel through shell.
    for a in (90,210,330):
        for t in (-20,20):s=s.cut(radial(box(44,15,12,127,t,66),a))
        s=s.cut(radial(box(44,11,9,127,0,65),a))
    # Discrete lid support pads with inserts; screws accessible from above.
    for a in (20,50,120,160,200,255,285,340):
        x,y=xy(117.8,a)
        pad=cyl(5.5,5,(x,y,134))
        pad=pad.fuse(radial(box(7,11,5,121.5,0,136.5),a))
        pad=pad.cut(cyl(2.0,5,(x,y,134)))
        s=s.fuse(pad)
    # Shallow seat for the flush, separately printable teal accent.
    s=s.cut(annulus(126.2,124.8,73.8,3.4))
    return s.clean()

def make_lid():
    s=cyl(125.4,3.6,(0,0,139.4))
    # Pi intake/exhaust openings leave radial ribs and a generous service opening.
    for x in range(-36,37,8):
        s=s.cut(box(3.8,54,10,x,26,141))
    # IDEC YW1B-V4E01R:22.3mm nominal panel cutout with0.2mm printing clearance.
    s=s.cut(cyl(11.25,10,(78,-48,137)))
    # Camera-specific frame and downward USB connector reliefs.
    for label,yaw in CONFIG['poses']:
        width=CONFIG['width']+10
        s=s.cut(radial(box(width,30,10,0,119,141),yaw))
        s=s.cut(radial(box(18,22,10,0,109,141),yaw))
    for a in (20,50,120,160,200,255,285,340):
        x,y=xy(117.8,a)
        s=s.cut(cyl(1.7,10,(x,y,137)))
        s=s.cut(cyl(3.2,1.5,(x,y,141.5)))
    return s.clean()

def tray():
    s=box(106,76,4,0,25,97)
    # Slots create airflow and leave 9 mm ribs supporting the four Pi pillars.
    for x in (-26,-13,0,13,26): s=s.cut(box(5,45,10,x,26,97))
    # Pi mounting coordinates relative to PCB centre: -39/+19, +/-24.5.
    for x in (-39,19):
        for y in (0.5,49.5):
            st=cyl(3.5,8,(x,y,99))
            st=st.cut(cyl(1.35,9,(x,y,98.5)))
            s=s.fuse(st)
    s=holes(s,[(-47,-8),(47,-8),(-47,58),(47,58)],1.7,93,10)
    # Two reversible cable/USB ties along the side, distinct from Pi holes.
    for y in (12,40): s=s.cut(box(3.5,10,10,47,y,97))
    return s.clean()

def tray_riser(x,y):
    s=union(cyl(5,41,(x,y,54)),cyl(7,3,(x,y,54)))
    s=s.cut(cyl(1.7,45,(x,y,52)))
    s=s.cut(cyl(2.0,5,(x,y,90)))
    s=s.cut(cyl(2.0,5,(x,y,54)))
    return s.clean()

def camera_front_tower(x):
    s=union(box(11,20,6,x,94,57),box(11,12,74,x,94,97),box(11,34,5,x,105,131.5))
    s=s.cut(cyl(1.7,82,(x,94,52))).cut(cyl(2,5,(x,94,54)))
    s=s.cut(cyl(1.7,8,(x,117,128))).cut(cyl(2,5,(x,117,129)))
    return s.clean()


def camera_side_tower(yaw):
    s=union(box(30,12,6,0,99,57),box(20,8,74,0,99,97))
    for x in (-9,9):s=s.cut(cyl(1.7,8,(x,99,52))).cut(cyl(2,5,(x,99,54)))
    for x in (-5,5):s=s.cut(cyl(1.7,8,(x,99,128))).cut(cyl(2,5,(x,99,129)))
    return radial(s.clean(),yaw)


def camera_mount(label,yaw):
    w,h,z=CONFIG['width'],CONFIG['height'],CONFIG['cameraZ']
    front=(label=='front')
    bw=max(100,w+12) if front else 30
    by=119 if front else 111.5
    depth=27 if front else 33
    s=union(box(bw,depth,4,0,by,136),box(w+8,3,h+8,0,110,z))
    s=s.cut(box(w-8,12,h-8,0,110,z))
    for x in (-CONFIG['holeX']/2,CONFIG['holeX']/2):
        for zz in (z-CONFIG['holeZ']/2,z+CONFIG['holeZ']/2):
            boss=cyl(3.75 if CONFIG['stereo'] else 3,2.5,(x,111.5,zz),(0,1,0))
            s=s.fuse(boss)
            s=s.cut(cyl(1.7 if CONFIG['stereo'] else 1.1,9,(x,107,zz),(0,1,0)))
    # Both boards have edge USB: orient down, not into the back of a closed plate.
    s=s.cut(box(16,20,16,0,110,z-h/2+1))
    points=[(-43,117),(43,117)] if front else[(-5,99),(5,99)]
    s=holes(s,points,1.7,132,10)
    # Removable cable tie anchor holds the downward USB lead below the board.
    ear=box(3,7,14,12,110,128)
    ear=ear.cut(box(6,4,3,12,110,127))
    s=s.fuse(ear)
    return radial(s.clean(),yaw)


def usb_hub_carrier():
    # Official SC1636 housing, no invented enclosure mounting holes.
    s=box(65.4,60.4,3,0,3,65.5)
    s=holes(s,STRUCTURAL_MOUNTS['usbHub'],1.7,62,10)
    for x in (-31,31):
        for y in (-14,20):s=s.cut(box(3.5,15,10,x,y,65))
    for y in (-24.7,30.7):s=s.fuse(box(59.4,2,2,0,y,68))
    return s.clean()


def hub_riser(x,y):
    s=cyl(4,10,(x,y,54)).cut(cyl(1.7,12,(x,y,53)))
    return s.cut(cyl(2,5,(x,y,54))).cut(cyl(2,5,(x,y,59))).clean()


def camera_power_carrier():
    # DFR0849 rotated90deg: USB-A ports and plugs face robot right.
    s=strap_carrier(0,66,46,56,[(-13,72),(13,72)])
    for x in (-21,21):s=s.cut(box(3.5,26,10,x,66,55))
    return s.clean()

def radial_slot(r,t,z,length,width,height):
    # True obround allows controlled travel; unlike a rectangle it has no notch corner.
    return union(box(length-width,width,height,r,t,z+height/2),
                 cyl(width/2,height,(r-(length-width)/2,t,z)),
                 cyl(width/2,height,(r+(length-width)/2,t,z)))


def spring_anchor(r,t,bottom):
    # 1.1mm drill/ream guide takes1.0mmsteelpin;3mmnotch lets1.6mmID springhook engage.
    hook=cyl(4,74.3-bottom,(r,t,bottom))
    hook=hook.cut(cyl(.55,16,(r,t,bottom-1)))
    hook=hook.cut(box(12,3,3,r,t,69.3))
    return hook.clean()


def bumper_carrier(angle):
    # Fixed frame seats on deck; slotted Omron switch attachment is distinct from guides.
    s=box(28,27,5,114,0,56.5)
    for t in (-20,20):
        s=s.fuse(box(25,9,5,115.5,t,56.5))
        s=s.fuse(box(10,14,5,110,t/2,56.5))
        s=s.fuse(cyl(5,10.8,(113.5,t,54)))
        # Independent hard-stop block, with3mm rest gap to moving bumper tabs.
        s=s.fuse(box(3,8,6,127.5,t,61.5))
        s=s.cut(cyl(1.7,16,(113.5,t,52)))
        # Steel-pin spring anchors: load goes through1mm steel rather than a bulky printed hook.
        s=s.fuse(box(31,5,3,122.5,30 if t>0 else -30,58.5))
        s=s.fuse(box(9,16,3,111,23 if t>0 else -23,58.5))
        hook=spring_anchor(134,30 if t>0 else -30,59.5)
        s=s.fuse(hook)
    for t in (-10,10): s=s.cut(cyl(1.7,12,(110,t,52)))
    # Omron D2F-01L mounting-hole pitch6.5mm, M2 clearance2.2mm, +/-2mm setting.
    for t in (-3.25,3.25):s=s.cut(radial_slot(115,t,52,6.2,2.2,10))
    return radial(s.clean(),angle)


def bumper(angle):
    # 3 x80deg segments at R143..146, leaving3 x40deg documented wheel gaps.
    ring=annulus(146,143,62,12)
    wedge=cq.Workplane('XY').moveTo(0,0).lineTo(180*math.cos(math.radians(-40)),180*math.sin(math.radians(-40))).radiusArc((180*math.cos(math.radians(40)),180*math.sin(math.radians(40))),-180).close().extrude(20).translate((0,0,58)).val()
    s=ring.intersect(wedge)
    for t in (-20,20):
        s=s.fuse(box(39,9,4,126.5,t,67.3))
        s=s.cut(radial_slot(115,t,64,8.4,5.4,8))
        # Inward motion3mm brings tab inner face132 to fixed stop face129.
        s=s.fuse(box(3,8,7,133.5,t,61.8))
        s=s.fuse(box(6,16,4,115,25 if t>0 else -25,67.3))
        hook=spring_anchor(113,30 if t>0 else -30,65.3)
        s=s.fuse(hook)
    # Flat central actuator sweepsR124->121 over Omron lever; carrier slots set trip.
    s=s.fuse(box(22,7,5,135,0,65))
    return radial(s.clean(),angle)


def bumper_hardware(angle):
    # Mount hole centreline R115; body bottom113/top120. Lever OP=121.8 nominal.
    body=box(7,12.8,5.8,116.5,0,61.9)
    for t in (-3.25,3.25):body=body.cut(cyl(1,8,(115,t,58)))
    lever=box(.3,12.8,3,123,0,62)
    add(f'bumper-switch-{angle}','Omron D2F-01L lever microswitch',radial(union(body,lever),angle),
        'black','purchased','https://omronfs.omron.com/en_US/ecb/products/pdf/en-d2f.pdf',
        'vendor12.8x5.8mm body/6.5mmmountpitch; leverproxy; adjusttripbeforehardstop',group='bumper-switches',explode=(0,.02,0))
    for t in (-20,20):
        sleeve=cyl(2.5,16,(113.5,t,54)).cut(cyl(1.6,18,(113.5,t,53)))
        add(f'bumper-sleeve-{angle}-{t}','5OD/3.2ID x16mm steel guide sleeve',radial(sleeve,angle),
            'silver','purchased','generic5x3.2x16mmspacer','cut-to-length guide sleeve; final stackheight physically set',group='bumper-guides')
    for t in (-30,30):
        # Envelope only: selected20mm-free spring has21mm rest/24mm pressed pin spacing.
        spring=cyl(1,21,(113,t,69.3),(1,0,0)).cut(cyl(.7,23,(112,t,69.3),(1,0,0)))
        add(f'bumper-spring-{angle}-{t}','MISUMI AUA2-20 extension spring envelope',radial(spring,angle),
            'silver','purchased','https://uk.misumi-ec.com/vona2/detail/110302603670/?HissuCode=AUA2-20','vendorOD2/wire0.2/free20;21rest/24pressed;F0.162/0.258Nnominal;fitforcephysicalpending',group='bumper-return-springs')
        for r in (113,134):
            add(f'bumper-anchor-pin-{angle}-{t}-{r}','1mmsteel spring anchor pin',radial(cyl(.5,10,(r,t,64.5)),angle),
                'silver','purchased','generic1mmspringsteelpin','cut10mmlength;reamprintedbore1.1;retainendswithsmalladhesivedabafterassembly',group='bumper-anchor-pins')

def stop_tower():
    # Two inboard columns carry the switch panel above the translating bumper layer.
    s=box(44,44,4,78,-48,136.8)
    s=s.cut(cyl(11.25,10,(78,-48,134)))
    for x,y in STRUCTURAL_MOUNTS['stop']:
        s=s.fuse(box(8,8,76.8,x,y,92.4))
        s=s.fuse(box(12 if x==54 else 8,abs(y+48)+8,4,x+2 if x==54 else x,(y-48)/2,132.8))
        s=s.cut(cyl(1.7,82,(x,y,52)))
        s=s.cut(cyl(2,5,(x,y,54)))
    return s.clean()


def strap_carrier(cx,cy,width,length,points):
    s=box(width,length,3,cx,cy,55.5)
    # Four strap slots per PCB station rather than unverified mounting holes.
    for y in (cy-length/2+7,cy+length/2-7):
        for x in (cx-width/2+4,cx+width/2-4):s=s.cut(box(3.5,10,10,x,y,55))
    s=holes(s,points,1.7,51,10)
    return s.clean()


def electronics_tray():
    return strap_carrier(-75,-34,35,90,[(-74,-52),(-66,-74)]).translate((0,0,23))


def imu_carrier():
    # Existing centre seam-splice screws retain the IMU-only carrier.
    s=strap_carrier(0,0,36,36,[(-13,0),(13,0)])
    for side in (-1,1):s=s.fuse(box(2,31,2,side*9.5,5,58))
    return s.clean()


def master_panel():
    # Structural rear panel; shell provides an opening rather than retaining the switch.
    s=box(60,3,40,0,-121.5,104)
    s=s.cut(box(37.13,10,21.38,0,-121.5,104))
    for x in (-27,27):
        s=s.fuse(box(8,10,35,x,-101,71.5))
        s=s.fuse(box(8,25,5,x,-111,87))
        s=s.cut(cyl(1.7,40,(x,-101,52)))
        s=s.cut(cyl(2,5,(x,-101,54)))
    return s.clean()

def fit_coupon():
    s=box(62,28,6,0,0,3)
    for x,d in [(-22,3.9),(-12,4.0),(-2,4.1),(8,4.2),(18,4.3)]:
        s=s.cut(cyl(d/2,5,(x,0,1)))
    s=s.fuse(box(62,5,2,0,-11.5,7))
    return s.clean()

def motor_proxy(a):
    src='https://www.pololu.com/product/4866'
    gear=cyl(12.5,23,(79,0,30),(1,0,0))
    motor=cyl(12.2,30.8,(48.2,0,30),(1,0,0))
    encoder=cyl(12.2,14.7,(33.5,0,30),(1,0,0))
    shaft=cyl(2,12.5,(102,0,30),(1,0,0))
    add(f'motor-{a}',f'Pololu 4866 motor {a}deg',radial(union(gear,motor,encoder,shaft),a),'silver','purchased',src,
        'vendor envelope:25Dx68.5mm;4x12.5mm shaft; internal detail simplified',group='motors',explode=(*[v*.0008 for v in (*xy(80,a),)],0))
    hub=cyl(7.5,12,(103,0,30),(1,0,0)).fuse(cyl(14,4,(115,0,30),(1,0,0)))
    hub=hub.cut(cyl(2,18,(102,0,30),(1,0,0)))
    for h in (0,120,240):
        yy,zz=xy(10.5,h)
        hub=hub.cut(cyl(1.6,6,(114,yy,30+zz),(1,0,0)))
    add(f'hub-{a}','Nexus 18018 4mm bore hub',radial(hub,a),'silver','purchased',
        'https://www.nexusrobot.com/product/60mm-double-aluminum-omni-wheel-bearing-rollers.html',
        'vendor envelope and 21mm PCD; set-screw engagement remains physical hold point',group='hubs',explode=(0,0.04,0))
    # Purchased wheel: exact overall diameter/width and hub interface, illustrative rollers.
    core=cyl(23.5,25.6,(119,0,30),(1,0,0)).cut(cyl(6.25,28,(118,0,30),(1,0,0)))
    for h in range(0,360,60):
        yy,zz=xy(10.5,h)
        core=core.cut(cyl(1.6,28,(118,yy,30+zz),(1,0,0)))
    add(f'wheel-core-{a}','Nexus 14145 omni wheel aluminium core',radial(core,a),'silver','purchased',
        'https://www.nexusrobot.com/wp-content/uploads/2016/09/60mm-Aluminum-Double-Omni-Wheel.pdf',
        '60x25.6mm purchased wheel envelope; core/roller geometry illustrative',group='wheels',explode=(0,0.07,0))
    rollers=[]
    # Two rows of small tangential barrels suggest omni-roller architecture.
    for row,xpos in enumerate((125.0,138.6)):
        for h in range(0,360,36):
            q=math.radians(h+row*18)
            v=(0,-math.sin(q),math.cos(q))
            center=(xpos,25*math.cos(q),30+25*math.sin(q))
            start=tuple(center[i]-v[i]*4 for i in range(3))
            rollers.append(cyl(5,8,start,v))
    add(f'wheel-rollers-{a}','Illustrative omni wheel rollers',radial(cq.Compound.makeCompound(rollers),a),'black','purchased',
        'Nexus14145 outer-envelope reference','roller count/shape illustrative; no manufacturing claim',group='wheels',explode=(0,0.07,0))

def camera_electronics():
    for label,yaw in CONFIG['poses']:
        w,h,z=CONFIG['width'],CONFIG['height'],CONFIG['cameraZ']
        pcb=box(w,1.6,h,0,114.8,z)
        for x in (-CONFIG['holeX']/2,CONFIG['holeX']/2):
            for zz in (z-CONFIG['holeZ']/2,z+CONFIG['holeZ']/2):
                pcb=pcb.cut(cyl(CONFIG['holeD']/2,4,(x,113,zz),(0,1,0)))
        name='Waveshare AR0144 Stereo USB Camera(A)' if CONFIG['stereo'] else 'Waveshare OV2735 USB Camera(A)'
        sku='32695' if CONFIG['stereo'] else '33122'
        src='https://www.waveshare.com/ar0144-stereo-usb-camera-a.htm' if CONFIG['stereo'] else 'https://www.waveshare.com/ov2735-2mp-usb-camera-a.htm'
        add(f'camera-{label}-pcb',f'{name} PCB /{label}',radial(pcb,yaw),'green','purchased',src,
            f'vendor SKU{sku};PCB{w}x{h}x1.6;holepitch{CONFIG["holeX"]}x{CONFIG["holeZ"]};exact outline,components simplified',group='cameras',explode=(0,.04,-.025))
        lensx=(-26,26) if CONFIG['stereo'] else(0,)
        length=16.12 if CONFIG['stereo'] else 16
        for n,x in enumerate(lensx):
            lens=cyl(7,length,(x,115.6,z),(0,1,0))
            add(f'camera-{label}-lens-{n}',f'{label} lens barrel',radial(lens,yaw),'black','purchased',src,
                'vendor14mmOD;52mmstereobaseline' if CONFIG['stereo'] else 'vendor14mmOD/16mmprojectionfromPCBfront',group='camera-lenses',explode=(0,.04,-.025))
            add(f'camera-{label}-glass-{n}',f'{label} optical aperture reference',radial(cyl(6,.3,(x,115.3+length,z),(0,1,0)),yaw),'lens','purchased',src,
                'illustrative optical glass within documented lens envelope',group='camera-lenses',explode=(0,.04,-.025))
        rear=3.5 if CONFIG['stereo'] else 4.5
        usb=box(10,rear,8,0,114-rear/2,z-h/2)
        add(f'camera-{label}-usb','Downward USB-C connector reference',radial(usb,yaw),'silver','purchased',src,
            'board-edgeconnector orientedDOWN;30mmdownwardplug/wirezone;housingdetailreference',group='camera-usb',explode=(0,.04,-.025))
    if CONFIG['hub']:
        add('camera-usb-hub','Raspberry PiUSB3Hub SC1636',box(57.4,52.4,18,0,3,76),'charcoal','purchased',
            'https://www.raspberrypi.com/documentation/accessories/usb.html','documented57.4x52.4x18mmhousing;80mmcaptiveupstreamlead;portdetailsreference',group='camera-usb-power')
        add('camera-power-buck','DFRobot DFR0849 camera-only5V supply',box(40,50,25,0,66,70.5),'green','purchased',
            'https://www.dfrobot.com/product-2299.html','vendor50x40mmPCBfootprint;rotated90deg;25mmHEIGHTRESERVATIONnotmeasured;USBportsface+X',group='camera-usb-power')


def purchased_electronics():
    # Pi board holes are documented, component enclosures are simplified envelopes.
    pi=box(85,56,1.6,0,25,107.8)
    pi=holes(pi,[(x,y) for x in (-39,19) for y in (.5,49.5)],1.35,105,8)
    add('pi-pcb','Raspberry Pi 5 PCB',pi,'green','purchased','https://datasheets.raspberrypi.com/rpi5/raspberry-pi-5-mechanical-drawing.pdf',
        'documented85x56PCB and58x49holepattern; components simplified',group='compute',explode=(0,.05,0))
    add('pi-ports','Pi 5 connector envelopes',union(box(18,18,14,34,9,115.6),box(18,15,14,34,29,115.6),box(18,15,14,34,46,115.6)),
        'silver','purchased','Pi5 reference','approximate connector envelopes; verify USB cable bends',group='compute',explode=(0,.05,0))
    cooler=box(34,34,12,-8,28,115)
    add('pi-cooler','Pi 5 active cooler envelope',cooler,'silver','purchased','RaspberryPi activecooler',
        'space reservation only; exact vendor cooler fit pending',group='compute',explode=(0,.065,0))
    add('battery','Gens Ace 3S 2200mAh XT60 LiPo',box(105,34,23,0,-45,69.5),'battery','purchased',
        'https://www.elefun.no/vare-64255/batteri-lipo-3s-2200mah-45c-gens-ace-g-tech-xt60',
        'vendor105x34x23mm; wires/connectors need hand routing',group='power',explode=(0,.03,.035))
    # Straps as separate purchased proxies make battery access unambiguous.
    for i,y in enumerate((-54,-36)):
        st=union(box(112,15,1.5,0,y,82),box(1.5,15,28,-55.5,y,68.8),box(1.5,15,28,55.5,y,68.8))
        add(f'battery-strap-{i}','15mm hook-and-loop battery strap',st,'black','purchased','generic15x250mmstrap',
            'reference strap path; route beneath deck via slots',group='power',explode=(0,.04,.04))
    # Three independently selected Pololu boards, all exact dimensional envelopes.
    for i,y in enumerate((-64,-34,-4)):
        add(f'motor-driver-{i}','Pololu2997 TB9051FTG motor driver',box(25.4,25.4,7.67,-75,y,84.835),
            'green','purchased','https://www.pololu.com/product/2997',
            'vendor25.4x25.4PCB,1.57PCB+6.1components;18mmterminal/wireheightallocation;strapmount',group='motor-drivers',explode=(-.04,.02,0))
    add('microcontroller','Raspberry Pi Pico2 with headers',box(21,51,10,-75,51,63),'green','purchased',
        'https://www.raspberrypi.com/products/raspberry-pi-pico-2/',
        'documented51x21PCB;10mmheaderenvelope; strapcarrier',group='electronics',explode=(-.04,.04,0))
    add('power-regulator','Pololu2866 D24V90F5 5V9A regulator',box(20.3,40.6,7.6,76,12,61.8),'green','purchased',
        'https://www.pololu.com/product/2866','vendor40.6x20.3x7.6mm envelope;5VGPIOheaderfeed,notUSBPD',group='electronics',explode=(.04,.03,0))
    add('imu','Pololu2798 MinIMU-9v5',box(13,23,3,0,5,59.5),'green','purchased',
        'https://www.pololu.com/product/2798','vendor13x23x3mmPCB envelope;bodyaxesmustbecalibrated',group='electronics',explode=(0,.02,0))
    add('motor-disconnect','Pololu2813 high-side power switch',box(20.3,25.4,10,75,64,63),'green','purchased',
        'https://www.pololu.com/product/2813','vendor20.3x25.4PCB;10mmterminal/headerallocation;currentandthermaltestpending',group='electronics',explode=(0,.02,0))
    # Rear rocker physical body/lead envelope and accessible actuator.
    add('main-rocker-body','Carling master power rocker rear envelope',box(36.83,37.57,21.08,0,-104.215,104),'black','purchased',
        'https://www.digikey.com/en/products/detail/carling-technologies/V1D1B60B-CMC00-000/3025047','36.83x21.08cutout;37.57rearspadefamilyenvelope;60mmrearwirezoneallocated',group='power',explode=(0,0,.03))
    add('main-rocker-actuator','Rear main power rocker actuator',box(49.09,14.8,24.38,0,-130.4,104),'black','purchased',
        'CarlingV1D1B60B-CMC00-000','family49.09x24.38face/14.8abovebezel;exactphysicalfitpending',group='power',explode=(0,0,.03))
    camera_electronics()
    # Panel stop cuts motor power; exact switch electrical ratings are a BOM hold point.
    add('stop-body','IDEC YW1B-V4E01R switch rear envelope',union(cyl(15,34.8,(78,-48,97.2)),cyl(11.1,11,(78,-48,132))),'black','purchased',
        'https://eu.idec.com/idec-eu/en_EU/','vendor22.3mm panelcutout/45.8mmrear extent; neck/body shape proxy, add wireclearance',group='power',explode=(0,.03,0))
    add('stop-button','IDEC latching motor stop mushroom',cyl(20,28.6,(78,-48,143)),'red','purchased',
        'https://eu.idec.com/idec-eu/en_EU/','vendor40mmhead and28.6mmabove-panel height; functional circuit testing pending',group='power',explode=(0,.03,0))

def build():
    deck=make_deck()
    for side,exp in [('left',(-.045,0,0)),('right',(.045,0,0))]:
        add(f'deck-{side}',f'6mm chassis deck {side}',halved(deck,side),'charcoal',explode=exp,group=f'deck-{side}')
    for i,y in enumerate((-46,0,72)):
        add(f'splice-{i}','Deck seam splice',make_splice(y),'charcoal',group='deck-splices',explode=(0,-.025,0))
    for a in P['wheel_angles_deg']:
        motor_proxy(a)
        add(f'clamp-upper-{a}','Two-station upper motor cradle',radial(motor_clamp(True),a),'charcoal',
            explode=(0,.025,0),group='motor-clamp-upper',print_rotation=[['y',90]])
        add(f'clamp-lower-{a}','Two-station motor cradle cap',radial(motor_clamp(False),a),'charcoal',
            explode=(0,-.035,0),group='motor-clamp-lower',print_rotation=[['y',90]])
    for side,exp in [('left',(-.07,.025,0)),('right',(.07,.025,0))]:
        add(f'shell-{side}',f'Segmented outer shell {side}',halved(make_shell(),side),'white',explode=exp,group=f'shell-{side}')
        add(f'lid-{side}',f'Vented service lid {side}',halved(make_lid(),side),'white',explode=(exp[0],.10,0),group=f'lid-{side}')
    # Tiny separated teal trim is cosmetic, structurally independent of the shell.
    trim=annulus(126.0,124.9,74,3.0)
    for side in ('left','right'):
        add(f'trim-{side}','Teal shell accent half',halved(trim,side),'teal',group=f'trim-{side}',explode=(0,.015,0),
            notes=['Cosmetic thin part; use PETG or paint shell instead.'])
    add('pi-tray','Raised ventilated Pi mounting tray',tray(),'charcoal',group='compute-mounts',explode=(0,.055,0))
    for i,(x,y) in enumerate([(-47,-8),(47,-8),(-47,58),(47,58)]):
        add(f'pi-riser-{i}','41mm Pi tray riser',tray_riser(x,y),'charcoal',group='pi-risers',explode=(0,.025,0))
    for x in (-43,43):
        add(f'camera-front-tower-{x}','Front camera structural tower',camera_front_tower(x),'charcoal',group='camera-front-towers',explode=(0,.025,0))
    for label,yaw in CONFIG['poses']:
        if label!='front':add(f'camera-side-tower-{label}',f'{label} camera structural tower',camera_side_tower(yaw),'charcoal',group='camera-side-towers',explode=(0,.025,0))
        add(f'camera-mount-{label}',f'{label} camera open-back mounting frame',camera_mount(label,yaw),'white',group='camera-front-mount' if label=='front' else 'camera-side-mounts',explode=(0,.04,-.025))
    for a in (90,210,330):
        add(f'bumper-{a}','3mmtravel contact bumper segment',bumper(a),'teal',group='bumpers',explode=(0,.015,0))
        add(f'bumper-carrier-{a}','Switch/guide/hardstop bumper carrier',bumper_carrier(a),'charcoal',group='bumper-carriers',explode=(0,.005,0))
        bumper_hardware(a)
    add('stop-tower','Emergency-stop support tower',stop_tower(),'charcoal',group='power-mounts',explode=(.025,.025,0))
    add('electronics-tray','Three-motor-driver strap carrier',electronics_tray(),'charcoal',group='driver-carrier',explode=(-.025,.025,0))
    for i,(x,y) in enumerate(STRUCTURAL_MOUNTS['driver']):
        riser=cyl(4,23,(x,y,54)).cut(cyl(1.7,25,(x,y,53)))
        riser=riser.cut(cyl(2,5,(x,y,54))).cut(cyl(2,5,(x,y,72)))
        add(f'driver-riser-{i}','23mm inserted driver-carrier riser',riser,'charcoal',group='driver-risers')
    add('pico-carrier','Pico2 strap carrier',strap_carrier(-75,51,31,61,[(-74,35),(-74,65)]),'charcoal',group='pico-carrier')
    add('pi-power-carrier','5V power regulator strap carrier',strap_carrier(76,12,31,54,[(76,-8),(76,32)]),'charcoal',group='pi-power-carrier')
    add('disconnect-carrier','Motor power switch strap carrier',strap_carrier(75,64,31,39,[(75,55),(75,73)]),'charcoal',group='disconnect-carrier')
    add('imu-carrier','IMU-only carrier',imu_carrier(),'charcoal',group='imu-carrier')
    add('main-switch-panel','Structural rear master-switch panel',master_panel(),'charcoal',group='main-switch-panel')
    if CONFIG['hub']:
        add('usb-hub-carrier','Raised powered-USB-hub strap cradle',usb_hub_carrier(),'charcoal',group='usb-hub-carrier')
        for i,(x,y) in enumerate(STRUCTURAL_MOUNTS['usbHub']):
            add(f'usb-hub-riser-{i}','10mm inserted USB-hub riser',hub_riser(x,y),'charcoal',group='usb-hub-risers')
        add('camera-power-carrier','Dedicated camera5V supply strap cradle',camera_power_carrier(),'charcoal',group='camera-power-carrier')
    purchased_electronics()

def export(out):
    out.mkdir(parents=True,exist_ok=True)
    stldir=out/'stl';stldir.mkdir(exist_ok=True)
    scene=trimesh.Scene()
    assembly=cq.Assembly(name='Kiwi_K1_prototype')
    manifest=[]; issues=[]; stl_by_group={};valid_count=0
    bake=np.array([[.001,0,0,0],[0,0,.001,0],[0,-.001,0,0],[0,0,0,1]])
    for p in PARTS:
        s=p['shape']; bb=exact_bb(s)
        solids=s.Solids()
        valid=s.isValid() and all(x.Volume()>0 for x in solids) and len(solids)>0
        if not valid: issues.append(p['id']+' has invalid or non-positive solid')
        if p['kind']=='printed' and len(solids)!=1:issues.append(p['id']+' printed part has '+str(len(solids))+' disconnected solids')
        else: valid_count+=1
        assembly.add(s,name=p['id'],color=cq.Color(*p['color']))
        verts,faces=s.tessellate(0.18,0.18)
        mesh=trimesh.Trimesh(vertices=[v.toTuple() for v in verts],faces=faces,process=False)
        mesh.visual.vertex_colors=np.array([round(v*255) for v in p['color']],dtype=np.uint8)
        mesh.apply_transform(bake)
        scene.add_geometry(mesh,node_name=p['id'],geom_name=p['id'])
        item={k:v for k,v in p.items() if k not in ('shape','color','printRotation')}
        item['meshNames']=[p['id']]
        item['quantity']=1
        item['color']=list(p['color'])
        item['boundingBoxMm']={'min':[bb.xmin,bb.ymin,bb.zmin],'max':[bb.xmax,bb.ymax,bb.zmax],
                               'size':[bb.xlen,bb.ylen,bb.zlen]}
        item['volumeMm3']=round(sum(q.Volume() for q in solids),3)
        item['solidCount']=len(solids); item['validSolid']=valid
        if p['printable']:
            # Representative per group, but radial parts require inverse z rotation first.
            if p['group'] in stl_by_group:
                item['stl']=stl_by_group[p['group']]
            else:
                ps=s
                if p['id'].startswith(('clamp-','bumper-')):
                    a=int(p['id'].split('-')[-1]);ps=ps.rotate((0,0,0),(0,0,1),-a)
                for ax,a in p['printRotation']:
                    axis={'x':(1,0,0),'y':(0,1,0),'z':(0,0,1)}[ax]
                    ps=ps.rotate((0,0,0),axis,a)
                pb=exact_bb(ps)
                ps=ps.translate((-pb.xmin,-pb.ymin,-pb.zmin))
                filename='stl/'+p['id']+'.stl'
                cq.exporters.export(ps,str(out/filename),tolerance=.12,angularTolerance=.15)
                stl_by_group[p['group']]=filename
                item['stl']=filename
                item['printBoundingBoxMm']=[round(pb.xlen,3),round(pb.ylen,3),round(pb.zlen,3)]
                # A 256mm bed allows 2mm margins only where total dimension <=252mm.
                item['fits256mmBed']=pb.xlen<=252.05 and pb.ylen<=252.05
                if not item['fits256mmBed']: issues.append(p['id']+' exceeds252mm usable bed')
        manifest.append(item)
    print('Exporting STEP assembly',flush=True)
    assembly.save(str(out/'assembly.step'))
    print('Exporting GLB',flush=True)
    scene.export(out/'assembly.glb')
    # Separate small fit coupons: heat-set bores and actual clamping station.
    cq.exporters.export(fit_coupon(),str(stldir/'insert-fit-coupon.stl'),tolerance=.08)
    cap=motor_clamp(False).intersect(box(14,60,40,95,0,25))
    upper=motor_clamp(True).intersect(box(14,60,40,95,0,35))
    coupon=cq.Compound.makeCompound([cap.translate((-95,-34,-13.5)),upper.translate((-95,34,-30))])
    pb=exact_bb(coupon);coupon=coupon.translate((-pb.xmin,-pb.ymin,-pb.zmin))
    cq.exporters.export(coupon,str(stldir/'motor-clamp-fit-coupon.stl'),tolerance=.08)
    contacts=[]
    for a in P['wheel_angles_deg']:
        x,y=xy(P['wheel_center_radius'],a)
        contacts.append({'wheelAngleDeg':a,'pointMm':[round(x,3),round(y,3),0.0]})
    # Explicit analytic clearances are stronger than pretending envelopes are vendor CAD.
    clearances=[
        {'pair':'wheel swept top / shell underside','nominalMm':3.0,'basis':'wheel maxz60; shell wall starts63'},
        {'pair':'gearcase / clamp bore (diametral)','nominalMm':.6,'basis':'25mm vendor case,25.6mm bore'},
        {'pair':'motor can / rear clamp bore (diametral)','nominalMm':.6,'basis':'24.4mm vendor can,25mm bore'},
        {'pair':'motor face / hub barrel','nominalMm':1.0,'basis':'radial face102; hub begins103'},
        {'pair':'battery / locating pocket width','nominalMm':2.0,'basis':'36mm clearpocket vs34mm pack'},
        {'pair':'Pi cooler / lid lower face','nominalMm':18.4,'basis':'cooler top121mm; lid bottom139.4mm'},
        {'pair':'left / right deck and shell seam','nominalMm':.5,'basis':'parametric splitgap'},
    ]
    critical_pairs=[]
    # Small set of meaningful shape collision tests, excluding fastening/mating surfaces.
    index={p['id']:p['shape'] for p in PARTS}
    selected_pairs=[('battery','pi-tray'),('battery','deck-left'),('battery','deck-right'),
        ('pi-cooler','lid-left'),('pi-cooler','lid-right'),('battery','stop-tower'),('battery','electronics-tray'),
        ('stop-body','stop-tower'),('stop-tower','lid-right'),('splice-0','clamp-upper-270'),('splice-1','clamp-upper-270'),
        ('main-rocker-body','main-switch-panel'),('main-rocker-body','battery'),('motor-driver-0','battery'),
        ('imu','pi-tray'),('power-regulator','stop-tower'),('microcontroller','shell-left')]
    for label,yaw in CONFIG['poses']:
        selected_pairs.extend([(f'camera-{label}-pcb',f'camera-mount-{label}'),
                               (f'camera-{label}-usb',f'camera-mount-{label}'),
                               (f'camera-mount-{label}','lid-left'),(f'camera-mount-{label}','lid-right')])
    if CONFIG['hub']:
        selected_pairs.extend([('camera-usb-hub','imu'),('camera-usb-hub','pi-tray'),('camera-usb-hub','battery'),('usb-hub-carrier','battery'),
                               ('camera-power-buck','pi-tray'),('camera-power-buck','usb-hub-carrier'),
                               ('camera-power-buck','camera-front-tower--43'),('camera-power-buck','camera-front-tower-43')])
    for i,j in selected_pairs:
        v=index[i].intersect(index[j]).Volume()
        critical_pairs.append({'parts':[i,j],'intersectionMm3':round(v,5),'passed':v<.01})
        if v>=.01: issues.append(f'Unintended collision {i}/{j}: {v:.2f}mm3')
    mount_checks=[]
    deck_union=index['deck-left'].fuse(index['deck-right'])
    for group,points in STRUCTURAL_MOUNTS.items():
        for x,y in points:
            v=deck_union.intersect(cyl(1.6,6,(x,y,48))).Volume()
            mount_checks.append({'group':group,'pointMm':[x,y],'shaftPathIntersectionMm3':round(v,5),'passed':v<.01})
            if v>=.01:issues.append('Blocked chassis fastener path '+group+str((x,y)))
    # Exhaustive static printed-part pair check, with exact-box rejection first.
    printed_pairs=[]
    printed=[p for p in PARTS if p['kind']=='printed']
    printed_boxes={p['id']:exact_bb(p['shape']) for p in printed}
    for i,left in enumerate(printed):
        for right in printed[i+1:]:
            a,b=printed_boxes[left['id']],printed_boxes[right['id']]
            overlap=[min(a.xmax,b.xmax)-max(a.xmin,b.xmin),
                     min(a.ymax,b.ymax)-max(a.ymin,b.ymin),
                     min(a.zmax,b.zmax)-max(a.zmin,b.zmin)]
            if min(overlap)<.001:continue
            common=left['shape'].intersect(right['shape']);v=common.Volume()
            printed_pairs.append({'parts':[left['id'],right['id']],'intersectionMm3':round(v,5),'passed':v<.02,'intersectionBoundsMm':([exact_bb(common).xmin,exact_bb(common).ymin,exact_bb(common).zmin,exact_bb(common).xmax,exact_bb(common).ymax,exact_bb(common).zmax] if v>.02 else None)})
            if v>=.02:issues.append('Printed collision '+left['id']+'/'+right['id']+f':{v:.3f}mm3')
    extra=CONFIG['hub'];stereo=CONFIG['stereo']
    fasteners=[
        dict(id='hardware_m3x45',item='M3x45 socket cap screw',quantity=12,use='four through-bolts per two-station motor cradle'),
        dict(id='hardware_m3_nut',item='M3 nut',quantity=12,use='motor cradle lower hex traps'),
        dict(id='hardware_m3x12',item='M3x12 socket cap screw',quantity=(2 if extra else 4)+(4 if stereo else 0),use='outerdecksplices;threecamera frontsplice usesM3x14;stereo adds4camera screws'),
        dict(id='hardware_m3x10',item='M3x10 socket cap screw',quantity=50 if extra else 38,use='34commoninstalled+4spares;threecamera adds8sidecamera+4hubriser bottom'),
        dict(id='hardware_m3x8',item='M3x8 socket cap screw',quantity=4 if extra else 0,use='USBhubcarrier top;shorter to avoid opposed screw collision'),
        dict(id='hardware_m3x16',item='M3x16 socket cap screw',quantity=8,use='6bumpercarrier+2spares'),
        dict(id='hardware_m3x14',item='M3x14 socket cap screw',quantity=12 if extra else 10,use='2Pico+2PiPower+2disconnect+2IMU/splice+2spares;threecamera adds2DFR/frontsplice'),
        dict(id='hardware_inserts',item='ruthexRX-M3Sx4.0SHORT OD4.6/L4.0 nominal4.0bore',quantity=56 if extra else 40,use='40common;threecamera adds8sidetower+8hubriser'),
        dict(id='hardware_nyloc',item='M3 nut/nyloc',quantity=24 if stereo else 20,use='12carrier/power+6bumperguides+2spares;stereo adds4camera nuts'),
        dict(id='hardware_washers',item='M3 washer',quantity=58 if extra else 42,use='printed joints, guides and spare allowance;check washer clearance at each interface'),
        dict(id='hardware_m3x25',item='M3x25 screw',quantity=6,use='bumper guide sleeves and retaining washers'),
        dict(id='hardware_m2x20',item='M2x20 screw and nut',quantity=6,use='Omron switches throughbody+carrier+deckslots'),
        dict(id='hardware_camera_m2x10',item='M2x10 screw and nut',quantity=0 if stereo else 12 if extra else 4,use='four exact21x21mm mountingholes perOV2735'),
        dict(id='bumper_sleeves',item='5OD/3.2ID x16mm steel sleeve',quantity=6,use='bumper guide spacers'),
        dict(id='bumper_springs',item='MISUMI AUA2-20 extension spring',quantity=6,use='21mmrest/24mmpressed,0.162/0.258N nominal'),
        dict(id='spring_pins',item='1mmdiameter x10mmsteelpin',quantity=12,use='springanchorload through1.1mmbore'),
        dict(id='hardware_pi_m25',item='M2.5x8 screw',quantity=4,use='Pi mounting;pilot fitcoupon required'),
        dict(id='hardware_wheel_screws',item='M3x10 countersunk screw',quantity=9,use='hub/wheelweb stack conditionalphysicalfit'),
        dict(id='hardware_wheel_nuts',item='M3lowprofile nut',quantity=9,use='hub/wheelweb stack conditionalphysicalfit'),
        dict(id='hardware_set_screws',item='M3 set screw',quantity=3,use='Nexus supplied hubshaftretention'),
        dict(id='battery_straps',item='15x250mm hook-and-loop strap',quantity=2,use='battery retention'),
        dict(id='hardware_ties',item='2.5mm cable tie',quantity=32 if extra else 20,use='USB/power/electronics harness and strapcradles'),
        dict(id='camera_foam',item='1mm insulating foam/pad sheet',quantity=1,use='strap-mounted electronics protection;cut-to-fit'),
    ]
    fasteners=[f for f in fasteners if f['quantity']>0]
    report={'status':'PASS' if not issues else 'FAIL','issues':issues,'validPartInstances':valid_count,
            'partInstances':len(PARTS),'printedInstances':sum(p['kind']=='printed' for p in PARTS),
            'uniquePrintableStls':len(stl_by_group)+2,'contactPoints':contacts,
            'contactPlaneZMm':0,'analyticClearances':clearances,'criticalPairChecks':critical_pairs,'printedPairChecks':printed_pairs,'printedPairCandidates':len(printed)*(len(printed)-1)//2,'structuralMountChecks':mount_checks,
            'notValidated':['bumper switch actuation and return spring force','camera-only obstacle/drop-edge detection and stopping','physicalprint/fit','vendor exact electronics mounting','hub set-screw retention/load',
                            'screw-length physical stack','collision of all cable/bend envelopes','roller traction',
                            'tip/stability with moving loads','thermal performance','camera calibration, USB current, bandwidth and cable clearances',
                            'electrical safety and emergency stop function'],
            'intentionalMating':['clamp upper/lower sharez30splitplane','cradle/underside deck sharez48',
                                'seam splice/underside deck sharez48','shellflange/post sharez61',
                                'Pi PCB/standoff sharez107','battery/rails supportz58',
                                'cameraPCB/standoff sharey114','camera frame/tower sharez134']}
    result={'schemaVersion':1,'name':'Kiwi K1 — '+CONFIG['label'],'variant':VARIANT,'cameraConfiguration':{k:v for k,v in CONFIG.items()},'units':'mm',
            'coordinateSystem':{'cadUp':'+z','cadForward':'+y','glbUp':'+y','glbForward':'-z',
                                'glbUnits':'meters','explodeUnits':'meters','explodeCoordinates':'GLB'},
            'assembly':{'heightMm':max(171.6,CONFIG['cameraZ']+(CONFIG['height']+8)/2),'radialEnvelopeDiameterMm':292.0,'drivetrainRadialEnvelopeDiameterMm':P['radial_envelope_diameter'],
                        'chassisDiameterMm':252,'wheelDiameterMm':60,'wheelAxialWidthMm':25.6,
                        'groundClearanceMm':13.5,'targetTotalMassKg':2.0,'bumperCoverageDeg':240,'bumperWheelGapDeg':120,'bumperTravelMm':3.0,'physicalValidation':'pending'},
            'parameters':P,'structuralMountPatternsMm':STRUCTURAL_MOUNTS,'activeDistanceSensors':0,'sourceSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'parts':manifest,'fasteners':fasteners,'checks':report,
            'qualification':'Prototype CAD only. Export validity and listed clearances do not establish printability, assembly, device, or physical safety.'}
    (out/'manifest.json').write_text(json.dumps(result,indent=2))
    (out/'checks.json').write_text(json.dumps(report,indent=2))
    (out/'assembly-fasteners.json').write_text(json.dumps({'variant':VARIANT,'items':fasteners},indent=2))
    draw_svg(out)
    print(json.dumps({'status':report['status'],'issues':issues,'parts':len(PARTS),'stls':len(stl_by_group)+2,
                      'stepBytes':(out/'assembly.step').stat().st_size,'glbBytes':(out/'assembly.glb').stat().st_size},indent=2),flush=True)
    if issues: raise SystemExit(2)

def draw_svg(out):
    # Dimensioned schematic drawings generated from the same parameters, not exports
    # claiming complete GD&T. CAD STEP remains the full geometry authority.
    style='''<style>text{font-family:Arial,sans-serif;fill:#25343b} .line{fill:none;stroke:#25343b;stroke-width:1.4}.thin{fill:none;stroke:#829298;stroke-width:.7}.dim{fill:none;stroke:#178078;stroke-width:1}.label{font-size:11px}.small{font-size:9px}.num{fill:#178078;stroke:none} .white{fill:#eeeae0;stroke:#25343b;stroke-width:1.2}.dark{fill:#34434b;stroke:#25343b;stroke-width:1}</style>'''
    def circle(cx,cy,r,cl='line'):return f'<circle cx="{cx}" cy="{cy}" r="{r}" class="{cl}"/>'
    def line(x1,y1,x2,y2,cl='line'):return f'<path d="M{x1},{y1}L{x2},{y2}" class="{cl}"/>'
    def text(x,y,s,cl='label'):return f'<text x="{x}" y="{y}" class="{cl}">{s}</text>'
    def dim(x1,y1,x2,y2,s):
        return line(x1,y1,x2,y2,'dim')+line(x1-3,y1-3,x1+3,y1+3,'dim')+line(x2-3,y2-3,x2+3,y2+3,'dim')+text((x1+x2)/2+5,(y1+y2)/2-5,s,'small')
    def num(x,y,n):return circle(x,y,8,'num')+f'<text x="{x}" y="{y+3}" text-anchor="middle" fill="white" style="fill:white;font-size:10px">{n}</text>'
    svg=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 780 580">',style,
         '<rect width="780" height="580" fill="#faf9f5"/>',text(30,32,'KIWI K1 · '+CONFIG['label']+' / mm'),text(30,50,'Prototype engineering layout · source parameters drive all dimensions','small')]
    cx,cy=240,270
    svg+=[circle(cx,cy,126,'white'),line(cx,cy-126,cx,cy+126,'thin'),line(cx-146,cy,cx+146,cy,'thin')]
    for a in P['wheel_angles_deg']:
        x,y=xy(P['wheel_center_radius'],a)
        # SVG rotation is inverted because model y points up in the drawing.
        svg.append(f'<g transform="translate({cx+x},{cy-y}) rotate({-a})"><rect x="-12.8" y="-30" width="25.6" height="60" rx="5" class="dark"/></g>')
    svg.append(f'<rect x="{cx-52.5}" y="{cy+28}" width="105" height="34" class="dark"/>')
    svg.append(f'<rect x="{cx-42.5}" y="{cy-53}" width="85" height="56" fill="#78a98b" stroke="#25343b"/>')
    for label,yaw in CONFIG['poses']:
        svg.append(f'<g transform="translate({cx},{cy}) rotate({-yaw})"><rect x="{-CONFIG["width"]/2}" y="-132" width="{CONFIG["width"]}" height="22" class="dark"/></g>')
    svg+=[dim(cx-126,cy+164,cx+126,cy+164,'252 chassis'),dim(cx+170,cy-144.6,cx+170,cy+144.6,'292 bumper envelope'),
          num(cx-75,cy-70,1),num(cx+114,cy-70,2),num(cx,cy+47,3),num(cx,cy-25,4),num(cx,cy-145,5),num(cx+76,cy+60,6)]
    legend=['1 Split PETG chassis / cosmetic shell','2 60 × 25.6 omniwheel, 3 stations @120°','3 3S LiPo105 ×34 ×23, two straps','4 Pi5 85 ×56; hole pattern58 ×49','5 '+('AR0144 synced stereo66x30,52mm baseline' if CONFIG['stereo'] else str(len(CONFIG['poses']))+' OV2735 USB camera(s),25x25'),'6 IDEC latching stop /22.5 panel aperture']
    for i,l in enumerate(legend):svg.append(text(475,130+i*26,l,'small'))
    svg += [text(475,330,'REFERENCE / HOLD POINTS','label'),text(475,350,'Motor25D×68.5; shaft4×12.5','small'),text(475,368,'Hub16long / shaftengagement11.5','small'),text(475,386,'Wheel/hub mating physically unverified','small'),text(475,404,'3mm wheel-to-shell nominal clearance','small'),text(475,422,'0.5mm split seam; M3 clearholes3.4','small'),text(30,550,'K1 REV A · Not a manufacturing qualification · All fasteners and cable bends must be trial assembled.','small'),'</svg>']
    (out/'top-plan.svg').write_text(''.join(svg))
    svg=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 780 480">',style,'<rect width="780" height="480" fill="#faf9f5"/>',text(30,32,'KIWI K1 · SIDE SECTION / mm'),text(30,50,'Forward is right; camera fixed above lid; no powered gimbal','small')]
    ox,oy=270,350
    maxheight=max(171.6,CONFIG['cameraZ']+(CONFIG['height']+8)/2)
    def rect(x,y,w,h,cl='white'):return f'<rect x="{ox+x}" y="{oy-y-h}" width="{w}" height="{h}" class="{cl}"/>'
    svg += [line(70,oy,490,oy,'thin'),rect(-126,63,252,76),rect(-126,48,252,6,'dark'),rect(-125.4,139.4,250.8,3.6),rect(-62,58,34,23,'dark'),rect(-13,95,76,4,'dark'),rect(-3,107,56,1.6,'dark'),rect(110.5,CONFIG['cameraZ']-CONFIG['height']/2,22,CONFIG['height'],'dark'),circle(ox-66,oy-30,30,'dark'),circle(ox+66,oy-30,30,'dark'),dim(ox+170,oy,ox+170,oy-maxheight,str(maxheight)+' maximum'),dim(ox-150,oy-48,ox-150,oy-54,'6deck'),dim(ox-170,oy,ox-170,oy-13.5,'13.5 cradle clearance'),num(ox-45,oy-70,3),num(ox+30,oy-115,4),num(ox+120,oy-180,5)]
    for i,l in enumerate(['Motor/wheel axle z30; wheelgroundz0','Deck z48–54; shell z63–139','Pi board bottom107; cooler top121','Lid z139.4–143; stop top171.6','Camera plate top'+str(CONFIG['cameraZ']+(CONFIG['height']+8)/2),'Cameras + encoders + IMU + contact bumpers']):svg.append(text(510,130+i*25,l,'small'))
    svg += [text(30,435,'Section is a dimensioned layout schematic. Open STEP for full named part geometry.','small'),text(30,454,'Contact geometry, stiffness, thermal behavior and printed fastener stacks require physical validation.','small'),'</svg>']
    (out/'side-section.svg').write_text(''.join(svg))

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--variant',choices=list(VARIANTS),default='front-camera');ap.add_argument('--output',type=Path)
    args=ap.parse_args();configure(args.variant);build();export(args.output or Path('public/hardware/kiwi/cad')/args.variant)
