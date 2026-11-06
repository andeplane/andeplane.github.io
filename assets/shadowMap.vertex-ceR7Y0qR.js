import{E as e}from"./math.scalar.functions-Spa4Rbhm.js";import{t}from"./shaderStore-D-XQlhUT.js";import{t as n}from"./bonesDeclaration-9mUC5O1T.js";import{n as r,t as i}from"./bakedVertexAnimation-7XIMgH6x.js";import{t as a}from"./morphTargetsVertexGlobalDeclaration-DNMNaoXs.js";import{t as o}from"./morphTargetsVertexDeclaration-DwkeNZuY.js";import{t as s}from"./morphTargetsVertexGlobal-DXQGYPOx.js";import{t as c}from"./morphTargetsVertex-BzTO5anb.js";import{t as l}from"./instancesVertex-C-FoRQR1.js";import{t as u}from"./bonesVertex-su2zhmMI.js";import{t as d}from"./helperFunctions-BnSrAiVI.js";import{t as f}from"./clipPlaneVertexDeclaration-C6qTOcVq.js";import{t as p}from"./clipPlaneVertex-DFqigEiB.js";import{t as m}from"./sceneVertexDeclaration-CluTp-RC.js";import{t as h}from"./meshVertexDeclaration-CPlGPeEg.js";import{t as g}from"./sceneUboDeclaration-B5VhSG0v.js";import{t as _}from"./meshUboDeclaration-BmNu2KU_.js";import{t as v}from"./shadowMapVertexMetric-DOAg4zZR.js";var y=`shadowMapVertexDeclaration`,b=`#include<sceneVertexDeclaration>
#include<meshVertexDeclaration>
`;t.IncludesShadersStore[y]||(t.IncludesShadersStore[y]=b);var x={name:y,shader:b},S=`shadowMapUboDeclaration`,C=`layout(std140,column_major) uniform;
#include<sceneUboDeclaration>
#include<meshUboDeclaration>
`;t.IncludesShadersStore[S]||(t.IncludesShadersStore[S]=C);var w={name:S,shader:C},T=`shadowMapVertexExtraDeclaration`,E=`#if SM_NORMALBIAS==1
uniform vec3 lightDataSM;
#endif
uniform vec3 biasAndScaleSM;uniform vec2 depthValuesSM;varying float vDepthMetricSM;
#if SM_USEDISTANCE==1
varying vec3 vPositionWSM;
#endif
#if defined(SM_DEPTHCLAMP) && SM_DEPTHCLAMP==1
varying float zSM;
#endif
`;t.IncludesShadersStore[T]||(t.IncludesShadersStore[T]=E);var D={name:T,shader:E},O=`shadowMapVertexNormalBias`,k=`#if SM_NORMALBIAS==1
#if SM_DIRECTIONINLIGHTDATA==1
vec3 worldLightDirSM=normalize(-lightDataSM.xyz);
#else
vec3 directionToLightSM=lightDataSM.xyz-worldPos.xyz;vec3 worldLightDirSM=normalize(directionToLightSM);
#endif
float ndlSM=dot(vNormalW,worldLightDirSM);float sinNLSM=sqrt(1.0-ndlSM*ndlSM);float normalBiasSM=biasAndScaleSM.y*sinNLSM;worldPos.xyz-=vNormalW*normalBiasSM;
#endif
`;t.IncludesShadersStore[O]||(t.IncludesShadersStore[O]=k);var A={name:O,shader:k},j=e({shadowMapVertexShader:()=>F}),M=`shadowMapVertexShader`,N=`attribute vec3 position;
#ifdef NORMAL
attribute vec3 normal;
#endif
#include<bonesDeclaration>
#include<bakedVertexAnimationDeclaration>
#include<morphTargetsVertexGlobalDeclaration>
#include<morphTargetsVertexDeclaration>[0..maxSimultaneousMorphTargets]
#ifdef INSTANCES
attribute vec4 world0;attribute vec4 world1;attribute vec4 world2;attribute vec4 world3;
#endif
#include<helperFunctions>
#include<__decl__shadowMapVertex>
#ifdef ALPHATEXTURE
varying vec2 vUV;uniform mat4 diffuseMatrix;
#ifdef UV1
attribute vec2 uv;
#endif
#ifdef UV2
attribute vec2 uv2;
#endif
#endif
#include<shadowMapVertexExtraDeclaration>
#include<clipPlaneVertexDeclaration>
#define CUSTOM_VERTEX_DEFINITIONS
void main(void)
{vec3 positionUpdated=position;
#ifdef UV1
vec2 uvUpdated=uv;
#endif
#ifdef UV2
vec2 uv2Updated=uv2;
#endif
#ifdef NORMAL
vec3 normalUpdated=normal;
#endif
#include<morphTargetsVertexGlobal>
#include<morphTargetsVertex>[0..maxSimultaneousMorphTargets]
#include<instancesVertex>
#include<bonesVertex>
#include<bakedVertexAnimation>
vec4 worldPos=finalWorld*vec4(positionUpdated,1.0);
#ifdef NORMAL
mat3 normWorldSM=mat3(finalWorld);
#if defined(INSTANCES) && defined(THIN_INSTANCES)
vec3 vNormalW=normalUpdated/vec3(dot(normWorldSM[0],normWorldSM[0]),dot(normWorldSM[1],normWorldSM[1]),dot(normWorldSM[2],normWorldSM[2]));vNormalW=normalize(normWorldSM*vNormalW);
#else
#ifdef NONUNIFORMSCALING
normWorldSM=transposeMat3(inverseMat3(normWorldSM));
#endif
vec3 vNormalW=normalize(normWorldSM*normalUpdated);
#endif
#endif
#include<shadowMapVertexNormalBias>
gl_Position=viewProjection*worldPos;
#include<shadowMapVertexMetric>
#ifdef ALPHATEXTURE
#ifdef UV1
vUV=vec2(diffuseMatrix*vec4(uvUpdated,1.0,0.0));
#endif
#ifdef UV2
vUV=vec2(diffuseMatrix*vec4(uv2Updated,1.0,0.0));
#endif
#endif
#include<clipPlaneVertex>
}`;t.ShadersStore[M]||(t.ShadersStore[M]=N);var P=[n,r,a,o,d,m,h,x,g,_,w,D,f,s,c,l,u,i,A,v,p];for(let e of P)t.IncludesShadersStore[e.name]||(t.IncludesShadersStore[e.name]=e.shader);var F={name:M,shader:N};export{j as n,F as t};