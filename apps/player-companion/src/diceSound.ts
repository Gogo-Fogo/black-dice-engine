export function playDiceRollSound() {
  const   audio = new Audio("./audio/dice-roll.mp3");
  const duration = 23;
  const segmentLength = 1.5 + Math.random() * 1.5;
  const startTime = Math.random() * (duration - segmentLength);
  audio.currentTime = startTime;
  audio.play().catch(() => {});
  setTimeout(() => { if (!audio.paused) audio.pause(); }, segmentLength * 1000);
}
