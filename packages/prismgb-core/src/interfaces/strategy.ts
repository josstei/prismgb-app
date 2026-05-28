export interface Strategy<TInput, TOutput> {
  execute(input: TInput, next: (input: TInput) => Promise<TOutput>): Promise<TOutput>;
}
