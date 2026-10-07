/**
 * sounds.js
 * Efeitos sonoros gerados por síntese (Web Audio API)  sem arquivos de
 * áudio externos, funciona 100% offline e sem depender de licenciamento
 * de sons de terceiros.
 */
const Sounds = (function () {
  let ctx = null;

  function getCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone(freq, startTime, duration, opts = {}) {
    const c = getCtx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = opts.type || "sine";
    osc.frequency.setValueAtTime(freq, startTime);
    const peak = opts.peak != null ? opts.peak : 0.22;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(peak, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain).connect(c.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.03);
  }

  /** Toca ao iniciar cada jogo  arpejo curto e animado. */
  function playStart() {
    try {
      const c = getCtx();
      const t = c.currentTime;
      tone(392.0, t, 0.13, { type: "triangle" });        // Sol4
      tone(523.25, t + 0.11, 0.13, { type: "triangle" }); // Dó5
      tone(659.25, t + 0.22, 0.24, { type: "triangle" }); // Mi5
    } catch (e) { /* áudio indisponível  segue sem som */ }
  }

  /** Toca em respostas corretas  "ding" agudo e alegre. */
  function playCorrect() {
    try {
      const c = getCtx();
      const t = c.currentTime;
      tone(659.25, t, 0.11, { type: "sine", peak: 0.26 });      // Mi5
      tone(880.0, t + 0.09, 0.2, { type: "sine", peak: 0.26 }); // Lá5
    } catch (e) { /* noop */ }
  }

  /** Toca em respostas erradas  som curto e grave, nada assustador. */
  function playWrong() {
    try {
      const c = getCtx();
      const t = c.currentTime;
      tone(233.0, t, 0.15, { type: "sawtooth", peak: 0.14 });
      tone(185.0, t + 0.12, 0.2, { type: "sawtooth", peak: 0.14 });
    } catch (e) { /* noop */ }
  }

  /** Toca quando o tempo se esgota  três bipes iguais. */
  function playTimeout() {
    try {
      const c = getCtx();
      const t = c.currentTime;
      tone(300, t, 0.1, { type: "square", peak: 0.13 });
      tone(300, t + 0.16, 0.1, { type: "square", peak: 0.13 });
      tone(300, t + 0.32, 0.16, { type: "square", peak: 0.13 });
    } catch (e) { /* noop */ }
  }

  /** Escala usada no Jogo 2 (Caminho do Tesouro)  cada bloco tem sua nota. */
  const NOTE_SCALE = [523.25, 587.33, 659.25, 698.46, 783.99, 880.0, 987.77, 1046.5, 1174.66];

  /** Toca a nota associada a um bloco (0-8)  usada ao mostrar e ao clicar na sequência. */
  function playNote(index) {
    try {
      const freq = NOTE_SCALE[((index % NOTE_SCALE.length) + NOTE_SCALE.length) % NOTE_SCALE.length];
      tone(freq, getCtx().currentTime, 0.24, { type: "triangle", peak: 0.2 });
    } catch (e) { /* noop */ }
  }

  /** Bipe curto usado na contagem regressiva da tela de apresentação (últimos 10s). */
  function playCountdownTick() {
    try {
      tone(440, getCtx().currentTime, 0.09, { type: "square", peak: 0.14 });
    } catch (e) { /* noop */ }
  }

  /** Nova paleta de cores liberada no Jogo 1  pequeno "flourish" de 2 notas. */
  function playPaletteChange() {
    try {
      const c = getCtx();
      const t = c.currentTime;
      tone(523.25, t, 0.12, { type: "triangle", peak: 0.22 });
      tone(783.99, t + 0.1, 0.2, { type: "triangle", peak: 0.22 });
    } catch (e) { /* noop */ }
  }

  return { playStart, playCorrect, playWrong, playTimeout, playNote, playCountdownTick, playPaletteChange, getCtx };
})();
