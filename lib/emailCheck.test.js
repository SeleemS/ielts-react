import { describe, expect, it } from 'vitest';
import { emailAliasKey, isDisposableEmail, maskEmail, suggestEmailFix } from './emailCheck';

describe('suggestEmailFix', () => {
  it.each([
    ['blink@gamil.com', 'blink@gmail.com'],
    ['kanyal@gmail.con', 'kanyal@gmail.com'],
    ['jeremiah@gmai.com', 'jeremiah@gmail.com'],
    ['nuray@gmaail.com', 'nuray@gmail.com'],
    ['boon@gmail.cojm', 'boon@gmail.com'],
    ['gvk@gmail.comgv', 'gvk@gmail.com'],
    ['ali@gmial.com', 'ali@gmail.com'],
    ['sam@hotmial.com', 'sam@hotmail.com'],
    ['li@outlok.com', 'li@outlook.com'],
    ['x@yahooo.com', 'x@yahoo.com'],
  ])('%s -> %s', (input, fixed) => {
    expect(suggestEmailFix(input)).toBe(fixed);
  });

  it.each(['a@gmail.com', 'a@student.newinti.edu.my', 'a@laurentian.ca', 'a@qq.com', 'a@ubempathy.edu.mn', 'a@yahoo.com.hk', 'a@email.com', 'nope', ''])(
    'leaves %s alone',
    (input) => {
      expect(suggestEmailFix(input)).toBeNull();
    }
  );
});

describe('isDisposableEmail', () => {
  it('flags throwaway domains and their subdomains', () => {
    expect(isDisposableEmail('a@mailinator.com')).toBe(true);
    expect(isDisposableEmail('a@x.yopmail.com')).toBe(true);
    expect(isDisposableEmail('a@gmail.com')).toBe(false);
    expect(isDisposableEmail('a@notmailinator.com')).toBe(false);
  });
});

describe('emailAliasKey', () => {
  it('collapses Gmail dots, +tags and googlemail', () => {
    expect(emailAliasKey('J.Smith+ielts2@gmail.com')).toBe('jsmith@gmail.com');
    expect(emailAliasKey('jsmith@googlemail.com')).toBe('jsmith@gmail.com');
  });
  it('strips +tags but keeps dots on other big providers', () => {
    expect(emailAliasKey('j.smith+x@outlook.com')).toBe('j.smith@outlook.com');
  });
  it('leaves unknown domains literal', () => {
    expect(emailAliasKey('a.b+c@school.edu')).toBe('a.b+c@school.edu');
  });
});

describe('maskEmail', () => {
  it('shows only the first letters', () => {
    expect(maskEmail('jane.smith@gmail.com')).toBe('ja•••@gmail.com');
    expect(maskEmail('jo@gmail.com')).toBe('j•••@gmail.com');
  });
});

describe('database disposable list', () => {
  it('blocks every domain the client blocks', async () => {
    const { readFileSync } = await import('node:fs');
    const { DISPOSABLE_DOMAINS } = await import('./emailCheck');
    const sql = readFileSync(
      new URL('../supabase/migrations/20261018140000_signup_block_gmail_dots_disposable.sql', import.meta.url),
      'utf8'
    );
    const missing = [...DISPOSABLE_DOMAINS].filter((domain) => !sql.includes(`'${domain}'`));
    expect(missing).toEqual([]);
  });
});
