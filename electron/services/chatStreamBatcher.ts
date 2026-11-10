import type { AiStreamEvent } from '../../shared/types';

export function batchChatStream(send: (event: AiStreamEvent) => void) {
  let event: AiStreamEvent | undefined;
  let pieces: string[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    const pending = event;
    const delta = pieces.join('');
    event = undefined;
    pieces = [];
    size = 0;
    if (pending) send({ ...pending, delta });
  };
  return (next: AiStreamEvent) => {
    if ((next.type !== 'content_delta' && next.type !== 'reasoning_delta') || !next.delta) {
      flush();
      send(next);
      return;
    }
    if (event && (event.type !== next.type || event.requestId !== next.requestId)) flush();
    event ??= next;
    pieces.push(next.delta);
    size += next.delta.length;
    if (size >= 16_384 || pieces.length >= 256) flush();
    else timer ??= setTimeout(flush, 40);
  };
}
