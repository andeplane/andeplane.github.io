import{E as e}from"./math.scalar.functions-Spa4Rbhm.js";import{t}from"./shaderStore-D-XQlhUT.js";import{t as n}from"./clipPlaneFragmentDeclaration-BoPZ2e8l.js";import{t as r}from"./clipPlaneFragment-CAkLJfj9.js";import{t as i}from"./logDepthDeclaration-DQA9o4b8.js";import{t as a}from"./logDepthFragment-C5lxT4l1.js";var o=e({linePixelShader:()=>u}),s=`linePixelShader`,c=`#include<clipPlaneFragmentDeclaration>
uniform vec4 color;
#ifdef LOGARITHMICDEPTH
#extension GL_EXT_frag_depth : enable
#endif
#include<logDepthDeclaration>
#define CUSTOM_FRAGMENT_DEFINITIONS
void main(void) {
#define CUSTOM_FRAGMENT_MAIN_BEGIN
#include<logDepthFragment>
#include<clipPlaneFragment>
gl_FragColor=color;
#define CUSTOM_FRAGMENT_MAIN_END
}`;t.ShadersStore[s]||(t.ShadersStore[s]=c);var l=[n,i,a,r];for(let e of l)t.IncludesShadersStore[e.name]||(t.IncludesShadersStore[e.name]=e.shader);var u={name:s,shader:c};export{o as n,u as t};