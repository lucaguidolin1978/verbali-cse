// Logo dello studio ridisegnato (cerchio diviso dalla croce, quarti alternati pieni e a contorno).
// Versione B (bicolore) per il PDF e i fondi chiari, versione C per i fondi scuri.

const forme = (pieno1, contorno1, pieno2, contorno2, croce, spessore = 4) => `
  <path d="M20 94 A80 80 0 0 1 94 20 L94 40 A60 60 0 0 0 40 94 Z" fill="${pieno1}"/>
  <path d="M110 22 L128 22 L128 76 L178 76 L178 94 L110 94 Z" fill="none" stroke="${contorno1}" stroke-width="${spessore}" stroke-linejoin="round"/>
  <path d="M106 106 L180 106 A80 80 0 0 1 106 180 L106 160 A60 60 0 0 0 158 124 L106 124 Z" fill="${pieno2}"/>
  <path d="M94 180 A80 80 0 0 1 20 106 L40 106 A60 60 0 0 0 94 160 Z" fill="none" stroke="${contorno2}" stroke-width="${spessore}" stroke-linejoin="round"/>
  <path d="M6 100 H194 M100 6 V194" stroke="${croce}" stroke-width="3" stroke-linecap="round"/>`;

export const LOGO_CHIARO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">${forme('#16212B', '#16212B', '#C2410C', '#C2410C', '#16212B')}</svg>`;

export const LOGO_SCURO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200" aria-hidden="true">${forme('#FFFFFF', '#FFFFFF', '#F97316', '#F97316', '#FFFFFF')}</svg>`;
