import{f as e}from"./math.scalar.functions-C2PblfeF.js";import{t}from"./shaderStore-D-XQlhUT.js";var n=/* @__PURE__ */ e({clipPlaneFragmentDeclarationWGSL:()=>a});const r=`clipPlaneFragmentDeclaration`,i=`#ifdef CLIPPLANE
varying fClipDistance: f32;
#endif
#ifdef CLIPPLANE2
varying fClipDistance2: f32;
#endif
#ifdef CLIPPLANE3
varying fClipDistance3: f32;
#endif
#ifdef CLIPPLANE4
varying fClipDistance4: f32;
#endif
#ifdef CLIPPLANE5
varying fClipDistance5: f32;
#endif
#ifdef CLIPPLANE6
varying fClipDistance6: f32;
#endif
`;t.IncludesShadersStoreWGSL[r]||(t.IncludesShadersStoreWGSL[r]=i);const a={name:r,shader:i};export{n,a as t};