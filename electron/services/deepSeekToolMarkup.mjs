function normalizeMarkup(content) {
  return String(content || '')
    .replaceAll('｜', '|')
    .replace(/<(\/?)\s*DSML\|/gi, (_match, closing = '') => `<${closing}|DSML|`);
}

function findPartialMarkupStart(text) {
  const lower = text.toLowerCase();
  const markers = ['<|dsml|', '</|dsml|', '<dsml|', '</dsml|', '<dsml', '</dsml'];
  const maxMarkerLength = Math.max(...markers.map((marker) => marker.length));
  for (let index = Math.max(0, text.length - maxMarkerLength + 1); index < text.length; index++) {
    const suffix = lower.slice(index);
    if (markers.some((marker) => marker.startsWith(suffix))) return index;
  }
  return -1;
}

export class DeepSeekToolMarkupFilter {
  pending = '';
  insideInvocation = false;
  hadMarkup = false;

  push(chunk) {
    this.pending = normalizeMarkup(this.pending + String(chunk || ''));
    return this.consume(false);
  }

  finish() {
    const output = this.consume(true);
    if (this.pending || this.insideInvocation) this.hadMarkup = true;
    this.pending = '';
    this.insideInvocation = false;
    return output;
  }

  consume(final) {
    let output = '';

    while (this.pending) {
      if (this.insideInvocation) {
        const close = /<\/\|DSML\|\s*invoke\s*>/i.exec(this.pending);
        if (close) {
          this.pending = this.pending.slice(close.index + close[0].length);
          this.insideInvocation = false;
          continue;
        }
        const partialClose = this.pending.toLowerCase().lastIndexOf('</|dsml|invoke');
        if (partialClose >= 0 && !final) {
          this.pending = this.pending.slice(partialClose);
        } else if (!final) {
          this.pending = this.pending.slice(-16);
        } else {
          this.pending = '';
        }
        break;
      }

      const markerIndex = this.pending.search(/<\/?\|DSML\|/i);
      if (markerIndex < 0) {
        const partialIndex = findPartialMarkupStart(this.pending);
        if (partialIndex >= 0 && !final) {
          output += this.pending.slice(0, partialIndex);
          this.pending = this.pending.slice(partialIndex);
        } else if (partialIndex >= 0) {
          this.hadMarkup = true;
          output += this.pending.slice(0, partialIndex);
          this.pending = '';
        } else {
          output += this.pending;
          this.pending = '';
        }
        break;
      }

      output += this.pending.slice(0, markerIndex);
      this.pending = this.pending.slice(markerIndex);

      const tagEnd = this.pending.indexOf('>');
      if (tagEnd < 0) {
        this.hadMarkup = true;
        if (final) this.pending = '';
        break;
      }

      const tag = this.pending.slice(0, tagEnd + 1);
      this.pending = this.pending.slice(tagEnd + 1);
      this.hadMarkup = true;

      if (/^<\|DSML\|\s*invoke\b/i.test(tag)) {
        this.insideInvocation = true;
        continue;
      }

      if (/^<\|DSML\|\s*(?:tool[_ -]?calls|calls)\s*>$/i.test(tag) ||
          /^<\/\|DSML\|\s*(?:tool[_ -]?calls|calls)\s*>$/i.test(tag) ||
          /^<\/\|DSML\|\s*invoke\s*>$/i.test(tag)) {
        continue;
      }

      // Unknown DSML tags are protocol, not user-facing prose. Hide through the matching invocation end.
      this.insideInvocation = true;
    }

    return output;
  }
}
