/** Automatically selected when the local purchased export is available at build time. */
export const PRIVATE_PEARL = import.meta.env.PRIVATE_PEARL === true;
export const privatePearlUrl = `${import.meta.env.BASE_URL}assets/private/black-pearl.glb`;

export const privatePearlModelUrl = (phone: boolean): string =>
  phone && import.meta.env.PRIVATE_PEARL_MOBILE === true
    ? `${import.meta.env.BASE_URL}assets/private/black-pearl-mobile.glb`
    : privatePearlUrl;
