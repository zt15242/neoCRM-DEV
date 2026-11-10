// Match the wire spelling, legacy spelling and doubled bars emitted by some gateways.
const prefix = String.raw`[|｜]{0,2}DSML[|｜]{1,2}`;
const startTag = new RegExp(String.raw`</?${prefix}`, 'i');
const invokeStart = new RegExp(String.raw`^<${prefix}\s*invoke\b`, 'i');
const invokeEnd = new RegExp(String.raw`</${prefix}\s*invoke\s*>`, 'i');
const wrapper = new RegExp(String.raw`^</?${prefix}\s*(?:tool[_ -]?calls|calls)\s*>$`, 'i');
const markers = ['', '|', '||'].flatMap(bars => ['<', '</'].map(start => start + bars + 'dsml||'));

function findPartialMarkupStart(text) {
  const lower = text.toLowerCase().replaceAll('｜', '|');
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
    this.pending += String(chunk || '');
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
        const close = invokeEnd.exec(this.pending);
        if (close) {
          this.pending = this.pending.slice(close.index + close[0].length);
          this.insideInvocation = false;
          continue;
        }
        // Retain only a bounded suffix for a closing tag split across chunks.
        this.pending = final ? '' : this.pending.slice(-128);
        break;
      }

      const markerIndex = this.pending.search(startTag);
      if (markerIndex < 0) {
        const partialIndex = findPartialMarkupStart(this.pending);
        if (partialIndex >= 0 && !final) {
          output += this.pending.slice(0, partialIndex);
          this.pending = this.pending.slice(partialIndex);
        } else if (partialIndex >= 0 && /(?:[|｜]|ds)/i.test(this.pending.slice(partialIndex))) {
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

      if (invokeStart.test(tag)) {
        this.insideInvocation = true;
        continue;
      }

      if (wrapper.test(tag) || invokeEnd.test(tag)) {
        continue;
      }

      // Unknown DSML tags are protocol, not user-facing prose. Hide through the matching invocation end.
      this.insideInvocation = true;
    }

    return output;
  }
}
