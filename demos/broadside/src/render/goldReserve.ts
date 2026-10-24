import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { caveFloor } from "../input/caveLayout";
import type { CoinBankArea } from "./coinHoard";

/** A bounded stack represents an explicitly labelled, exact monetary reserve. */
export class GoldReserve {
  private root:TransformNode;
  private label:DynamicTexture;
  private amount=-1;
  private obstacle:{x:number;z:number;rx:number;rz:number;top:number};
  constructor(scene:Scene,area:CoinBankArea,private obstacleChanged?: (obstacle:{x:number;z:number;rx:number;rz:number;top:number},enabled:boolean)=>void){
    this.root=new TransformNode(`${area.name} secured gold reserve`,scene);
    const x=area.x+3.1,z=area.z+2.8;this.obstacle={x,z,rx:1.1,rz:.72,top:caveFloor(x,z)+1.5};this.root.position.set(x,caveFloor(x,z),z);this.root.setEnabled(false);
    const wood=new StandardMaterial('reserve chest oak',scene);wood.diffuseColor=Color3.FromHexString('#694128');
    const iron=new StandardMaterial('reserve chest bands',scene);iron.diffuseColor=Color3.FromHexString('#303b40');
    const gold=new StandardMaterial('reserve gold bars',scene);gold.diffuseColor=Color3.FromHexString('#e9b94e');gold.specularColor=Color3.FromHexString('#fff2c6');gold.specularPower=86;gold.emissiveColor.set(.055,.035,.004);
    const box=MeshBuilder.CreateBox('secured reserve chest',{width:2.1,height:.7,depth:1.35},scene);box.parent=this.root;box.position.y=.36;box.material=wood;box.isPickable=false;
    for(const x of [-.78,.78]){const band=MeshBuilder.CreateBox('reserve iron band',{width:.12,height:.74,depth:1.39},scene);band.parent=this.root;band.position.set(x,.37,0);band.material=iron;band.isPickable=false;}
    for(let i=0;i<18;i++){
      const bar=MeshBuilder.CreateCylinder('banked gold ingot',{diameterTop:.38,diameterBottom:.48,height:.2,tessellation:4},scene);bar.parent=this.root;bar.position.set((i%3-1)*.53,.82+Math.floor(i/6)*.21,(Math.floor(i/3)%2-.5)*.52);bar.scaling.z=1.4;bar.rotation.y=Math.PI/4;bar.material=gold;bar.isPickable=false;
    }
    this.label=new DynamicTexture(`${area.name} reserve amount`,{width:1024,height:256},scene,false);
    const material=new StandardMaterial('reserve sign lettering',scene);material.diffuseTexture=this.label;material.emissiveTexture=this.label;material.emissiveColor.set(.65,.65,.65);material.specularColor=Color3.Black();material.backFaceCulling=false;
    const sign=MeshBuilder.CreatePlane('labelled gold-bar reserve',{width:2.25,height:.56},scene);sign.parent=this.root;sign.position.set(0,1.95,-.1);sign.material=material;sign.isPickable=false;
  }
  update(amount:number):void{
    if(amount===this.amount)return;const wasVisible=this.amount>0;this.amount=amount;if(wasVisible!==(amount>0))this.obstacleChanged?.(this.obstacle,amount>0);this.root.setEnabled(amount>0);if(!amount)return;
    const c=this.label.getContext() as CanvasRenderingContext2D;c.fillStyle='#10252b';c.fillRect(0,0,1024,256);c.fillStyle='#ffe2a0';c.textAlign='center';c.font='bold 49px sans-serif';c.fillText('SECURED GOLD RESERVE',512,85);c.font='bold 68px sans-serif';c.fillText(`${amount.toLocaleString('en-US')} GOLD`,512,181);this.label.update();
  }
}
