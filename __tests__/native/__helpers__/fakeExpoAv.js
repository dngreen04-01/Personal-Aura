/**
 * expo-av stand-in. Each created sound records whether it is still playing,
 * and createAsync can be held open to reproduce slow sound loading.
 */
const sounds = [];
let holdLoads = false;
let pendingLoads = [];

function makeSound() {
  const sound = {
    playing: true,
    unloaded: false,
    stopAsync: jest.fn(async () => { sound.playing = false; }),
    unloadAsync: jest.fn(async () => { sound.unloaded = true; sound.playing = false; }),
  };
  sounds.push(sound);
  return sound;
}

const Audio = {
  setAudioModeAsync: jest.fn(async () => {}),
  Sound: {
    createAsync: jest.fn(() => {
      if (!holdLoads) return Promise.resolve({ sound: makeSound() });
      return new Promise((resolve) => {
        pendingLoads.push(() => resolve({ sound: makeSound() }));
      });
    }),
  },
};

module.exports = {
  Audio,
  __state: {
    sounds,
    playingSounds: () => sounds.filter((s) => s.playing),
    holdLoads: (v) => { holdLoads = v; },
    finishLoads: () => { const p = pendingLoads; pendingLoads = []; p.forEach((f) => f()); },
    reset: () => { sounds.length = 0; holdLoads = false; pendingLoads = []; },
  },
};
