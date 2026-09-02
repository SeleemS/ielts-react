// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  WRITING_DRAFT_KEY,
  consumeWritingDraft,
  parseWritingDraft,
  saveWritingDraft,
  serializeWritingDraft,
} from './writingDraft';

const ESSAY = 'Some people believe that technology has made life easier.';

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('serializeWritingDraft / parseWritingDraft', () => {
  it('round-trips a hero draft', () => {
    const raw = serializeWritingDraft({
      taskType: 'task1-academic',
      prompt: 'The chart below shows…',
      essay: ESSAY,
    });
    expect(parseWritingDraft(raw)).toMatchObject({
      taskType: 'task1-academic',
      prompt: 'The chart below shows…',
      essay: ESSAY,
      autoSubmit: true,
    });
  });

  it('falls back to Task 2 for an unknown or missing task type', () => {
    expect(parseWritingDraft(serializeWritingDraft({ essay: ESSAY }))).toMatchObject({
      taskType: 'task2',
      prompt: '',
    });
    const raw = serializeWritingDraft({ taskType: 'task-9', essay: ESSAY });
    expect(parseWritingDraft(raw).taskType).toBe('task2');
  });

  it('preserves an explicit autoSubmit: false', () => {
    const raw = serializeWritingDraft({ essay: ESSAY, autoSubmit: false });
    expect(parseWritingDraft(raw).autoSubmit).toBe(false);
  });

  it('rejects malformed, versionless and empty-essay records', () => {
    expect(parseWritingDraft(null)).toBeNull();
    expect(parseWritingDraft('')).toBeNull();
    expect(parseWritingDraft('{not json')).toBeNull();
    expect(parseWritingDraft('[]')).toBeNull();
    expect(parseWritingDraft(JSON.stringify({ essay: ESSAY }))).toBeNull();
    expect(parseWritingDraft(JSON.stringify({ v: 2, essay: ESSAY }))).toBeNull();
    expect(parseWritingDraft(serializeWritingDraft({ essay: '   ' }))).toBeNull();
  });

  it('truncates oversized text rather than storing it whole', () => {
    const parsed = parseWritingDraft(
      serializeWritingDraft({ essay: 'a'.repeat(30000), prompt: 'b'.repeat(5000) })
    );
    expect(parsed.essay).toHaveLength(25000);
    expect(parsed.prompt).toHaveLength(2000);
  });
});

describe('saveWritingDraft / consumeWritingDraft', () => {
  it('hands the draft over exactly once', () => {
    expect(saveWritingDraft({ essay: ESSAY, taskType: 'task2' })).toBe(true);
    expect(window.sessionStorage.getItem(WRITING_DRAFT_KEY)).toBeTruthy();

    expect(consumeWritingDraft().essay).toBe(ESSAY);
    // Consumed: a refresh of the checker must not silently re-score.
    expect(window.sessionStorage.getItem(WRITING_DRAFT_KEY)).toBeNull();
    expect(consumeWritingDraft()).toBeNull();
  });

  it('uses the shared ielts-attempt storage namespace', () => {
    expect(WRITING_DRAFT_KEY.startsWith('ielts-attempt:writing:')).toBe(true);
  });
});
