export class PromptNotFoundError extends Error {
  readonly code = "prompt_not_found";

  constructor(name: string, version: string) {
    super(`Prompt ${name}@${version} is not published`);
    this.name = "PromptNotFoundError";
  }
}

export class PromptBindingError extends Error {
  readonly code = "prompt_binding_invalid";
  readonly issues: unknown;

  constructor(issues: unknown) {
    super("Prompt bindings are invalid");
    this.name = "PromptBindingError";
    this.issues = issues;
  }
}

export class PromptLockError extends Error {
  readonly code = "prompt_lock_mismatch";
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(problems.join("\n"));
    this.name = "PromptLockError";
    this.problems = problems;
  }
}
