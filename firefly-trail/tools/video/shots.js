// The demo video, shot by shot.
//   actions: [time, 'down'|'up'|'press'|'eval', key or JS]   (negative times run during the unrecorded preroll)
//   seq:     [condition, type, key] steps run in order; a condition is JS using p (player), G, t,
//            or a number = seconds after the previous step
//   perFrame: JS run every frame (here: keep a gentle walking pace instead of breaking into a run)
//   setup:    JS run once after the page loads
const R = 'ArrowRight', L = 'ArrowLeft', J = 'Space', E = 'KeyE', D = 'ArrowDown';
const WALK = 'FT.G.player.holdT = 0';
const NO_TOAST = "document.getElementById('toast').style.visibility = 'hidden'";
const TOAST_OUT = "document.getElementById('toast').classList.remove('show')";

// climbing the cherry tree (used by the opening hook and the blossom shot)
const BLOSSOM_SEQ = [
  ['p.x >= 5118', 'down', J], ['p.vy > 0', 'up', J],
  ['p.onPlat && p.x >= 5276', 'down', J], ['p.vy > 0', 'up', J],
  ['p.onPlat && p.onPlat.y < -150', 'up', R], [0.25, 'down', J], ['p.vy > 0', 'down', R], [1.6, 'up', J], ['p.grounded', 'up', R],
];

module.exports = [
  {
    // cold open: the leaf-umbrella glide from the top of the cherry tree, under the commenter's quote
    id: 'hook', query: 'play&x=4960&lit=1&motes=2', preroll: 4.0, dur: 3.2, perFrame: WALK, setup: NO_TOAST,
    actions: [[-3.0, 'down', R]],
    seq: BLOSSOM_SEQ,
  },
  {
    // leave home, catch two glimmers, the sleepy cat says hi, then a pet
    id: 'meadow', query: 'play&x=400', preroll: 1, dur: 8.0,
    actions: [[-0.6, 'down', R]],
    seq: [['p.x >= 1190', 'down', J], ['p.vy > 0', 'up', J], ['p.x >= 1478', 'up', R], [1.9, 'press', E]],
  },
  {
    // climb the cherry tree branch by branch, grab the glimmer at the top, glide down through the petals
    id: 'blossom', query: 'play&x=4960&lit=1&motes=2', preroll: 1, dur: 6.6, perFrame: WALK,
    actions: [[0, 'down', R]],
    seq: BLOSSOM_SEQ,
  },
  {
    // stroll over the bridge, hop for glimmers above the water, the frog has a gentle word
    id: 'lake', query: 'play&x=7960&lit=2&motes=1', preroll: 1, dur: 7.0, perFrame: WALK,
    actions: [[-0.6, 'down', R]],
    seq: [
      ['p.x >= 8278', 'down', J], ['p.vy > 0', 'up', J],
      ['p.grounded && p.x >= 8478', 'down', J], ['p.vy > 0', 'up', J],
      ['p.grounded && p.x >= 8778', 'down', J], ['p.vy > 0', 'up', J],
      ['p.grounded', 'up', R],
    ],
  },
  {
    // three glimmers fly into the stone lantern and the flowers bloom (no postcard in the video)
    id: 'lantern', query: 'play&x=9560&lit=2&motes=3', preroll: 2.2, dur: 4.0, perFrame: WALK, setup: NO_TOAST,
    actions: [[-1.0, 'down', R]],
    seq: [['p.x >= 9712', 'up', R], [0.45, 'press', E], ['G.pendingCard', 'eval', 'FT.G.pendingCard = null']],
  },
  {
    // bounce on the giant mushroom, glide under a leaf through the fireflies, meet the fox
    id: 'forest', query: 'play&x=10600&lit=3&motes=1', preroll: 1, dur: 8.0, perFrame: WALK,
    actions: [[0, 'down', R], [0.5, 'eval', TOAST_OUT]],
    seq: [
      ['p.x >= 10758', 'down', J], ['p.vy > 0', 'up', J], ['p.x >= 10862', 'up', R],
      ['p.vy < -700', 'down', J], ['p.vy > -40', 'down', R],
      ['p.x >= 11300', 'up', J], ['p.grounded', 'up', R], [0.15, 'down', R], ['p.x >= 11440', 'up', R],
    ],
  },
  {
    // up the snowy rocks for a glimmer, glide down, then sit and watch the snow
    id: 'snow', query: 'play&x=14040&lit=4&motes=0', preroll: 1, dur: 9.0, perFrame: WALK,
    actions: [[0, 'down', R], [0.5, 'eval', TOAST_OUT]],
    seq: [
      ['p.x >= 14188', 'down', J], ['p.vy > 0', 'up', J],
      ['p.onPlat && p.x >= 14330', 'down', J], ['p.vy > 0', 'up', J],
      ['p.onPlat && p.onPlat.y < -120', 'up', R], [0.25, 'down', J], ['p.vy > 0', 'down', R], [1.5, 'up', J],
      ['p.grounded', 'up', R], [0.5, 'press', D], [0.3, 'eval', 'FT.G.player.sitT = 2.3'],
    ],
  },
  {
    // the last walk to the lighthouse; it lights up, lanterns rise, a whale says hello
    // (the in-game ending card is skipped: the video's own end card follows)
    id: 'finale', query: 'play&x=18830&lit=5&motes=3', preroll: 1, dur: 13.4, perFrame: WALK,
    actions: [[0, 'down', R]],
    seq: [['p.x >= 19050', 'up', R], [0.4, 'press', E], [0.1, 'eval', 'FT.G.ending.card = true'], [5.6, 'eval', "document.getElementById('hud').style.opacity = '0'"]],
  },
];
module.exports.keys = { R, L, J, E, D };
