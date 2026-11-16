/**
 * Interface-vocabulary allowlist.
 *
 * Page reports (and the M2 LLM skeleton) keep a label or text only when it is made entirely of
 * common interface words ("Search", "Log out", "Hide sidebar", "我的账户"). Anything else (chat
 * titles, people's names, team names) is replaced by a placeholder. This avoids having to
 * recognize sensitive content: it simply never qualifies.
 */

const EN_WORDS = `
a about account accounts activity add address all an and app apps archive archived artifacts as at
back bag basket billing block bookmarks browse button by
calendar cancel cart change chat chats check checkout clear close code collapse command community
compose connectors contact content continue copy create customize
dark dashboard default delete design dictate discover dismiss docs done download downloads
edit email empty english enter expand explore extensions
favorites feed feedback file files filter find follow followers following for forward free from
get go group groups guide
help hide history home
in inbox incognito info information issues it item items
join k keyboard
language learn library light like link links list load log login logout
mail main manage me media menu message messages microphone mode model more my
navigate navigation new next no notification notifications now
of off on open options or order orders other out overview
page pages panel password pause permission pin pinned play plans plugins policy preferences
premium previous privacy profile projects public pull pulls
read recent recents refresh register related reload remove reply repos repositories reset
resize results return
save saved saves schedule scheduled search security see select send session sessions settings
share shift shop shopping show sidebar sign signin signout skip sort start status store
subscribe subscriptions support switch
tab tabs task tasks team teams template terms the theme to toggle tools top trending type
undo unpin up update upgrade upload us use user users
view voice
watch wishlist with workspace write
you your yours
`;

const ZH_TERMS = [
  '个人资料', '个人中心', '侧边栏', '购物车', '个人', '资料', '登录', '登入', '登出', '退出', '注销', '注册',
  '账户', '账号', '帐户', '帐号', '搜索', '查找', '设置', '首页', '主页', '菜单', '我的', '消息', '通知',
  '订单', '帮助', '更多', '新建', '打开', '关闭', '隐藏', '显示', '用户', '切换', '语言', '收藏', '历史',
  '记录', '返回', '分享', '上传', '下载', '会员', '管理',
];

const EN = new Set(EN_WORDS.split(/\s+/).filter(Boolean));
const ZH = [...ZH_TERMS].sort((a, b) => b.length - a.length);
const CJK = /[㐀-鿿豈-﫿]/;

/** Strips zero-width and private-use characters (icon-font glyphs) that sit invisibly in labels. */
export function stripInvisible(value: string): string {
  return value.replace(/[​-‍⁠﻿-]/g, '');
}

function cjkIsVocabulary(run: string): boolean {
  let rest = run;
  for (const term of ZH) rest = rest.split(term).join('');
  return rest.length === 0;
}

/** True when every word in `value` is interface vocabulary (digits and single letters allowed). */
export function isUiText(value: string | null | undefined): boolean {
  const raw = stripInvisible(value ?? '').trim();
  if (!raw) return false;
  // "SearchCommandK" → "Search Command K"
  const spaced = raw.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
  const tokens = spaced.toLowerCase().match(/[㐀-鿿豈-﫿]+|[\p{L}\p{N}]+/gu) ?? [];
  if (tokens.length === 0) return false;
  return tokens.every((t) => {
    if (CJK.test(t)) return cjkIsVocabulary(t);
    if (/^\d+$/.test(t) || t.length === 1) return true;
    return EN.has(t);
  });
}

/** The label itself when it is interface vocabulary, otherwise a placeholder that keeps only its length. */
export function redactUnlessUi(value: string | null | undefined): string | undefined {
  const trimmed = (value ?? '').replace(/\s+/g, ' ').trim();
  if (!trimmed) return undefined;
  return isUiText(trimmed) ? trimmed : `‹text, ${[...trimmed].length} chars›`;
}
