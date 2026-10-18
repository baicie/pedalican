export type Locale = 'en' | 'zh';

type Vars = Record<string, string | number>;
type Listener = (locale: Locale) => void;

const STORAGE_KEY = 'pelican-rider.locale.v1';

const en = {
  'meta.title': 'Pelican Rider — A Coastal Cycling Caper',
  'meta.description':
    'Pelican Rider is a cozy 3D coastal cycling adventure. Ride a very big bike, jump broken roads, collect fish, and reach the lighthouse.',
  'a11y.canvas': 'Pelican Rider game canvas',
  'hud.brandHtml': 'PELICAN<br />RIDER',
  'hud.route': 'COAST ROAD',
  'hud.time': 'TIME',
  'hud.best': 'BEST',
  'hud.score': 'SCORE',
  'hud.fishSuffix': 'fish',
  'hud.health': 'Health',
  'hud.speed': 'SPEED',
  'hud.controlsHtml':
    '<span><kbd>W</kbd><kbd>S</kbd> pedal / brake</span><span><kbd>A</kbd><kbd>D</kbd> steer</span><span><kbd>SPACE</kbd> jump</span><span><kbd>P</kbd> pause</span><span><kbd>M</kbd> mute</span>',
  'hud.gapPrompt': 'GAP AHEAD',
  'hud.fishPrompt': 'FISH ABOVE',
  'hud.distanceUnit': 'm',
  'menu.sticker': 'A COASTAL CYCLING CAPER',
  'menu.titleTop': 'PELICAN',
  'menu.titleBottom': 'RIDER',
  'menu.taglineHtml': 'A long beak. A big bike.<br />One very salty coastline.',
  'menu.start': 'Ride the coast',
  'menu.personalBest': 'PERSONAL BEST',
  'menu.note': 'Collect fish. Hop the gaps. Make it to the lighthouse before the sun dips.',
  'menu.badgeHtml': 'CAPTAIN<br />BEAK',
  'menu.howToRide': 'HOW TO RIDE',
  'menu.keyboard': 'keyboard',
  'menu.control.pedal': 'Pedal faster',
  'menu.control.brake': 'Brake',
  'menu.control.steer': 'Steer left / right',
  'menu.control.lean': 'Lean into turns',
  'menu.control.jump': 'Jump',
  'menu.control.camera': 'Change camera',
  'menu.control.pause': 'Pause',
  'menu.control.restart': 'Restart',
  'menu.control.mute': 'Mute sound',
  'menu.footnote': 'Best enjoyed with a sea breeze and a sturdy helmet.',
  'menu.footerVersion': 'PELICAN RIDER · v1.0',
  'menu.footerControls': 'WASD / ARROWS · SPACE · C · P · R · M',
  'menu.bestScore': '{score} pts{time}',
  'menu.bestEmpty': 'No ride logged yet',
  'pause.kicker': 'CATCHING YOUR BREATH',
  'pause.title': 'Paused',
  'pause.copy': 'The tide can wait. Your fish are safe in the basket.',
  'pause.resume': 'Keep riding',
  'pause.restart': 'Restart ride',
  'pause.menu': 'Exit to menu',
  'pause.tipHtml': '<kbd>P</kbd> or <kbd>ESC</kbd> to resume',
  'result.scoreLabel': 'SCORE',
  'result.fishLabel': 'FISH',
  'result.timeLabel': 'TIME',
  'result.crashesLabel': 'CRASHES',
  'result.victoryTitle': 'Beautiful ride!',
  'result.victoryKicker': 'THE LIGHTHOUSE IS YOURS',
  'result.victoryCopy':
    'You rolled into Pelican Point with {fish} fish and {crashes} {spills} along the way.',
  'result.gameoverTitle': 'Down in the sand',
  'result.gameoverKicker': 'THE TIDE CALLED IT',
  'result.gameoverCopy':
    '{reason} The coast won this round, but the pelican is already dusting off.',
  'result.bestNew': 'NEW PERSONAL BEST',
  'result.bestScore': 'BEST SCORE SO FAR',
  'result.victoryTip': 'Tip: fish chains are worth more. Try a full basket next time.',
  'result.gameoverTip':
    'Tip: brake early, then hop logs and gaps rather than steering at the last moment.',
  'result.again': 'Ride again',
  'result.menu': 'Main menu',
  'camera.chase': 'CHASE CAM',
  'camera.close': 'CLOSE CAM',
  'camera.coast': 'COAST CAM',
  'motion.ready': 'READY',
  'motion.pedaling': 'PEDALING',
  'motion.braking': 'BRAKING',
  'motion.coasting': 'COASTING',
  'motion.airborne': 'AIRBORNE',
  'motion.offtrail': 'OFF TRAIL',
  'motion.paused': 'CATCHING BREATH',
  'motion.tumbling': 'TUMBLING',
  'crash.rock': 'Clipped a boulder — ouch.',
  'crash.log': 'Hugged a log a little too closely.',
  'crash.driftwood': 'The driftwood won that round.',
  'crash.gap': 'Missed the gap — splash!',
  'crash.offroad': 'Wobbled off the trail.',
  'crash.default': 'A little spill on the coast road.',
  'finish.reason': 'The lighthouse is yours.',
  'checkpoint.gullRock': 'GULL ROCK',
  'checkpoint.lighthouseBend': 'LIGHTHOUSE BEND',
  'checkpoint.toast': '{label} checkpoint{healed}',
  'checkpoint.healed': ' · heart refilled',
  'toast.offroad': 'Ease back onto the trail',
  'toast.fish': 'Fish +{points}{multiplier}',
  'toast.recover': 'Up you get — back on the saddle',
  'toast.soundOn': 'Sound on',
  'toast.soundOff': 'Sound off',
  'device.kicker': 'A DESKTOP RIDE',
  'device.title': 'Grab a keyboard.',
  'device.copyHtml':
    'Pelican Rider is steered with <strong>WASD</strong> or the arrow keys, jumps with <strong>Space</strong>, and changes camera with <strong>C</strong>.',
  'device.note':
    'Phones and tablets without a keyboard cannot steer the bicycle. Open this page on a laptop or desktop, or connect a keyboard and continue.',
  'device.continue': 'I have a keyboard',
  'loading.text': 'Warming up the bicycle chain…',
  'error.start': 'The bicycle chain slipped. Please refresh the page to try again.',
  'settings.preferences': 'Sound and language',
  'settings.language': 'Language',
  'settings.switchToZh': 'Switch to Chinese',
  'settings.switchToEn': 'Switch to English',
  'settings.soundOn': 'Sound on',
  'settings.soundOff': 'Sound off',
  'settings.mute': 'Mute sound',
  'settings.unmute': 'Unmute sound',
  'settings.sound': 'Sound',
  'settings.languageValueZh': '中文',
  'settings.languageValueEn': 'EN',
} as const;

