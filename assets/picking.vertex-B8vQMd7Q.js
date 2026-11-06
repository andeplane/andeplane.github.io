import{E as e}from"./math.scalar.functions-Spa4Rbhm.js";import{t}from"./shaderStore-D-XQlhUT.js";import{t as n}from"./bonesDeclaration-BJEUC81w.js";import{t as r}from"./bakedVertexAnimationDeclaration-C-g0vyVW.js";import{t as i}from"./morphTargetsVertexGlobalDeclaration-D0iiZj6t.js";import{t as a}from"./morphTargetsVertexDeclaration-y8P-IGM5.js";import{t as o}from"./instancesDeclaration-DsiFqYXH.js";import{t as s}from"./morphTargetsVertexGlobal-CtEf7tXS.js";import{t as c}from"./morphTargetsVertex-BqxrwQeg.js";import{t as l}from"./instancesVertex-Dty6qjVO.js";import{t as u}from"./bonesVertex-DizApUyn.js";import{t as d}from"./bakedVertexAnimation-CP3BNGXM.js";var f=e({pickingVertexShaderWGSL:()=>g}),p=`pickingVertexShader`,m=`attribute position: vec3f;
#if defined(INSTANCES)
attribute instanceMeshID: f32;
#endif
#include<bonesDeclaration>
#include<bakedVertexAnimationDeclaration>
#include<morphTargetsVertexGlobalDeclaration>
#include<morphTargetsVertexDeclaration>[0..maxSimultaneousMorphTargets]
#include<instancesDeclaration>
uniform viewProjection: mat4x4f;
#if defined(INSTANCES)
flat varying vMeshID: f32;
#endif
@vertex
fn main(input : VertexInputs)->FragmentInputs {var positionUpdated: vec3f=vertexInputs.position;
#include<morphTargetsVertexGlobal>
#include<morphTargetsVertex>[0..maxSimultaneousMorphTargets]
#include<instancesVertex>
#include<bonesVertex>
#include<bakedVertexAnimation>
var worldPos: vec4f=finalWorld*vec4f(positionUpdated,1.0);vertexOutputs.position=uniforms.viewProjection*worldPos;
#if defined(INSTANCES)
vertexOutputs.vMeshID=vertexInputs.instanceMeshID;
#endif
}
`;t.ShadersStoreWGSL[p]||(t.ShadersStoreWGSL[p]=m);var h=[n,r,i,a,o,s,c,l,u,d];for(let e of h)t.IncludesShadersStoreWGSL[e.name]||(t.IncludesShadersStoreWGSL[e.name]=e.shader);var g={name:p,shader:m};export{f as n,g as t};