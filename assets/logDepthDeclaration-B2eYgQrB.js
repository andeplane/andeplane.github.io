import{f as e}from"./math.scalar.functions-C2PblfeF.js";import{t}from"./shaderStore-D-XQlhUT.js";var n=/* @__PURE__ */ e({logDepthDeclaration:()=>a});const r=`logDepthDeclaration`,i=`#ifdef LOGARITHMICDEPTH
uniform float logarithmicDepthConstant;varying float vFragmentDepth;
#endif
`;t.IncludesShadersStore[r]||(t.IncludesShadersStore[r]=i);const a={name:r,shader:i};export{n,a as t};