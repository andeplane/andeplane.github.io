import{f as e}from"./math.scalar.functions-C2PblfeF.js";import{t}from"./shaderStore-D-XQlhUT.js";var n=/* @__PURE__ */ e({fresnelFunctionWGSL:()=>a});const r=`fresnelFunction`,i=`#ifdef FRESNEL
fn computeFresnelTerm(viewDirection: vec3f,worldNormal: vec3f,bias: f32,power: f32)->f32
{let fresnelTerm: f32=pow(bias+abs(dot(viewDirection,worldNormal)),power);return clamp(fresnelTerm,0.,1.);}
#endif
`;t.IncludesShadersStoreWGSL[r]||(t.IncludesShadersStoreWGSL[r]=i);const a={name:r,shader:i};export{n,a as t};