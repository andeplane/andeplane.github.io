import{t as e}from"./shaderStore-D-XQlhUT.js";const t=`fogVertex`,n=`#ifdef FOG
vFogDistance=(view*worldPos).xyz;
#endif
`;e.IncludesShadersStore[t]||(e.IncludesShadersStore[t]=n);const r={name:t,shader:n};export{r as t};