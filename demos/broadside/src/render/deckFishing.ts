import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { Fishing } from '../game/fishing';
import type { DeckWalk } from '../game/deckWalk';
import type { ShipView } from './shipView';
import { sampleWaves } from '../sim/waves';
import { RewardChest } from './chest';

/** A real rod, hanging line, wave-riding float and a catch hauled onto this moving deck. */
export class DeckFishing {
  private root: TransformNode;
  private rod: Mesh;
  private float: Mesh;
  private line: LinesMesh;
  private fish: TransformNode;
  private chest: RewardChest | null = null;
  private water = Vector3.Zero();
  private landing = Vector3.Zero();
  private tip = Vector3.Zero();
  private sign = 1;
  constructor(private scene:Scene) {
    this.root=new TransformNode('fishing tackle aboard',scene);
    const mat=(name:string,hex:string)=>{const m=new StandardMaterial(name,scene);m.diffuseColor=Color3.FromHexString(hex);m.specularColor=Color3.FromHexString('#e2e9da');m.specularPower=70;return m;};
    this.rod=MeshBuilder.CreateTube('flexible wooden fishing rod',{path:[Vector3.Zero(),new Vector3(1,.6,.6),new Vector3(2,1,1.4)],radius:.025,tessellation:8},scene);
    this.rod.material=mat('polished fishing rod','#755236');this.rod.parent=this.root;
    this.float=MeshBuilder.CreateSphere('red cork float',{diameter:.3,segments:12},scene);
    this.float.material=mat('bright cork float','#b94d32');
    this.line=MeshBuilder.CreateLines('fine fishing line',{points:Array.from({length:17},()=>Vector3.Zero()),updatable:true},scene);
    this.line.color=Color3.FromHexString('#e6dbba');
    this.fish=new TransformNode('freshly caught silver mackerel',scene);this.fish.parent=this.root;
    const silver=mat('wet blue silver fish','#609ca7'), fin=mat('translucent blue fins','#34717b');
    const body=MeshBuilder.CreateSphere('silver fish body',{diameter:1,segments:20},scene);body.scaling.set(.22,.3,1.2);body.parent=this.fish;body.material=silver;
    const tail=MeshBuilder.CreateCylinder('fish forked tail',{diameter:.65,height:.05,tessellation:3},scene);tail.parent=this.fish;tail.position.z=-.69;tail.rotation.x=Math.PI/2;tail.material=fin;
    for(const x of [-.1,.1]){const eye=MeshBuilder.CreateSphere('shiny fish eye',{diameter:.055,segments:8},scene);eye.parent=this.fish;eye.position.set(x,.08,.5);eye.material=mat('fish eyes','#101b20');}
    this.hide();
  }
  begin(view:ShipView,deck:DeckWalk):void {
    this.root.parent=view.root;
    const w=deck.walker;this.sign=Math.sign(w.x)||1;
    this.root.position.set(w.x-this.sign*.18,w.eyeY-.85,w.z+.4);
    this.root.scaling.x=this.sign;
    this.tip.set(w.x+this.sign*1.82,w.eyeY+.15,w.z+1.8);
    this.landing.set(w.x-this.sign*.65,w.feet+.15,w.z+1.25);
    view.root.computeWorldMatrix(true);
    this.water=Vector3.TransformCoordinates(new Vector3(this.sign*(deck.geometry.beam*.5+8),0,w.z+2.5),view.root.getWorldMatrix());
  }
  update(f:Fishing,view:ShipView,time:number,reduced:boolean):void {
    if(f.phase==='idle'){this.hide();return;}
    this.root.setEnabled(true);this.root.computeWorldMatrix(true);
    this.rod.setEnabled(f.phase!=='caught');this.line.setEnabled(f.phase!=='caught');
    this.float.setEnabled(f.phase==='casting'||f.phase==='waiting'||f.phase==='bite');
    this.water.y=sampleWaves(this.water.x,this.water.z,time).height+.08;
    if(f.phase==='bite')this.water.y-=.16+Math.sin(time*14)*.08;
    const tip=Vector3.TransformCoordinates(this.tip,view.root.getWorldMatrix());
    const target=f.phase==='casting'?Vector3.Lerp(tip,this.water,Math.min(1,f.time/.9)):this.water;
    this.float.position.copyFrom(target);
    const points=Array.from({length:17},(_,i)=>{
      const t=i/16,p=Vector3.Lerp(tip,target,t);p.y-=Math.sin(t*Math.PI)*.3;return p;
    });
    MeshBuilder.CreateLines('fine fishing line',{points,instance:this.line});
    const hasCatch=f.phase==='reeling'||f.phase==='caught';
    this.fish.setEnabled(hasCatch&&f.catch?.kind==='fish');
    if(!hasCatch){this.chest?.hide();return;}
    const end=Vector3.TransformCoordinates(this.landing,view.root.getWorldMatrix());
    const t=f.phase==='caught'?1:Math.min(1,f.time/1.8),p=Vector3.Lerp(this.water,end,t);
    p.y+=Math.sin(t*Math.PI)*1.5;
    const local=Vector3.TransformCoordinates(p,view.root.getWorldMatrix().clone().invert());
    if(f.catch?.kind==='chest') {
      this.chest??=new RewardChest(this.scene);this.chest.root.parent=view.root;
      this.chest.animate(f.phase==='caught'?f.time+1:0,0,reduced);
      this.chest.root.scaling.setAll(.4);this.chest.root.position.copyFrom(local);
    } else {
      const fishLocal=Vector3.TransformCoordinates(p,this.root.getWorldMatrix().clone().invert());
      this.fish.position.copyFrom(fishLocal);
      this.fish.rotation.set(0,Math.PI/2,reduced?0:Math.sin(time*12)*.12);
    }
  }
  hide():void {this.root.setEnabled(false);this.float.setEnabled(false);this.line.setEnabled(false);this.chest?.hide();}
  dispose():void {this.root.dispose(false,true);this.float.dispose(false,true);this.line.dispose();this.chest?.root.dispose(false,true);}
}
