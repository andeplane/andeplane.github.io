import{E as e}from"./math.scalar.functions-Spa4Rbhm.js";import{t}from"./shaderStore-D-XQlhUT.js";var n=e({morphTargetsVertexGlobal:()=>a}),r=`morphTargetsVertexGlobal`,i=`#ifdef MORPHTARGETS
#ifdef MORPHTARGETS_TEXTURE
float vertexID;
#endif
#endif
`;t.IncludesShadersStore[r]||(t.IncludesShadersStore[r]=i);var a={name:r,shader:i};export{n,a as t};