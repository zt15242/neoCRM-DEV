/** Keep foreground slots separate from agents: a foreground turn can wait on its own agent. */
export class ChatConcurrency {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly limit = 3, private readonly maxQueued = 12) {}

  acquire(signal: AbortSignal, onQueued: () => void): Promise<() => void> {
    signal.throwIfAborted();
    if (this.running < this.limit) return Promise.resolve(this.take());
    if (this.queue.length >= this.maxQueued) throw new Error('AI 任务队列已满，请等待已有任务结束后重试。');
    onQueued();
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      const grant = () => {
        signal.removeEventListener('abort', cancel);
        resolve(this.take());
      };
      const cancel = () => {
        this.queue = this.queue.filter(item => item !== grant);
        reject(signal.reason);
      };
      this.queue.push(grant);
      signal.addEventListener('abort', cancel, { once: true });
    });
  }

  private take() {
    this.running++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.running--;
      this.queue.shift()?.();
    };
  }
}
