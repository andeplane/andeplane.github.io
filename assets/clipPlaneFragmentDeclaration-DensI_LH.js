import{f as e}from"./math.scalar.functions-C2PblfeF.js";import{t}from"./shaderStore-D-XQlhUT.js";var n=/* @__PURE__ */ e({clipPlaneFragmentDeclaration:()=>a});const r=`clipPlaneFragmentDeclaration`,i=`#ifdef CLIPPLANE
varying float fClipDistance;
#endif
#ifdef CLIPPLANE2
varying float fClipDistance2;
#endif
#ifdef CLIPPLANE3
varying float fClipDistance3;
#endif
#ifdef CLIPPLANE4
varying float fClipDistance4;
#endif
#ifdef CLIPPLANE5
varying float fClipDistance5;
#endif
#ifdef CLIPPLANE6
varying float fClipDistance6;
#endif
`;t.IncludesShadersStore[r]||(t.IncludesShadersStore[r]=i);const a={name:r,shader:i};export{n,a as t};