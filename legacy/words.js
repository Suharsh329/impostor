const getRandomWord = () => {
  const randomIndex = Math.floor(Math.random() * words.length);
  return words[randomIndex];
};

const words = [
  "apple", "banana", "cherry", "dog", "elephant", "fish", "guitar", "house", "ice", "jacket",
  "kite", "lemon", "mountain", "notebook", "ocean", "piano", "queen", "robot", "sun", "tree",
  "umbrella", "violin", "whale", "xylophone", "yacht", "zebra", "airplane", "bicycle", "camera",
  "dolphin", "eagle", "forest", "grape", "helicopter", "island", "jungle", "kangaroo", "lamp",
  "moon", "nest", "orange", "penguin", "quilt", "rainbow", "star", "tiger", "unicorn", "vase",
  "wolf", "x-ray", "yogurt", "zeppelin", "ant", "bridge", "cloud", "dragon", "engine", "flower",
  "globe", "hat", "igloo", "jewel", "kite", "lion", "mirror", "needle", "octopus", "pencil",
  "quiver", "rocket", "snake", "turtle", "urchin", "vulture", "window", "xenon", "yawn", "zoo",
  "anchor", "book", "candle", "daisy", "earth", "feather", "glove", "hammer", "insect", "jigsaw"
];

export { getRandomWord };