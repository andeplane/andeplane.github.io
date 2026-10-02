import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RotateCcw, ZoomIn, ZoomOut, Move, Sprout } from 'lucide-react';
import type { GameState, Layer, Species } from './simulation';
import { conditions } from './simulation';
import type { RootWorld, Point } from './rootWorld';
interface SceneAPI { update: (s:GameState,layer:Layer)=>void; updateWorld:(w:RootWorld)=>void; reset:()=>void; zoom:(n:number)=>void }
const seeded = (seed:number) => () => { seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
const v=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z);
function tube(points:THREE.Vector3[],radius:number,material:THREE.Material,segments=18) {
  const curve=new THREE.CatmullRomCurve3(points);
  return new THREE.Mesh(new THREE.TubeGeometry(curve,segments,radius,5,false),material);
}
function leafGeometry(length:number,width:number) {
  const positions:number[]=[],uvs:number[]=[],indices:number[]=[]; const rows=20,cols=8;
  for(let i=0;i<=rows;i++)for(let j=0;j<=cols;j++) {
    const t=i/rows,u=j/cols*2-1;
    const taper=Math.pow(Math.sin(Math.PI*t),.75);
    const serration=1+.07*Math.sin(t*Math.PI*18);
    positions.push(u*width*taper*serration,t*length,.12*Math.sin(t*Math.PI)-.12*u*u*taper-.14*t*t);
    uvs.push(j/cols,t);
  }
  for(let i=0;i<rows;i++)for(let j=0;j<cols;j++) {const k=i*(cols+1)+j;indices.push(k,k+1,k+cols+1,k+1,k+cols+2,k+cols+1);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
function makeLeaf(length:number,width:number,mat:THREE.Material,vein:THREE.Material) {
  const group=new THREE.Group();const mesh=new THREE.Mesh(leafGeometry(length,width),mat);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  group.add(tube([v(0,0,.008),v(0,length*.4,.12),v(0,length*.75,.02),v(0,length,-.13)],.008,vein));
  for(let i=1;i<6;i++) {const t=i/7;const wing=width*Math.pow(Math.sin(Math.PI*t),.75)*.85;
    for(const side of [-1,1])group.add(tube([v(0,t*length,.12*Math.sin(t*Math.PI)-.14*t*t+.007),v(wing*side*.6,(t+.07)*length,.01),v(wing*side,(t+.1)*length,-.04)],.0035,vein,7));}
  return group;
}
function soilTexture() {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const ctx=canvas.getContext('2d')!;const rand=seeded(48);
  const gradient=ctx.createLinearGradient(0,0,0,512);gradient.addColorStop(0,'#644635');gradient.addColorStop(.23,'#71513c');gradient.addColorStop(.5,'#997451');gradient.addColorStop(1,'#b49c73');ctx.fillStyle=gradient;ctx.fillRect(0,0,512,512);
  for(let i=0;i<9000;i++){const x=rand()*512,y=rand()*512;ctx.fillStyle=rand()>.55?'rgba(35,22,15,.14)':'rgba(237,203,151,.16)';ctx.beginPath();ctx.ellipse(x,y,rand()*2.8+.3,rand()*1.3+.3,rand()*3,0,Math.PI*2);ctx.fill();}
  for(let i=0;i<24;i++){const y=rand()*512;ctx.strokeStyle='rgba(220,175,120,.07)';ctx.lineWidth=rand()*3;ctx.beginPath();ctx.moveTo(0,y);ctx.bezierCurveTo(150,y-30,350,y+40,512,y+8);ctx.stroke();}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
function buildPlant(species:Species,leaves:THREE.Object3D[],leafMats:THREE.MeshPhysicalMaterial[]) {
  const group=new THREE.Group(); const stem=new THREE.MeshStandardMaterial({color:'#558249',roughness:.8});const vein=new THREE.MeshStandardMaterial({color:'#abc47a',roughness:.8});
  const rand=seeded(22);
  if(species==='tomato') {
    group.add(tube([v(0,0,0),v(-.07,1.2,.02),v(.07,2.5,0),v(.02,3.3,0)],.045,stem,32));
    for(let node=0;node<7;node++) {
      const y=.45+node*.39,angle=node*2.399; const dir=v(Math.cos(angle),.24,Math.sin(angle));const length=node>4?.64:.84;
      const end=dir.clone().multiplyScalar(length);const start=v(.03*Math.sin(node),y,0);
      group.add(tube([start,start.clone().add(dir.clone().multiplyScalar(length*.45)),start.clone().add(end)],.016,stem));
      const branch=new THREE.Group();branch.position.copy(start.clone().add(end));
      const mat=new THREE.MeshPhysicalMaterial({color:new THREE.Color().setHSL(.26+rand()*.035,.48,.28+rand()*.1),roughness:.65,side:THREE.DoubleSide,metalness:0,transmission:0,thickness:.05,clearcoat:.12});leafMats.push(mat);
      const leaf=makeLeaf(.81-node*.035,.255-node*.011,mat,vein);leaf.quaternion.setFromUnitVectors(v(0,1,0),dir.clone().normalize());branch.add(leaf);
      for(let k=0;k<2;k++) {const sideLeaf=makeLeaf(.53-node*.023,.19-node*.008,mat,vein);sideLeaf.position.copy(dir.clone().multiplyScalar(-.15));const sideDir=v(Math.cos(angle+(k?-.95:.95)),.25,Math.sin(angle+(k?-.95:.95))).normalize();sideLeaf.quaternion.setFromUnitVectors(v(0,1,0),sideDir);branch.add(sideLeaf);}
      group.add(branch);leaves.push(branch);
    }
    for(let n=0;n<3;n++) {const mat=new THREE.MeshPhysicalMaterial({color:'#76a250',roughness:.6,side:THREE.DoubleSide,transmission:0,thickness:.05});leafMats.push(mat);const leaf=makeLeaf(.4,.13,mat,vein);leaf.position.set(.02,3.13,0);leaf.rotation.set(.4,n*2.1,.3);group.add(leaf);leaves.push(leaf);}
  }else if(species==='cactus') {
    const nodes=[{p:v(0,.75,0),s:v(.63,.9,.23),a:0},{p:v(-.53,1.95,0),s:v(.52,.78,.2),a:.35},{p:v(.65,1.78,.02),s:v(.49,.74,.2),a:-.45},{p:v(-.58,2.98,0),s:v(.33,.48,.17),a:.12}];
    nodes.forEach((node,i)=>{const pad=new THREE.Group();pad.position.copy(node.p);pad.rotation.z=node.a;
      const mat=new THREE.MeshPhysicalMaterial({color:i===3?'#8ab569':'#4c855c',roughness:.8,clearcoat:.1});leafMats.push(mat);const body=new THREE.Mesh(new THREE.SphereGeometry(1,32,24),mat);body.scale.copy(node.s);body.castShadow=true;body.receiveShadow=true;pad.add(body);
      for(let j=0;j<38;j++){const a=rand()*Math.PI*2,r=Math.sqrt(rand())*.85;const x=Math.cos(a)*r*node.s.x,y=Math.sin(a)*r*node.s.y;const z=Math.sqrt(1-r*r)*node.s.z;const dot=new THREE.Mesh(new THREE.SphereGeometry(.018,5,5),vein);dot.position.set(x,y,z);pad.add(dot);
        for(let n=0;n<2;n++)pad.add(tube([v(x,y,z),v(x+(rand()-.5)*.09,y+.045,z+.055)],.003,new THREE.MeshStandardMaterial({color:'#e5d6a1'}),2));}
      group.add(pad);leaves.push(pad);});
  }else {
    for(let i=0;i<9;i++){const angle=i*2.399, length=.65+rand()*.6;const tip=v(Math.cos(angle)*length,.22+rand()*.4,Math.sin(angle)*length);const mat=new THREE.MeshPhysicalMaterial({color:'#7ea754',roughness:.65,side:THREE.DoubleSide,transmission:0,thickness:.06});leafMats.push(mat);
      const petiole=makeLeaf(length,.16,mat,vein);petiole.quaternion.setFromUnitVectors(v(0,1,0),tip.clone().normalize());group.add(petiole);
      const trap=new THREE.Group();trap.position.copy(tip);trap.rotation.y=-angle+Math.PI/2;trap.rotation.x=-.15;
      for(const side of [-1,1]) {const jaw=new THREE.Group();jaw.rotation.y=side*.55;const shape=new THREE.Shape();shape.moveTo(0,-.26);shape.bezierCurveTo(side*.5,-.25,side*.5,.34,0,.33);shape.lineTo(0,-.26);
        const green=new THREE.Mesh(new THREE.ShapeGeometry(shape,20),mat);green.castShadow=true;jaw.add(green);
        const inner=new THREE.Mesh(new THREE.ShapeGeometry(shape,20),new THREE.MeshStandardMaterial({color:'#b66a60',side:THREE.DoubleSide,roughness:.9}));inner.scale.set(.78,.79,1);inner.position.set(side*.035,.01,.007);jaw.add(inner);
        for(let j=0;j<9;j++){const t=j/8*Math.PI;const x=side*Math.sin(t)*.375,y=-.25+ j/8*.57;jaw.add(tube([v(x,y,0),v(x+side*.09,y+.045,.04)],.009,vein,3));}trap.add(jaw);}
      group.add(trap);leaves.push(trap);
    }
    group.scale.setScalar(1.6);
  }
  return group;
}
export function PlantScene({state,layer,world,onWorldClick,tool,tutorialMarker=null}:{state:GameState;layer:Layer;world:RootWorld;onWorldClick:(point:Point)=>void;tool:string;tutorialMarker?:{point:Point;label:string}|null}) {
  const mount=useRef<HTMLDivElement>(null),beacon=useRef<HTMLButtonElement>(null);const api=useRef<SceneAPI|null>(null);const live=useRef({state,layer,world,onWorldClick,tool,tutorialMarker});live.current={state,layer,world,onWorldClick,tool,tutorialMarker};const [error,setError]=useState(false);
  useEffect(()=>{if(!mount.current)return;const container=mount.current;let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});}catch{setError(true);return;}
    setError(false);renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.82;container.appendChild(renderer.domElement);
    const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(36,1,.1,80);const defaultPosition=v(3.8,3,14.8);camera.position.copy(defaultPosition);
    const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,.65,0);controls.enableDamping=true;controls.enablePan=false;controls.minDistance=9;controls.maxDistance=21;controls.minPolarAngle=1;controls.maxPolarAngle=1.7;controls.minAzimuthAngle=-.5;controls.maxAzimuthAngle=.65;controls.mouseButtons={LEFT:null as unknown as THREE.MOUSE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.ROTATE};controls.touches={ONE:null as unknown as THREE.TOUCH,TWO:THREE.TOUCH.DOLLY_ROTATE};
    const pmrem=new THREE.PMREMGenerator(renderer);const room=new RoomEnvironment();const env=pmrem.fromScene(room,.04);scene.environment=env.texture;scene.environmentIntensity=.22;room.dispose();pmrem.dispose();
    const ambient=new THREE.HemisphereLight('#fff3dc','#344532',.55);scene.add(ambient);
    const sunlight=new THREE.DirectionalLight('#ffe2a5',2.4);sunlight.position.set(-3,7,4);sunlight.castShadow=true;sunlight.shadow.mapSize.set(2048,2048);sunlight.shadow.camera.left=-5;sunlight.shadow.camera.right=5;sunlight.shadow.camera.top=5;sunlight.shadow.camera.bottom=-5;sunlight.shadow.normalBias=.025;sunlight.shadow.bias=-.0002;sunlight.shadow.radius=4;scene.add(sunlight);
    const rim=new THREE.DirectionalLight('#eaffc4',1.2);rim.position.set(3,4,-4);scene.add(rim);
    const fill=new THREE.PointLight('#ffbd7d',4.5,15);fill.position.set(-3,1,3);scene.add(fill);
    const assembly=new THREE.Group();assembly.rotation.y=.28;scene.add(assembly);
    const clay=new THREE.MeshStandardMaterial({color:'#c78b6c',roughness:.95});const clayEdge=new THREE.MeshStandardMaterial({color:'#dfac89',roughness:.9});
    const soilMap=soilTexture();const soilMat=new THREE.MeshStandardMaterial({map:soilMap,roughness:1});
    const pot=new THREE.Mesh(new THREE.CylinderGeometry(4.25,4.02,2.65,80,1,true,Math.PI/2,Math.PI),clay);pot.position.y=-1.325;pot.castShadow=true;pot.receiveShadow=true;assembly.add(pot);
    const soil=new THREE.Mesh(new THREE.CylinderGeometry(4.17,3.94,2.55,80,1,false,Math.PI/2,Math.PI),soilMat);soil.position.y=-1.325;soil.receiveShadow=true;assembly.add(soil);
    const cutShape=new THREE.Shape();cutShape.moveTo(-4.17,-.05);cutShape.lineTo(4.17,-.05);cutShape.lineTo(3.94,-2.6);cutShape.lineTo(-3.94,-2.6);cutShape.closePath();
    const faceG=new THREE.ShapeGeometry(cutShape);const pos=faceG.attributes.position;const uv=faceG.attributes.uv;for(let i=0;i<pos.count;i++)uv.setXY(i,(pos.getX(i)+4.2)/8.4,(pos.getY(i)+2.65)/2.65);uv.needsUpdate=true;
    const face=new THREE.Mesh(faceG,soilMat);face.position.z=.012;face.receiveShadow=true;assembly.add(face);
    const rimPoints=[];for(let i=0;i<=64;i++){const a=Math.PI/2+i/64*Math.PI;rimPoints.push(v(Math.sin(a)*4.21,0,Math.cos(a)*4.21));}assembly.add(tube(rimPoints,.075,clayEdge,64));
    for(const side of [-1,1])assembly.add(tube([v(side*4.21,0,0),v(side*4.02,-2.65,0)],.045,clayEdge));
    const base=new THREE.Mesh(new THREE.CylinderGeometry(4.1,4.14,.12,80),new THREE.MeshStandardMaterial({color:'#d2a37e',roughness:.8}));base.position.y=-2.73;base.castShadow=true;base.receiveShadow=true;assembly.add(base);
    const roots=new THREE.Group();roots.position.z=.043;assembly.add(roots);const rootMat=new THREE.MeshStandardMaterial({color:'#e8d1a0',roughness:.75,emissive:'#ac7335',emissiveIntensity:.1});
    const rand=seeded(72);const rootCurves:THREE.CatmullRomCurve3[]=[];
    roots.add(tube([v(0,0,0),v(-.08,-.45,0),v(.06,-.85,0),v(-.08,-1.15,0)],.026,rootMat));
    roots.scale.setScalar(.65);
    for(let i=0;i<5;i++){const side=i%2?1:-1,start=-.12-i*.052;const endX=side*(.3+rand()*.85),endY=Math.max(-1.17,start-.25-rand()*.43);
      const p=[v(.02,start,0),v(endX*.4,start-.12,0),v(endX*.85,endY+.1,0),v(endX,endY,0)];rootCurves.push(new THREE.CatmullRomCurve3(p));roots.add(tube(p,.012*(1-i/24),rootMat));
      for(let j=0;j<2;j++){const t=.25+j*.22;const anchor=rootCurves[i].getPoint(t);roots.add(tube([anchor,anchor.clone().add(v(side*.08,-.08,.001)),anchor.clone().add(v(side*(.12+rand()*.13),-.13-rand()*.07,0))],.0045,rootMat,8));}
    }
    const shadeRig=new THREE.Group();assembly.add(shadeRig);const rigMaterial=new THREE.MeshStandardMaterial({color:'#7e8462',roughness:.8});
    for(const x of [-2,2])shadeRig.add(tube([v(x,0,-1.3),v(x,4.3,-1.3)],.018,rigMaterial,2));
    const cloth=new THREE.Mesh(new THREE.PlaneGeometry(4.5,2.3),new THREE.MeshStandardMaterial({color:'#536b4a',side:THREE.DoubleSide,transparent:true,opacity:.25,roughness:1}));cloth.rotation.x=-Math.PI/2;cloth.position.set(0,4.25,-.45);shadeRig.add(cloth);shadeRig.visible=false;
    const lampRig=new THREE.Group();lampRig.position.set(-3.1,0,-.6);assembly.add(lampRig);lampRig.add(tube([v(0,0,0),v(0,3.5,0),v(.7,3.8,0)],.027,rigMaterial,8));
    const lampShade=new THREE.Mesh(new THREE.ConeGeometry(.3,.35,24,1,true),new THREE.MeshStandardMaterial({color:'#d7b17a',side:THREE.DoubleSide,roughness:.5}));lampShade.position.set(.7,3.67,0);lampRig.add(lampShade);
    const growLight=new THREE.SpotLight('#ffdda0',0,12,Math.PI/4,.6);growLight.position.set(-2.4,3.6,-.6);growLight.target.position.set(0,1,0);assembly.add(growLight,growLight.target);lampRig.visible=false;
    const fanRig=new THREE.Group();fanRig.position.set(3.5,1.3,0);assembly.add(fanRig);fanRig.add(tube([v(0,-1.3,0),v(0,-.1,0)],.03,rigMaterial,2));const fanRing=new THREE.Mesh(new THREE.TorusGeometry(.3,.02,8,32),rigMaterial);fanRig.add(fanRing);const fanBlades=new THREE.Group();fanRig.add(fanBlades);for(let i=0;i<3;i++){const blade=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),rigMaterial);blade.scale.set(.06,.2,.01);blade.position.y=.09;const holder=new THREE.Group();holder.rotation.z=i*Math.PI*2/3;holder.add(blade);fanBlades.add(holder);}fanRig.visible=false;
    const leafNodes:THREE.Object3D[]=[],leafMats:THREE.MeshPhysicalMaterial[]=[];const plant=buildPlant(state.species,leafNodes,leafMats);plant.position.z=-.08;assembly.add(plant);
    const pebbleMat=new THREE.MeshStandardMaterial({color:'#958264',roughness:1});for(let i=0;i<25;i++){const a=Math.PI/2+rand()*Math.PI,r=Math.sqrt(rand())*3.95;const stone=new THREE.Mesh(new THREE.DodecahedronGeometry(.028+rand()*.055,0),pebbleMat);stone.position.set(Math.sin(a)*r,-.025,Math.cos(a)*r);stone.scale.y=.45;stone.rotation.set(rand(),rand(),rand());stone.castShadow=true;assembly.add(stone);}
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({color:'#586841',opacity:.16}));floor.rotation.x=-Math.PI/2;floor.position.y=-2.87;floor.receiveShadow=true;scene.add(floor);
    const ring=new THREE.Mesh(new THREE.RingGeometry(4.7,4.715,96),new THREE.MeshBasicMaterial({color:'#9caa87',transparent:true,opacity:.18,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=-2.85;scene.add(ring);
    // Subtle airborne pollen; process layers reuse particles to expose water and carbon movement.
    const particles:THREE.Mesh[]=[];const particleG=new THREE.SphereGeometry(.018,6,5);const particleMat=new THREE.MeshBasicMaterial({color:'#f3da88',transparent:true,opacity:.42});
    for(let i=0;i<32;i++){const p=new THREE.Mesh(particleG,particleMat);scene.add(p);particles.push(p);}
    const rootNetwork=new THREE.Group();rootNetwork.position.z=.083;assembly.add(rootNetwork);
    const depositGroup=new THREE.Group();depositGroup.position.z=.045;assembly.add(depositGroup);
    const rockMat=new THREE.MeshStandardMaterial({color:'#766e60',roughness:.95});
    live.current.world.rocks.forEach(r=>{const stone=new THREE.Mesh(new THREE.DodecahedronGeometry(r.radius,1),rockMat);stone.position.set(r.x,r.y,.075);stone.scale.z=.25;stone.rotation.z=r.x;stone.castShadow=true;assembly.add(stone);});
    const depositMeshes:THREE.Mesh[]=[], depositRings:THREE.Mesh[]=[];
    live.current.world.deposits.forEach(d=>{const color=d.kind==='water'?'#7bc1d5':'#e1ba64';const patch=new THREE.Mesh(new THREE.CircleGeometry(d.radius,32),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.30,depthWrite:false}));patch.position.set(d.x,d.y,0);depositGroup.add(patch);depositMeshes.push(patch);
      const ring=new THREE.Mesh(new THREE.RingGeometry(d.radius*.98,d.radius*1.01,48),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.32,depthWrite:false}));ring.position.copy(patch.position);ring.position.z=.002;depositGroup.add(ring);depositRings.push(ring);
      const labelCanvas=document.createElement('canvas');labelCanvas.width=128;labelCanvas.height=64;const labelCtx=labelCanvas.getContext('2d')!;labelCtx.font='500 28px sans-serif';labelCtx.textAlign='center';labelCtx.fillStyle=d.kind==='water'?'#d0f0f4':'#f9dfa6';labelCtx.fillText(d.kind==='water'?'H₂O':'N',64,41);const labelMap=new THREE.CanvasTexture(labelCanvas);const label=new THREE.Sprite(new THREE.SpriteMaterial({map:labelMap,transparent:true,opacity:.85,depthTest:false}));label.position.set(d.x,d.y,.15);label.scale.set(.40,.20,1);depositGroup.add(label);
    });
    const tipMesh=new THREE.Mesh(new THREE.SphereGeometry(.046,12,8),new THREE.MeshBasicMaterial({color:'#e0f2b9'}));assembly.add(tipMesh);
    const tipHalo=new THREE.Mesh(new THREE.RingGeometry(.07,.08,32),new THREE.MeshBasicMaterial({color:'#ecf5c6',transparent:true,opacity:.65,depthWrite:false}));assembly.add(tipHalo);
    const targetMarker=new THREE.Mesh(new THREE.RingGeometry(.065,.075,32),new THREE.MeshBasicMaterial({color:'#eff5c7',transparent:true,opacity:.65,depthWrite:false}));assembly.add(targetMarker);
    const feedback=new THREE.Mesh(new THREE.RingGeometry(.04,.08,40),new THREE.MeshBasicMaterial({color:'#a4d7e0',transparent:true,opacity:0,depthWrite:false}));assembly.add(feedback);let feedbackTime=-10;
    const rootLineMaterial=new THREE.LineBasicMaterial({color:'#f3deb1',transparent:true,opacity:.9});const activeRootMaterial=new THREE.LineBasicMaterial({color:'#fbefc2'});const rootLines:THREE.Line[]=[];let previousLengths:string='';
    const updateWorld=(w:RootWorld)=>{const lengths=w.active+':'+w.paths.map(p=>p.length).join(',');if(lengths!==previousLengths){rootLines.forEach(l=>{rootNetwork.remove(l);l.geometry.dispose();});rootLines.length=0;w.paths.forEach((path,i)=>{const g=new THREE.BufferGeometry().setFromPoints(path.map(p=>v(p.x,p.y,0)));const line=new THREE.Line(g,i===w.active?activeRootMaterial:rootLineMaterial);rootNetwork.add(line);rootLines.push(line);});previousLengths=lengths;}
      const tip=w.paths[w.active].at(-1)!;tipMesh.position.set(tip.x,tip.y,.097);tipHalo.position.set(tip.x,tip.y,.10);
      targetMarker.visible=!!w.target;if(w.target)targetMarker.position.set(w.target.x,w.target.y,.11);
      w.deposits.forEach((d,i)=>{depositMeshes[i].scale.setScalar(.5+.5*Math.sqrt(d.amount/d.initial));(depositMeshes[i].material as THREE.MeshBasicMaterial).opacity=d.amount>0?(d.connected?.68:.55):.035;(depositRings[i].material as THREE.MeshBasicMaterial).opacity=d.connected?.75:.45;});
    };updateWorld(live.current.world);
    const raycaster=new THREE.Raycaster();let down: {x:number;y:number}|null=null;
    const onDown=(e:PointerEvent)=>{if(e.button===0)down={x:e.clientX,y:e.clientY};};
    const onClick=(e:PointerEvent)=>{if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>8)return;down=null;const rect=renderer.domElement.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);
      assembly.updateMatrixWorld();const plantTool=live.current.tool==='prune'||(live.current.tool==='feed'&&live.current.state.species==='flytrap');const hit=(plantTool?raycaster.intersectObject(plant,true)[0]:undefined)||raycaster.intersectObject(face)[0];if(hit){const local=assembly.worldToLocal(hit.point.clone());live.current.onWorldClick({x:local.x,y:local.y});feedback.position.set(local.x,local.y,.14);feedbackTime=clock.getElapsedTime();}
    };
    renderer.domElement.addEventListener('pointerdown',onDown);renderer.domElement.addEventListener('pointerup',onClick);
    // Physical greenhouse backdrop, visible beyond the floating research bed.
    const backdrop=new THREE.Group();scene.add(backdrop);const frameMat=new THREE.MeshStandardMaterial({color:'#8ca27b',roughness:.85,transparent:true,opacity:.24});
    for(const x of [-8,-4,0,4,8]) {const beam=new THREE.Mesh(new THREE.BoxGeometry(.06,15,.08),frameMat);beam.position.set(x,3,-7);backdrop.add(beam);}
    for(const y of [-1,3,7]) {const beam=new THREE.Mesh(new THREE.BoxGeometry(24,.06,.08),frameMat);beam.position.set(0,y,-7);backdrop.add(beam);}
    const glass=new THREE.Mesh(new THREE.PlaneGeometry(30,18),new THREE.MeshBasicMaterial({color:'#d7e0c1',transparent:true,opacity:.3,depthWrite:false}));glass.position.set(0,4,-7.1);backdrop.add(glass);
    const rearPlantMat=new THREE.MeshStandardMaterial({color:'#56744e',roughness:1});
    for(let n=0;n<7;n++){const fern=new THREE.Group();fern.position.set(-7+n*2.3,-2.9,-5);for(let i=0;i<5;i++){const leaf=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),rearPlantMat);leaf.scale.set(.12,.8,.13);leaf.position.set(Math.sin(i*2.4)*.25,.55+i*.12,Math.cos(i*2.4)*.25);leaf.rotation.z=Math.sin(i*2.4)*.6;fern.add(leaf);}backdrop.add(fern);}
    const table=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:'#b7c5a7',roughness:1}));table.rotation.x=-Math.PI/2;table.position.y=-2.89;table.receiveShadow=true;scene.add(table);
    scene.fog=new THREE.Fog('#dce5c8',16,38);
    let current=live.current.state, currentLayer=live.current.layer, frame=0;const clock=new THREE.Clock();
    const update=(s:GameState,l:Layer)=>{current=s;currentLayer=l;const c=conditions(s);const growth=Math.pow(s.biomass/3.5,.32);plant.scale.setScalar(growth);roots.scale.x=Math.min(.8,growth*.65);roots.scale.y=Math.min(.8,growth*.65);
      shadeRig.visible=s.shade>0;lampRig.visible=s.equipment.includes('lamp');growLight.intensity=s.lamp&&s.energy>0?6:0;fanRig.visible=s.equipment.includes('fan');
      const night=c.daylight<.01;container.style.background=night?'radial-gradient(ellipse at 65% 10%,#a2b4b9,#708b8a 50%,#5f7b68)':'radial-gradient(ellipse at 65% 10%,#f3e7ae,#c5d5ac 50%,#829d78)';scene.fog?.color.set(night?'#849fa5':'#dce5c8');sunlight.intensity=night?.6:(1.25+Math.min(1,c.ppfd/820)*1.5);sunlight.color.set(night?'#b7cddd':'#ffe1a3');ambient.intensity=night?.32:.6;fill.intensity=night?2:4.5;
      leafMats.forEach((m,i)=>{const h=s.health<60?.13:.265+(i%3)*.008;const light=.16+(i%4)*.025; m.color.setHSL(h,.52,light);if(l==='carbon')m.emissive.set('#7c7830');else m.emissive.set('#000000');m.emissiveIntensity=l==='carbon'?.12:0;});
      rootMat.color.set(l==='water'?'#7db8be':'#ead2a2');rootMat.emissive.set(l==='water'?'#4d9bba':'#ac7335');rootMat.emissiveIntensity=l==='water'?.45:.08;
      soilMat.color.setHSL(.08,.05, .93-s.moisture*.18);
    };update(current,currentLayer);
    api.current={update,updateWorld,reset:()=>{camera.position.copy(defaultPosition);controls.target.set(0,.65,0);controls.update();},zoom:(n)=>{camera.position.sub(controls.target).multiplyScalar(n).add(controls.target);controls.update();}};
    const resize=()=>{const w=container.clientWidth,h=container.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(18))/Math.min(1,camera.aspect)));camera.updateProjectionMatrix();};const observer=new ResizeObserver(resize);observer.observe(container);resize();
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let running=true,lastPaint=0;const render=()=>{if(!running)return;frame=requestAnimationFrame(render);const now=performance.now();if(now-lastPaint<1000/40)return;lastPaint=now;const t=clock.getElapsedTime();const c=conditions(current);
      fanBlades.rotation.z=t*current.ventilation*18;tipHalo.scale.setScalar(1+Math.sin(t*4)*.15);targetMarker.rotation.z=t*.4;feedback.scale.setScalar(1+Math.max(0,t-feedbackTime)*3);(feedback.material as THREE.MeshBasicMaterial).opacity=Math.max(0,.6-(t-feedbackTime)*.8);
      leafNodes.forEach((l,i)=>{if(current.species==='tomato')l.rotation.z=(reduced?0:Math.sin(t*(.7+current.ventilation)+i)*(.013+current.ventilation*.025))+(1-current.health/100)*.5*(i%2?1:-1);});
      particles.forEach((p,i)=>{if(currentLayer==='water') {const point=rootCurves[i%rootCurves.length].getPoint(1-(t*.15+i*.071)%1);p.position.copy(point).applyMatrix4(assembly.matrixWorld);p.visible=c.waterAccess>.1;}else if(currentLayer==='carbon'){p.position.set(Math.sin(i*2.4)*.7, .6+(t*.18+i*.12)%2.8, Math.cos(i*2.4)*.4);p.visible=c.photo>.005;}else{p.position.set(Math.sin(i*7.1+t*.03)*2.2,.05+(t*.035+i*.11)%3.8,Math.cos(i*1.4)*1.8);p.visible=i<15&&!reduced;}});
      if(reduced&&currentLayer!=='natural')particles.forEach(p=>p.visible=false);controls.update();renderer.render(scene,camera);
      const marker=live.current.tutorialMarker;if(marker&&beacon.current){const projected=assembly.localToWorld(v(marker.point.x,marker.point.y,.12)).project(camera);beacon.current.style.left=`${(projected.x+1)*.5*container.clientWidth}px`;beacon.current.style.top=`${(1-projected.y)*.5*container.clientHeight}px`;beacon.current.style.visibility='visible';}
    };render();
    return()=>{running=false;cancelAnimationFrame(frame);observer.disconnect();renderer.domElement.removeEventListener('pointerdown',onDown);renderer.domElement.removeEventListener('pointerup',onClick);controls.dispose();api.current=null;scene.traverse(o=>{if(o instanceof THREE.Line){o.geometry.dispose();const materials=Array.isArray(o.material)?o.material:[o.material];materials.forEach(m=>m.dispose());}if(o instanceof THREE.Sprite){o.material.map?.dispose();o.material.dispose();}if(o instanceof THREE.Mesh){o.geometry.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m.dispose());}});soilMap.dispose();env.dispose();renderer.dispose();container.removeChild(renderer.domElement);};
  },[state.species]);
  useEffect(()=>{api.current?.update(state,layer);},[state,layer]);
  useEffect(()=>{api.current?.updateWorld(world);},[world]);
  return <div className={`scene scene-${state.species} tool-${tool}`}>
    <div className="scene-halo"/><div ref={mount} className="scene-canvas" aria-label={`Interactive ${state.species} habitat. Click soil to guide roots or apply the selected tool. WASD grows roots. Right drag or two fingers to orbit.`}/>
    {tutorialMarker&&<button ref={beacon} className="tutorial-beacon" data-resource={tutorialMarker.label.toLowerCase().includes('water')?'water':tutorialMarker.label.toLowerCase().includes('nitrogen')?'nitrogen':'route'} style={{visibility:'hidden'}} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onWorldClick(tutorialMarker.point);}}><span aria-hidden="true">◎</span>{tutorialMarker.label}</button>}
    {error&&<div className="scene-error"><Sprout size={48}/><p>WebGL is unavailable in this browser.</p><span>Enable hardware acceleration to enter the habitat.</span></div>}
  </div>;
}
