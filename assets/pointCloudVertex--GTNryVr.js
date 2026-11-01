import{t as e}from"./shaderStore-D-XQlhUT.js";const t=`pointCloudVertex`,n=`#if defined(POINTSIZE) && !defined(WEBGPU)
gl_PointSize=pointSize;
#endif
`;e.IncludesShadersStore[t]||(e.IncludesShadersStore[t]=n);const r={name:t,shader:n};export{r as t};