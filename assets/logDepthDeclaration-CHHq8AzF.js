import{f as e}from"./math.scalar.functions-C2PblfeF.js";import{t}from"./shaderStore-D-XQlhUT.js";var n=/* @__PURE__ */ e({logDepthDeclarationWGSL:()=>a});const r=`logDepthDeclaration`,i=`#ifdef LOGARITHMICDEPTH
uniform logarithmicDepthConstant: f32;varying vFragmentDepth: f32;
#endif
`;t.IncludesShadersStoreWGSL[r]||(t.IncludesShadersStoreWGSL[r]=i);const a={name:r,shader:i};export{n,a as t};