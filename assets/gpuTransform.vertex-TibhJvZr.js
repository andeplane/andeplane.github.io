import{E as e}from"./math.scalar.functions-Spa4Rbhm.js";import{t}from"./shaderStore-D-XQlhUT.js";import{t as n}from"./bonesDeclaration-9mUC5O1T.js";import{n as r,t as i}from"./bakedVertexAnimation-7XIMgH6x.js";import{t as a}from"./morphTargetsVertexGlobalDeclaration-DNMNaoXs.js";import{t as o}from"./morphTargetsVertexDeclaration-DwkeNZuY.js";import{t as s}from"./morphTargetsVertexGlobal-DXQGYPOx.js";import{t as c}from"./morphTargetsVertex-BzTO5anb.js";import{t as l}from"./bonesVertex-su2zhmMI.js";var u=e({gpuTransformVertexShader:()=>m}),d=`gpuTransformVertexShader`,f=`attribute vec3 position;
#include<bonesDeclaration>
#include<bakedVertexAnimationDeclaration>
#include<morphTargetsVertexGlobalDeclaration>
#include<morphTargetsVertexDeclaration>[0..maxSimultaneousMorphTargets]
out vec3 outPosition;const mat4 identity=mat4(
vec4(1.0,0.0,0.0,0.0),
vec4(0.0,1.0,0.0,0.0),
vec4(0.0,0.0,1.0,0.0),
vec4(0.0,0.0,0.0,1.0)
);void main(void) {vec3 positionUpdated=position;
#include<morphTargetsVertexGlobal>
#include<morphTargetsVertex>[0..maxSimultaneousMorphTargets]
mat4 finalWorld=identity;
#include<bonesVertex>
#include<bakedVertexAnimation>
vec4 worldPos=finalWorld*vec4(positionUpdated,1.0);outPosition=worldPos.xyz;}`;t.ShadersStore[d]||(t.ShadersStore[d]=f);var p=[n,r,a,o,s,c,l,i];for(let e of p)t.IncludesShadersStore[e.name]||(t.IncludesShadersStore[e.name]=e.shader);var m={name:d,shader:f};export{u as t};