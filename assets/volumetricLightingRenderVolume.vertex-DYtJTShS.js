import{t as e}from"./shaderStore-D-XQlhUT.js";import{t}from"./meshUboDeclaration-QH2C0EZF.js";import{t as n}from"./sceneUboDeclaration-DDYo9zci.js";const r=`volumetricLightingRenderVolumeVertexShader`,i=`#include<sceneUboDeclaration>
#include<meshUboDeclaration>
attribute position : vec3f;varying vWorldPos: vec4f;@vertex
fn main(input : VertexInputs)->FragmentInputs {let worldPos=mesh.world*vec4f(vertexInputs.position,1.0);vertexOutputs.vWorldPos=worldPos;vertexOutputs.position=scene.viewProjection*worldPos;}
`;e.ShadersStoreWGSL[r]||(e.ShadersStoreWGSL[r]=i);const a=[n,t];for(let t of a)e.IncludesShadersStoreWGSL[t.name]||(e.IncludesShadersStoreWGSL[t.name]=t.shader);const o={name:r,shader:i};export{o as volumetricLightingRenderVolumeVertexShaderWGSL};