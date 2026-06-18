import { describe, it, expect } from 'vitest';
import { formatSSEEvent } from '../sse.js';

describe('formatSSEEvent', () => {
  it('produces the wire format for a plain event', () => {
    const result = formatSSEEvent({ type: 'start', timestamp: 1000 });
    expect(result).toBe('data: {"type":"start","timestamp":1000}\n\n');
  });

  it('serializes a data payload', () => {
    const result = formatSSEEvent({ type: 'message', data: { content: 'hi' } });
    expect(result).toBe('data: {"type":"message","data":{"content":"hi"}}\n\n');
  });

  it('always ends with double newline', () => {
    const result = formatSSEEvent({ type: 'done' });
    expect(result.endsWith('\n\n')).toBe(true);
  });
});
