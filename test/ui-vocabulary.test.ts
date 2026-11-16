import { describe, expect, it } from 'vitest';
import { isUiText, redactUnlessUi } from '../src/shared/ui-vocabulary';

describe('isUiText', () => {
  it.each(['Search', 'Search⌘CommandK', 'Log out', 'Sign in', 'Hide sidebar', 'Open user navigation menu', 'My Teams', 'Account ▾', 'Notifications', '我的账户', '退出登录', 'Repositories 27'])(
    'accepts interface text: %s',
    (text) => expect(isUiText(text)).toBe(true),
  );

  it.each(['Alex Rivera', 'More options for 示例化验报告解读', '示例化验报告解读', 'U10 Example FC - Smith', 'Health checkup results', 'Hide 虚构饮食计划 from recent artifacts', 'Example Pass 与 Demo 通行证对比'])(
    'rejects user content: %s',
    (text) => expect(isUiText(text)).toBe(false),
  );
});

describe('redactUnlessUi', () => {
  it('keeps interface text and replaces everything else with a length-only placeholder', () => {
    expect(redactUnlessUi('Log out')).toBe('Log out');
    expect(redactUnlessUi('Alex Rivera')).toBe('‹text, 11 chars›');
    expect(redactUnlessUi('')).toBeUndefined();
  });
});
