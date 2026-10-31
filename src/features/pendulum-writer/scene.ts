import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Solution } from './model'

/** A schematic apparatus. Lengths are compressed for display; the solver uses metres. */
export function createScene(host: HTMLElement, getSolution: ()=>Solution, getTime: ()=>number, getLiftPen: ()=>boolean) {
  const scene=new THREE.Scene()
  scene.background=new THREE.Color('#131d20')
  const camera=new THREE.PerspectiveCamera(38,1,.05,30)
  camera.position.set(3.8,3.6,4.3)
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false})
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2))
  renderer.shadowMap.enabled=true
  renderer.shadowMap.type=THREE.PCFShadowMap
  renderer.outputColorSpace=THREE.SRGBColorSpace
  host.appendChild(renderer.domElement)
  renderer.domElement.setAttribute('aria-label','Suspended wooden cross with two perpendicular banks of pendulums. Drag to orbit the apparatus.')
  renderer.domElement.setAttribute('role','img')
  const controls=new OrbitControls(camera,renderer.domElement)
  controls.target.set(0,.85,0)
  controls.enableDamping=true;controls.enablePan=true
  controls.minDistance=3.2;controls.maxDistance=10
  controls.maxPolarAngle=Math.PI*.48
  scene.add(new THREE.HemisphereLight('#f7efe1','#334b51',2.6))
  const light=new THREE.DirectionalLight('#ffedce',3.2)
  light.position.set(-3,6,2);light.castShadow=true
  light.shadow.mapSize.set(1024,1024);light.shadow.camera.left=-3;light.shadow.camera.right=3
  light.shadow.camera.top=3;light.shadow.camera.bottom=-3
  scene.add(light)
  const rim=new THREE.DirectionalLight('#9dd9dc',1.5);rim.position.set(3,3,-3);scene.add(rim)
  const materials: THREE.Material[]=[],geometries: THREE.BufferGeometry[]=[]
  const material=(color:string,metalness=0,roughness=.6)=>{const m=new THREE.MeshStandardMaterial({color,metalness,roughness});materials.push(m);return m}
  const wood=material('#aa7045'),edge=material('#694631'),paper=material('#f3eedf'),metal=material('#c7b88e',.7,.3)
  const cyan=material('#74c5bd',.55,.28),orange=material('#d99055',.55,.28),ink=material('#394841'),wire=material('#899795',.5,.5)
  const box=(w:number,h:number,d:number,m:THREE.Material)=>{const g=new THREE.BoxGeometry(w,h,d);geometries.push(g);const mesh=new THREE.Mesh(g,m);mesh.castShadow=true;mesh.receiveShadow=true;return mesh}
  const floor=box(4,.1,3.2,edge);floor.position.y=-.06;scene.add(floor)
  const page=box(2.8,.01,1.8,paper);page.position.set(0,.005,0);scene.add(page)
  const frame=new THREE.Group();scene.add(frame)
  const armX=box(2.25,.11,.16,wood),armZ=box(.16,.11,2.25,wood)
  armX.position.y=armZ.position.y=1.55;frame.add(armX,armZ)
  const railX=box(.075,.055,2,wood),railZ=box(2,.055,.075,wood)
  railX.position.set(.35,1.55,0);railZ.position.set(0,1.55,-.35);frame.add(railX,railZ)
  for(const sign of [-1,1]) {
    const braceX=box(.35,.055,.07,metal),braceZ=box(.07,.055,.35,metal)
    braceX.position.set(.175,1.55,sign*.88);braceZ.position.set(sign*.88,1.55,-.175);frame.add(braceX,braceZ)
  }
  const collar=box(.23,.16,.23,metal);collar.position.y=1.55;frame.add(collar)
  const pen=box(.033,1.48,.033,wood);pen.position.y=.79;frame.add(pen)
  const nibG=new THREE.ConeGeometry(.025,.1,8);geometries.push(nibG)
  const nib=new THREE.Mesh(nibG,ink);nib.rotation.z=Math.PI;nib.position.y=.04;frame.add(nib)
  const cylinder=new THREE.CylinderGeometry(1,1,1,8);geometries.push(cylinder)
  function rod(parent:THREE.Object3D,m:THREE.Material,radius:number) {
    const mesh=new THREE.Mesh(cylinder,m);mesh.scale.set(radius,1,radius);parent.add(mesh);return mesh
  }
  const up=new THREE.Vector3(0,1,0),direction=new THREE.Vector3()
  function placeRod(mesh:THREE.Mesh,a:THREE.Vector3,b:THREE.Vector3,radius:number) {
    direction.copy(b).sub(a);mesh.position.copy(a).add(b).multiplyScalar(.5)
    mesh.quaternion.setFromUnitVectors(up,direction.clone().normalize());mesh.scale.set(radius,direction.length(),radius)
  }
  const suspensions=Array.from({length:4},()=>rod(scene,wire,.005))
  const suspensionAnchors=[[-.96,0],[.96,0],[0,-.96],[0,.96]]
  const ceiling=box(2.45,.045,2.45,edge);ceiling.position.y=2.65;scene.add(ceiling)
  const bobGeometry=new THREE.SphereGeometry(.032,12,8);geometries.push(bobGeometry)
  let lastSolution: Solution|undefined
  const pendulums: {axis:0|1; index:number; anchor:THREE.Vector3; string:THREE.Mesh; bob:THREE.Mesh}[]=[]
  let trail: THREE.LineSegments|undefined
  let trailGeometry: THREE.BufferGeometry|undefined
  let trailAll:THREE.Float32BufferAttribute|undefined,trailInk:THREE.Float32BufferAttribute|undefined,lastLift:boolean|undefined
  const trailMaterial=new THREE.LineBasicMaterial({color:'#394841'});materials.push(trailMaterial)
  const viewGain=(s:Solution)=>.75/Math.max(...s.target.flatMap(p=>[Math.abs(p[0]-s.origin[0])*2*s.scale,Math.abs(p[1]-s.origin[1])*2*s.scale]),.000001)
  function rebuild(s:Solution) {
    pendulums.forEach(p=>{frame.remove(p.string,p.bob)});pendulums.length=0
    for(let axis=0;axis<2;axis++) for(let i=0;i<s.settings.count;i++) {
      // Separate, offset banks: neighbours swing in parallel planes, never along their row.
      const along=-.92+i/Math.max(1,s.settings.count-1)*1.84
      const anchor=axis===0?new THREE.Vector3(.35,1.54,along):new THREE.Vector3(along,1.54,-.35)
      const string=rod(frame,wire,.003)
      const bob=new THREE.Mesh(bobGeometry,axis===0?cyan:orange);bob.castShadow=true;frame.add(bob)
      pendulums.push({axis:axis as 0|1,index:i,anchor,string,bob})
    }
    if(trail){scene.remove(trail);trailGeometry?.dispose()}
    const gain=viewGain(s)
    const vertices:number[]=[],inkVertices:number[]=[]
    for(let i=1;i<s.trace.length;i++) {
      const a=s.trace[i-1],b=s.trace[i],draw=s.penMask[i-1]&&s.penMask[i]
      vertices.push(a[0]*gain,.017,a[1]*gain,b[0]*gain,.017,b[1]*gain)
      inkVertices.push(a[0]*gain,.017,a[1]*gain,(draw?b[0]:a[0])*gain,.017,(draw?b[1]:a[1])*gain)
    }
    trailAll=new THREE.Float32BufferAttribute(vertices,3);trailInk=new THREE.Float32BufferAttribute(inkVertices,3)
    trailGeometry=new THREE.BufferGeometry();trailGeometry.setAttribute('position',getLiftPen()?trailInk:trailAll);lastLift=getLiftPen()
    trail=new THREE.LineSegments(trailGeometry,trailMaterial);scene.add(trail)
  }
  const a=new THREE.Vector3(),b=new THREE.Vector3()
  let request=0,visible=true
  function render() {
    request=requestAnimationFrame(render)
    if(!visible)return
    const s=getSolution(),time=getTime(),motion=s.at(time)
    if(s!==lastSolution){rebuild(s);lastSolution=s}
    const gain=viewGain(s),inReturn=!s.penMask[Math.min(s.penMask.length-1,Math.floor(time/s.settings.duration*s.penMask.length))]
    frame.position.set(motion.frame[0]*gain,inReturn&&getLiftPen()?.08:0,motion.frame[1]*gain)
    for(let i=0;i<4;i++) {
      const [x,z]=suspensionAnchors[i]
      a.set(x,2.64,z);b.set(x+frame.position.x,1.59+frame.position.y,z+frame.position.z)
      placeRod(suspensions[i],a,b,.005)
    }
    pendulums.forEach(p=>{
      const trueLength=s.system.lengths[p.index]
      const displayLength=.20+.80*Math.sqrt(trueLength/s.system.lengths[0])
      const angle=s.settings.kind==='coupled'?motion.relative[p.index][p.axis]/trueLength:motion.relative[p.index][p.axis]*12
      a.copy(p.anchor);b.copy(a)
      // Rendering keeps vertical separation between the two banks at the crossing.
      const stagger=p.axis===0?0:.14
      b.y-=displayLength*Math.cos(angle)+stagger
      if(p.axis===0)b.x+=displayLength*Math.sin(angle);else b.z+=displayLength*Math.sin(angle)
      p.bob.position.copy(b);placeRod(p.string,a,b,.003)
    })
    if(lastLift!==getLiftPen()&&trailInk&&trailAll){trailGeometry?.setAttribute('position',getLiftPen()?trailInk:trailAll);lastLift=getLiftPen()}
    const drawn=Math.floor(time/s.settings.duration*s.trace.length)*2
    trailGeometry?.setDrawRange(0,Math.max(0,drawn))
    controls.update();renderer.render(scene,camera)
  }
  const resize=new ResizeObserver(()=>{
    const w=host.clientWidth,h=host.clientHeight
    if(w&&h){renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix()}
  });resize.observe(host)
  const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting});observer.observe(host)
  render()
  return ()=>{
    cancelAnimationFrame(request);resize.disconnect();observer.disconnect();controls.dispose();trailGeometry?.dispose()
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();renderer.domElement.remove()
  }
}
