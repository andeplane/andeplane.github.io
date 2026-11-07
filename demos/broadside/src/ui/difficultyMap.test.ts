import { describe,it,expect } from "vitest";
import { difficultyMap } from "./difficultyMap";
const world={name:"A reading world",image:"reading/english-world.png",accent:"#f0d28c",ocean:"#164d4e",paper:"#f3e2ac",ink:"#254a3c"};
describe("shared difficulty map",()=>{
 it("focuses Pack 1 initially, uses the shared parchment pins, and renders every pack",()=>{
  const html=difficultyMap({world,eyebrow:"English",instructions:"Drag the map",stops:Array.from({length:10},(_,i)=>({id:i+1,x:i%2?850:350,y:3250-i*320,number:i+1,label:`Pack ${i+1}`,description:"Reading",example:`${(i+1)*100} gold`,detail:"Explore"})),selected:1,footer:"Ten packs",centerLabel:"Current island",baseUrl:"/demos/broadside/",height:3600});
  expect(html).toContain('data-focus-x="350" data-focus-y="3250"');expect(html.match(/class="world-pack-stop"/g)).toHaveLength(10);expect(html).toContain('/demos/broadside/reading/english-world.png');expect(html).not.toContain('pack-island-art');expect(html).toContain('height:3600px');
 });
 it("preserves the selected island on return and escapes game-supplied labels",()=>{
  const stops=[{id:"first",x:350,y:1450,number:1,label:"<script>",description:'"label"',example:"1 + 1",detail:"Explore"},{id:"second",x:850,y:1130,number:2,label:"Second",description:"Read",example:"2",detail:"Explore"}];
  const html=difficultyMap({world,eyebrow:"Math",instructions:"Drag",stops,selected:"second",footer:"All open",centerLabel:"Current island",baseUrl:"/"});expect(html).toContain('data-focus-x="850" data-focus-y="1130"');expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');
 });
});