type MessageKey = keyof typeof en;

const zh: Record<MessageKey, string> = {
  'meta.title': '鹈鹕骑士 — 海岸骑行奇遇',
  'meta.description':
    '《鹈鹕骑士》是一款轻松惬意的 3D 海岸骑行冒险。骑上大自行车，跃过断开的道路，收集小鱼，抵达灯塔。',
  'a11y.canvas': '鹈鹕骑士游戏画面',
  'hud.brandHtml': '鹈鹕<br />骑士',
  'hud.route': '海岸公路',
  'hud.time': '时间',
  'hud.best': '最佳',
  'hud.score': '得分',
  'hud.fishSuffix': '条鱼',
  'hud.health': '生命值',
  'hud.speed': '速度',
  'hud.controlsHtml':
    '<span><kbd>W</kbd><kbd>S</kbd> 踩踏 / 刹车</span><span><kbd>A</kbd><kbd>D</kbd> 转向</span><span><kbd>SPACE</kbd> 跳跃</span><span><kbd>P</kbd> 暂停</span><span><kbd>M</kbd> 静音</span>',
  'hud.gapPrompt': '前方断口',
  'hud.fishPrompt': '上方有鱼',
  'hud.distanceUnit': '米',
  'menu.sticker': '一场海岸骑行奇遇',
  'menu.titleTop': '鹈鹕',
  'menu.titleBottom': '骑士',
  'menu.taglineHtml': '长长的喙。大大的车。<br />一条咸咸的海岸线。',
  'menu.start': '开始骑行',
  'menu.personalBest': '个人最佳',
  'menu.note': '收集小鱼，跃过断口，在太阳落下前抵达灯塔。',
  'menu.badgeHtml': '大嘴<br />船长',
  'menu.howToRide': '骑行指南',
  'menu.keyboard': '键盘',
  'menu.control.pedal': '加速踩踏',
  'menu.control.brake': '刹车',
  'menu.control.steer': '左右转向',
  'menu.control.lean': '倾斜过弯',
  'menu.control.jump': '跳跃',
  'menu.control.camera': '切换镜头',
  'menu.control.pause': '暂停',
  'menu.control.restart': '重新开始',
  'menu.control.mute': '静音',
  'menu.footnote': '配上一阵海风和结实的头盔，风味更佳。',
  'menu.footerVersion': '鹈鹕骑士 · v1.0',
  'menu.footerControls': 'WASD / 方向键 · SPACE · C · P · R · M',
  'menu.bestScore': '{score} 分{time}',
  'menu.bestEmpty': '暂无骑行记录',
  'pause.kicker': '稍作喘息',
  'pause.title': '已暂停',
  'pause.copy': '潮水会等的。你的小鱼已经安全放进车筐。',
  'pause.resume': '继续骑行',
  'pause.restart': '重新开始',
  'pause.menu': '返回主菜单',
  'pause.tipHtml': '按 <kbd>P</kbd> 或 <kbd>ESC</kbd> 继续',
  'result.scoreLabel': '得分',
  'result.fishLabel': '小鱼',
  'result.timeLabel': '时间',
  'result.crashesLabel': '摔倒',
  'result.victoryTitle': '漂亮的骑行！',
  'result.victoryKicker': '灯塔已抵达',
  'result.victoryCopy': '你带着 {fish} 条鱼和 {crashes} 次摔倒抵达了鹈鹕角。',
  'result.gameoverTitle': '摔进沙里了',
  'result.gameoverKicker': '潮水收工了',
  'result.gameoverCopy': '{reason} 海岸赢下了这一局，不过鹈鹕已经拍掉身上的沙子了。',
  'result.bestNew': '新的个人最佳',
  'result.bestScore': '目前最佳得分',
  'result.victoryTip': '提示：连续吃鱼分数更高，下次试试装满一车筐。',
  'result.gameoverTip': '提示：提前刹车，用跳跃越过木桩和断口，别到最后才打方向。',
  'result.again': '再骑一次',
  'result.menu': '返回主菜单',
  'camera.chase': '追逐视角',
  'camera.close': '近景视角',
  'camera.coast': '海岸视角',
  'motion.ready': '准备',
  'motion.pedaling': '踩踏中',
  'motion.braking': '刹车中',
  'motion.coasting': '滑行',
  'motion.airborne': '腾空',
  'motion.offtrail': '偏离赛道',
  'motion.paused': '喘口气',
  'motion.tumbling': '翻滚中',
  'crash.rock': '撞上巨石了——好痛。',
  'crash.log': '和木桩抱得太紧了。',
  'crash.driftwood': '漂流木赢了这一回合。',
  'crash.gap': '没跨过断口——扑通！',
  'crash.offroad': '摇摇晃晃冲出了赛道。',
  'crash.default': '在海岸路上小小摔了一跤。',
  'finish.reason': '灯塔归你了。',
  'checkpoint.gullRock': '海鸥岩',
  'checkpoint.lighthouseBend': '灯塔湾',
  'checkpoint.toast': '{label}检查点{healed}',
  'checkpoint.healed': ' · 恢复一颗心',
  'toast.offroad': '回到赛道上来',
  'toast.fish': '小鱼 +{points}{multiplier}',
  'toast.recover': '起来吧——回到车座上',
  'toast.soundOn': '声音已开启',
  'toast.soundOff': '声音已关闭',
  'device.kicker': '桌面端骑行',
  'device.title': '先准备一个键盘。',
  'device.copyHtml':
    '《鹈鹕骑士》使用 <strong>WASD</strong> 或方向键控制方向，<strong>空格键</strong> 跳跃，<strong>C</strong> 切换镜头。',
  'device.note':
    '没有键盘的手机或平板无法控制自行车。请换到笔记本电脑或台式机，或连接键盘后继续。',
  'device.continue': '我已连接键盘',
  'loading.text': '正在给自行车链条上油…',
  'error.start': '自行车链条滑了。请刷新页面重试。',
  'settings.preferences': '音效与语言',
  'settings.language': '语言',
  'settings.switchToZh': '切换到中文',
  'settings.switchToEn': '切换到英文',
  'settings.soundOn': '声音开',
  'settings.soundOff': '声音关',
  'settings.mute': '关闭音效',
  'settings.unmute': '开启音效',
  'settings.sound': '音效',
  'settings.languageValueZh': '中文',
  'settings.languageValueEn': 'EN',
};

