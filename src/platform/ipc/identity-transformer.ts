/**
 * Passed explicitly on both ends of the tRPC link: the default transformer is branded
 * `DefaultDataTransformer`, which the strict app and non-strict test tsconfigs resolve inconsistently.
 * Payloads still cross the IPC boundary verbatim.
 */
export const identityTransformer = {
  serialize: (object: unknown) => object,
  deserialize: (object: unknown) => object
};
