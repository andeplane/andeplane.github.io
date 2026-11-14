import{f as e}from"./math.scalar.functions-C2PblfeF.js";import{t}from"./shaderStore-D-XQlhUT.js";var n=/* @__PURE__ */ e({morphTargetsVertexGlobal:()=>a});const r=`morphTargetsVertexGlobal`,i=`#ifdef MORPHTARGETS
#ifdef MORPHTARGETS_TEXTURE
float vertexID;
#endif
#endif
`;t.IncludesShadersStore[r]||(t.IncludesShadersStore[r]=i);const a={name:r,shader:i};export{n,a as t};