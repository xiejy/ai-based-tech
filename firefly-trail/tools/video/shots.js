// The demo video, shot by shot.
//   actions: [time, 'down'|'up'|'press'|'eval', key or JS]   (negative times run during the unrecorded preroll)
//   seq:     [condition, type, key] steps run in order; a condition is JS using p (player), G, t,
//            or a number = seconds after the previous step
//   perFrame: JS run every frame (here: keep a gentle walking pace instead of breaking into a run)
const R = 'ArrowRight', L = 'ArrowLeft', J = 'Space', E = 'KeyE', D = 'ArrowDown';
const WALK = 'FT.G.player.holdT = 0';

module.exports = [
  { id: 'title', query: '', preroll: 0.5, dur: 4.2, setup: 'FT.G.titleX = 330' },
  {
    // leave home, catch two glimmers, pet the sleepy cat
    id: 'meadow', query: 'play&x=400', preroll: 1, dur: 7.6,
    actions: [[0, 'down', R]],
    seq: [['p.x >= 1112', 'down', J], ['p.vy > 0', 'up', J], ['p.x >= 1478', 'up', R], [0.45, 'press', E]],
  },
  {
    // climb the cherry tree branch by branch, grab the glimmer at the top, glide down through the petals
    id: 'blossom', query: 'play&x=4960&lit=1&motes=2', preroll: 1, dur: 7.6, perFrame: WALK,
    actions: [[0, 'down', R]],
    seq: [
      ['p.x >= 5118', 'down', J], ['p.vy > 0', 'up', J],
      ['p.onPlat && p.x >= 5276', 'down', J], ['p.vy > 0', 'up', J],
      ['p.onPlat && p.onPlat.y < -150', 'up', R], [0.25, 'down', J], ['p.vy > 0', 'down', R], [1.6, 'up', J], ['p.grounded', 'up', R],
    ],
  },
  {
    // stroll over the bridge, hop for glimmers above the water, say hi to the frog
    id: 'lake', query: 'play&x=7960&lit=2&motes=1', preroll: 1, dur: 8, perFrame: WALK,
    actions: [[-0.6, 'down', R]],
    seq: [
      ['p.x >= 8278', 'down', J], ['p.vy > 0', 'up', J],
      ['p.grounded && p.x >= 8478', 'down', J], ['p.vy > 0', 'up', J],
      ['p.grounded && p.x >= 8778', 'down', J], ['p.vy > 0', 'up', J],
      ['p.grounded', 'up', R], [0.55, 'press', E],
    ],
  },
  {
    // three glimmers fly into the stone lantern, flowers bloom, a postcard arrives
    id: 'lantern', query: 'play&x=9560&lit=2&motes=3', preroll: 1.2, dur: 7, perFrame: WALK,
    actions: [[0, 'down', R]],
    seq: [['p.x >= 9712', 'up', R], [0.45, 'press', E]],
  },
  {
    // bounce on the giant mushroom, glide under a leaf through the fireflies, meet the fox
    id: 'forest', query: 'play&x=10600&lit=3&motes=1', preroll: 1, dur: 8.2, perFrame: WALK,
    actions: [[0, 'down', R]],
    seq: [
      ['p.x >= 10758', 'down', J], ['p.vy > 0', 'up', J], ['p.x >= 10862', 'up', R],
      ['p.vy < -700', 'down', J], ['p.vy > -40', 'down', R],
      ['p.x >= 11300', 'up', J], ['p.grounded', 'up', R], [0.15, 'down', R], ['p.x >= 11440', 'up', R], [0.4, 'press', E],
    ],
  },
  {
    // up the snowy rocks for a glimmer, glide down, then sit and watch the snow
    id: 'snow', query: 'play&x=14040&lit=4&motes=2', preroll: 1, dur: 11, perFrame: WALK,
    actions: [[0, 'down', R]],
    seq: [
      ['p.x >= 14188', 'down', J], ['p.vy > 0', 'up', J],
      ['p.onPlat && p.x >= 14330', 'down', J], ['p.vy > 0', 'up', J],
      ['p.onPlat && p.onPlat.y < -120', 'up', R], [0.25, 'down', J], ['p.vy > 0', 'down', R], [1.5, 'up', J],
      ['p.grounded', 'up', R], [0.5, 'press', D],
    ],
  },
  {
    // the last walk to the lighthouse; it lights up, lanterns rise, a whale says hello
    id: 'finale', query: 'play&x=18830&lit=5&motes=3', preroll: 1, dur: 18.5, perFrame: WALK,
    actions: [[0, 'down', R]],
    // close the ending card, then keep the lighthouse + sea framing (and the lanterns rising) a little longer
    seq: [['p.x >= 19050', 'up', R], [0.4, 'press', E], [11.0, 'press', E], [0.1, 'eval', 'FT.G.ending.t = 8.5']],
  },
];
module.exports.keys = { R, L, J, E, D };
