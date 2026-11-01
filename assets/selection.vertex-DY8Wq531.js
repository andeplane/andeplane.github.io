import{t as e}from"./shaderStore-D-XQlhUT.js";import{t}from"./bonesDeclaration-DnZFvp-P.js";import{n,t as r}from"./bakedVertexAnimation-nEh5y0jx.js";import{t as i}from"./morphTargetsVertexGlobalDeclaration-BRrlu_WS.js";import{t as a}from"./morphTargetsVertexDeclaration-E6FruwAJ.js";import{t as o}from"./instancesDeclaration-UqAFru62.js";import{t as s}from"./morphTargetsVertexGlobal-BSwdY3vw.js";import{t as c}from"./morphTargetsVertex-DffcSXdQ.js";import{t as l}from"./instancesVertex-D6vFGQJE.js";import{t as u}from"./bonesVertex-DCVwLJbp.js";import{t as d}from"./clipPlaneVertexDeclaration-CxJ8tqlT.js";import{t as f}from"./clipPlaneVertex-g1I3Bgq1.js";const p=`selectionVertexShader`,m=`attribute vec3 position;
#ifdef INSTANCES
attribute float instanceSelectionId;
#endif
#include<bonesDeclaration>
#include<bakedVertexAnimationDeclaration>
#include<morphTargetsVertexGlobalDeclaration>
#include<morphTargetsVertexDeclaration>[0..maxSimultaneousMorphTargets]
#include<clipPlaneVertexDeclaration>
#include<instancesDeclaration>
uniform mat4 viewProjection;
#ifdef STORE_CAMERASPACE_Z
uniform mat4 view;
#else
uniform vec2 depthValues;
#endif
#ifdef INSTANCES
flat varying float vSelectionId;
#endif
#ifdef STORE_CAMERASPACE_Z
varying float vViewPosZ;
#else
varying float vDepthMetric;
#endif
#ifdef ALPHATEST
varying vec2 vUV;uniform mat4 diffuseMatrix;
#ifdef UV1
attribute vec2 uv;
#endif
#ifdef UV2
attribute vec2 uv2;
#endif
#endif
#define CUSTOM_VERTEX_DEFINITIONS
void main(void) {
#define CUSTOM_VERTEX_MAIN_BEGIN
vec3 positionUpdated=position;
#ifdef UV1
vec2 uvUpdated=uv;
#endif
#ifdef UV2
vec2 uv2Updated=uv2;
#endif
#include<morphTargetsVertexGlobal>
#include<morphTargetsVertex>[0..maxSimultaneousMorphTargets]
#include<instancesVertex>
#include<bonesVertex>
#include<bakedVertexAnimation>
vec4 worldPos=finalWorld*vec4(positionUpdated,1.0);gl_Position=viewProjection*worldPos;
#ifdef ALPHATEST
#ifdef UV1
vUV=vec2(diffuseMatrix*vec4(uvUpdated,1.0,0.0));
#endif
#ifdef UV2
vUV=vec2(diffuseMatrix*vec4(uv2Updated,1.0,0.0));
#endif
#endif
#ifdef STORE_CAMERASPACE_Z
vViewPosZ=(view*worldPos).z;
#else
#ifdef USE_REVERSE_DEPTHBUFFER
vDepthMetric=((-gl_Position.z+depthValues.x)/(depthValues.y));
#else
vDepthMetric=((gl_Position.z+depthValues.x)/(depthValues.y));
#endif
#endif
#ifdef INSTANCES
vSelectionId=instanceSelectionId;
#endif
#include<clipPlaneVertex>
#define CUSTOM_VERTEX_MAIN_END
}
`;e.ShadersStore[p]||(e.ShadersStore[p]=m);const h=[t,n,i,a,d,o,s,c,l,u,r,f];for(let t of h)e.IncludesShadersStore[t.name]||(e.IncludesShadersStore[t.name]=t.shader);const g={name:p,shader:m};export{g as selectionVertexShader};