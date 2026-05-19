import contract from './render-passes.contract.json';

export type RenderPassContractShape = typeof contract;
export type RenderPassDefinition = RenderPassContractShape['passes'][number];

export const RenderPassContract = contract;
