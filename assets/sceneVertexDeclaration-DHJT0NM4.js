import{t as e}from"./shaderStore-D-XQlhUT.js";const t=`sceneVertexDeclaration`,n=`uniform mat4 viewProjection;
#ifdef MULTIVIEW
uniform mat4 viewProjectionR;
#endif
uniform mat4 view;uniform mat4 projection;uniform vec4 vEyePosition;
`;e.IncludesShadersStore[t]||(e.IncludesShadersStore[t]=n);const r={name:t,shader:n};export{r as t};