const MASCOT_VERBS = [
  'Vibing',
  'Slaying',
  'Cooking',
  'Grinding',
  'Manifesting',
  'Ghosting',
  'Flexing',
  'Streaming',
  'Hustling',
  'Glazing',
  'Mogging',
  'Coping',
  'Rizzing',
  'Finessing',
  'Fumbling',
  'Binging',
  'Canceling',
  'Yoinking',
  'Simping',
  'Dooming',
];

let verbIndex = Math.floor(Math.random() * MASCOT_VERBS.length);

export const formatStreamingElapsed = (elapsedMs: number) => {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString()}:${seconds.toString().padStart(2, '0')}`;
};

export const nextStreamingVerb = () => {
  verbIndex = (verbIndex + 1) % MASCOT_VERBS.length;
  return MASCOT_VERBS[verbIndex];
};
