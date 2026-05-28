/**
 * DI tokens provided at runtime by bootstrap (`container.register(...)`) rather
 * than constructed by the generated container or a manual provider. The codegen
 * treats these as valid dependency targets.
 */
export const externallyRegisteredTokens: readonly string[] = ['uiController'];