const dictionaries: Record<Locale, Record<MessageKey, string>> = { en, zh };
const listeners = new Set<Listener>();

let locale: Locale = detectLocale();

function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'zh') return saved;
  } catch {
    // Storage can be unavailable in private context.
  }
  // Pelican Rider ships in Chinese by default. English remains available via
  // the visible language control, and an explicit saved choice is respected.
  return 'zh';
}

export function getLocale(): Locale {
  return locale;
}

export function t(key: MessageKey, vars: Vars = {}): string {
  const template = dictionaries[locale][key] ?? en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] !== undefined ? String(vars[name]) : `{${name}}`,
  );
}

export function translateCheckpoint(label: string): string {
  if (label === 'GULL ROCK') return t('checkpoint.gullRock');
  if (label === 'LIGHTHOUSE BEND') return t('checkpoint.lighthouseBend');
  return label;
}

export function setLocale(next: Locale, persist = true): void {
  const changed = next !== locale;
  locale = next;
  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Keep the in-memory language when storage is blocked.
    }
  }
  applyDocumentLocale();
  if (changed) {
    for (const listener of listeners) listener(locale);
  }
}

export function toggleLocale(): Locale {
  setLocale(locale === 'en' ? 'zh' : 'en');
  return locale;
}

export function onLocaleChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function initI18n(): void {
  applyDocumentLocale();
}

function applyDocumentLocale(): void {
  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  document.title = t('meta.title');
  const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (description) description.content = t('meta.description');

  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((element) => {
    const key = element.dataset.i18n as MessageKey | undefined;
    if (key) element.textContent = t(key);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-html]').forEach((element) => {
    const key = element.dataset.i18nHtml as MessageKey | undefined;
    if (key) element.innerHTML = t(key);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-aria-label]').forEach((element) => {
    const key = element.dataset.i18nAriaLabel as MessageKey | undefined;
    if (key) element.setAttribute('aria-label', t(key));
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((element) => {
    const key = element.dataset.i18nTitle as MessageKey | undefined;
    if (key) element.setAttribute('title', t(key));
  });
}
