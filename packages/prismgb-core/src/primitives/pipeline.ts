export class Pipeline<TInput, TOutput> {
  #steps: ((input: TInput, next: (input: TInput) => Promise<TOutput>) => Promise<TOutput>)[] = [];

  constructor(steps: ((input: TInput, next: (input: TInput) => Promise<TOutput>) => Promise<TOutput>)[] = []) {
    this.#steps = steps;
  }

  add(step: (input: TInput, next: (input: TInput) => Promise<TOutput>) => Promise<TOutput>): void {
    this.#steps.push(step);
  }

  async execute(input: TInput, next: (input: TInput) => Promise<TOutput>): Promise<TOutput> {
    let index = 0;
    const runStep = async (currentInput: TInput): Promise<TOutput> => {
      if (index >= this.#steps.length) {
        return next(currentInput);
      }
      const step = this.#steps[index++];
      return step(currentInput, runStep);
    };
    return runStep(input);
  }
}
