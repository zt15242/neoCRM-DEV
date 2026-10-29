export class DeepSeekToolMarkupFilter {
  readonly hadMarkup: boolean;
  push(chunk: string): string;
  finish(): string;
}
