/* 萤火小径 · Firefly Trail — text in 中文 / English */
(function () {
  'use strict';
  const FT = (window.FT = window.FT || {});

  FT.STR = {
    zh: {
      title: '萤火小径',
      subtitle: 'Firefly Trail',
      tagline: '从清晨的花田，慢慢走到夜晚的海边',
      start: '开始漫游',
      cont: '继续旅程',
      newgame: '重新开始',
      dedication: '献给 @_月云，和所有喜欢治愈系画风的你 ♡',
      controlsKey: '← → 移动　空格 跳跃（按住滑翔）　E 互动　↓ 坐下看风景',
      controlsTouch: '左边按钮走路 · 右边跳跃（按住滑翔）/ 互动 / 坐下',
      landscape: '横屏体验更佳',
      needMotes: '还需要 {n} 个微光',
      lanternHint: '用 3 个微光点亮它',
      lighthouseWait: '灯塔在等五盏灯笼亮起（{n}/5）',
      lighthouseReady: '点亮灯塔吧',
      tapContinue: '点击继续',
      keepWandering: '继续漫游',
      sign: '灯塔 →',
      lit: '已点亮',
      zones: [
        ['花田', '清晨'],
        ['樱花坡', '上午'],
        ['镜湖', '午后'],
        ['黄昏森林', '日落'],
        ['雪原', '入夜'],
        ['星海岸', '夜'],
      ],
      thoughts: ['风好舒服……', '云在慢慢地走。', '就这样，待一会儿吧。', '今天也有好好呼吸呢。', '远处好像有人在唱歌。', '心里安静下来了。'],
      sound: '声音',
      lang: 'EN',
    },
    en: {
      title: 'Firefly Trail',
      subtitle: '萤火小径',
      tagline: 'A slow little walk from a morning meadow to a night-time sea',
      start: 'Start wandering',
      cont: 'Continue',
      newgame: 'New journey',
      dedication: 'For @_月云, and everyone who loves a gentle art style ♡',
      controlsKey: '← → walk   Space jump (hold to glide)   E interact   ↓ sit & watch',
      controlsTouch: 'Left: walk · Right: jump (hold to glide) / interact / sit',
      landscape: 'Best in landscape',
      needMotes: 'Needs {n} more glimmers',
      lanternHint: 'Light it with 3 glimmers',
      lighthouseWait: 'The lighthouse waits for five lanterns ({n}/5)',
      lighthouseReady: 'Light the lighthouse',
      tapContinue: 'Tap to continue',
      keepWandering: 'Keep wandering',
      sign: 'Lighthouse →',
      lit: 'Lit',
      zones: [
        ['Flower Meadow', 'Morning'],
        ['Blossom Hill', 'Late morning'],
        ['Mirror Lake', 'Afternoon'],
        ['Twilight Woods', 'Sunset'],
        ['Snowfield', 'Dusk'],
        ['Starlit Shore', 'Night'],
      ],
      thoughts: ['The breeze feels nice…', 'The clouds are taking their time.', "Let's just stay a little while.", 'I remembered to breathe today.', 'Someone is singing far away.', 'It feels quiet inside.'],
      sound: 'Sound',
      lang: '中',
    },
  };

  // Creatures you meet along the way: [first line, line after you pet them]
  FT.NPC_LINES = {
    cat: {
      zh: ['呼噜……今天的阳光，好暖。', '喵～再摸一下也可以哦。'],
      en: ['Purr… the sun is so warm today.', 'Mew~ you may pet me once more.'],
    },
    fawn: {
      zh: ['花会落下，也会再开的。', '你的手好温柔。'],
      en: ['Petals fall, and bloom again.', 'Your hands are so gentle.'],
    },
    frog: {
      zh: ['累了就坐下来，看看水吧。', '呱～水面在发光呢。'],
      en: ["When you're tired, sit and watch the water.", 'Ribbit~ the water is shining.'],
    },
    fox: {
      zh: ['走慢一点也没关系，路会等你。', '嘿嘿，尾巴借你抱一下。'],
      en: ["It's okay to walk slowly. The path will wait.", 'Hehe, you can hug my tail.'],
    },
    rabbit: {
      zh: ['冷的时候，就想想喜欢的东西。', '我在想……热可可！'],
      en: ["When it's cold, think of things you love.", "I'm thinking of… hot cocoa!"],
    },
    crab: {
      zh: ['灯塔就在前面，横着走也能到哦。', '咔嚓咔嚓～晚安。'],
      en: ["The lighthouse is just ahead. Even sideways, you'll get there.", 'Click-clack~ good night.'],
    },
  };

  // Postcards revealed by each lantern
  FT.CARDS = [
    { zh: ['第一盏灯 · 花田', '今天也辛苦了。\n允许自己，慢一点。'], en: ['First lantern · Meadow', "You did well today.\nIt's okay to slow down."] },
    { zh: ['第二盏灯 · 樱花坡', '花会落下，也会再开。\n你也一样。'], en: ['Second lantern · Blossom Hill', 'Flowers fall, and bloom again.\nSo will you.'] },
    { zh: ['第三盏灯 · 镜湖', '风会记得，\n你走过的每一条路。'], en: ['Third lantern · Mirror Lake', "The wind remembers\nevery path you've walked."] },
    { zh: ['第四盏灯 · 黄昏森林', '不必一直发光，\n休息也是很好的事。'], en: ['Fourth lantern · Twilight Woods', "You don't have to shine all the time.\nResting is good, too."] },
    { zh: ['第五盏灯 · 雪原', '雪落下的声音，\n是世界在轻轻说晚安。'], en: ['Fifth lantern · Snowfield', 'Falling snow is the world\nsoftly saying goodnight.'] },
  ];
  FT.ENDING = {
    zh: ['灯塔亮了', '谢谢你，陪我走到这里。\n愿你今晚好梦，\n明天也被温柔以待。'],
    en: ['The lighthouse is lit', 'Thank you for walking with me all this way.\nSweet dreams tonight —\nmay tomorrow be gentle with you.'],
  };
})();
