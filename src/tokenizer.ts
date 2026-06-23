import { encodingForModel, getEncoding } from "js-tiktoken";

export interface TokenCounter {
  name: string;
  count(text: string): number;
}

export interface TokenCounterOptions {
  encoding?: string;
  model?: string;
}

export class RegexTokenCounter implements TokenCounter {
  readonly name = "fallback_regex";

  count(text: string): number {
    if (text.length === 0) return 0;
    const pieces = text.match(/[\p{L}\p{N}_]+|[^\p{L}\p{N}\s_]/gu) ?? [];
    return Math.max(1, pieces.length);
  }
}

class JsTiktokenCounter implements TokenCounter {
  constructor(
    private readonly encoding: { encode(text: string): number[] },
    readonly name: string,
  ) {}

  count(text: string): number {
    return this.encoding.encode(text).length;
  }
}

function fromEncoding(name: string): TokenCounter | null {
  try {
    return new JsTiktokenCounter(getEncoding(name as Parameters<typeof getEncoding>[0]), name);
  } catch {
    return null;
  }
}

function fromModel(model: string): TokenCounter | null {
  try {
    return new JsTiktokenCounter(encodingForModel(model as Parameters<typeof encodingForModel>[0]), `model:${model}`);
  } catch {
    return null;
  }
}

export function loadTokenCounter(options: TokenCounterOptions = {}): TokenCounter {
  if (options.encoding) {
    return fromEncoding(options.encoding) ?? new RegexTokenCounter();
  }
  if (options.model) {
    return fromModel(options.model) ?? new RegexTokenCounter();
  }
  return fromEncoding("o200k_base") ?? fromEncoding("cl100k_base") ?? new RegexTokenCounter();
}
