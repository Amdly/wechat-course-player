import {Bridge} from './bridge.mjs';
import {analyze} from './recognize.mjs';
import {fileURLToPath} from 'node:url';
const bridge = new Bridge(fileURLToPath(new URL('./runtime/inspect/', import.meta.url)));
let snapshot = await bridge.snapshot();
if (process.argv.includes('--hover')) {
  const initial = analyze(snapshot);
  if (initial.kind === 'player') {
    await bridge.input(snapshot, 'hover', initial.hover);
    snapshot = await bridge.snapshot();
  }
}
const page = analyze(snapshot);
console.log(JSON.stringify({...page, text: undefined, lines: undefined, glyph: snapshot.glyph}, null, 2));
