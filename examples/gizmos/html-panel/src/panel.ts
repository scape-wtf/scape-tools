/** Bundled interface: all assets are inline; only guesses cross the public bridge. */
export const panelHtml = `<style>
:root{color-scheme:dark;font:14px/1.5 system-ui,sans-serif;--base:#101010;--raised:#202020;--line:#444;--text:#fafafa;--muted:#aaa;--action:#faff00;--success:#80e6b1;background:var(--base);color:var(--text)}
*{box-sizing:border-box}body{margin:0;padding:20px}main{max-width:650px;margin:auto}h1{font-size:26px;line-height:1.15;margin:0 0 8px}p{margin:0;color:var(--muted)}header{margin-bottom:20px}.layout{display:grid;grid-template-columns:1fr 220px;gap:24px}
.clues{margin:18px 0;padding:0;list-style:none;display:grid;gap:12px}.clues li{display:flex;align-items:center;gap:12px}.mark{display:grid;place-items:center;flex:0 0 40px;height:40px;background:var(--raised);border-radius:10px;font-size:24px}.clues span:last-child{color:var(--muted)}.clues strong{display:block;color:var(--text);font-weight:500}
.output{border-top:1px solid var(--line);padding-top:12px;font-size:12px;display:flex;align-items:center;gap:8px}.led{width:8px;height:8px;background:var(--muted);border-radius:50%;flex-shrink:0}body[data-solved=true] .led{background:var(--success)}body[data-solved=true] #output{color:var(--success)}
label{display:block;margin-bottom:8px}input{width:100%;height:56px;background:var(--raised);color:var(--text);border:1px solid var(--line);border-radius:12px;text-align:center;font:28px ui-monospace,monospace;letter-spacing:10px;padding-left:16px}input::placeholder{color:var(--muted)}.keys{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}button{font:500 16px system-ui;color:var(--text);background:var(--raised);border:1px solid var(--line);border-radius:10px;min-height:44px;cursor:pointer}button:active:not(:disabled){transform:translateY(1px)}button:disabled{color:var(--muted);cursor:default}button:focus-visible,input:focus-visible{outline:2px solid var(--action);outline-offset:3px}.small{font-size:12px}#submit{width:100%;background:var(--action);color:var(--base);border:0;font-size:14px;font-weight:650;box-shadow:0 3px 0 #848700}#submit:disabled{background:var(--raised);color:var(--muted);box-shadow:none}#status{min-height:42px;margin-top:14px}body[data-solved=true] #status{color:var(--success)}
@media(hover:hover) and (pointer:fine){button:hover:not(:disabled){filter:brightness(1.15)}}@media(max-width:480px){body{padding:16px}.layout{grid-template-columns:1fr;gap:20px}.clues{grid-template-columns:1fr 1fr;gap:12px 8px}.clues li{gap:8px}.mark{flex-basis:32px;height:36px}.clues span:last-child{font-size:12px}}@media(prefers-reduced-motion:reduce){button:active:not(:disabled){transform:none}}@media(prefers-contrast:more){:root{--line:#aaa;--muted:#ddd}}
</style>
<main><header><h1>Restore the signal</h1><p>Four clues. Four digits. One shared solution.</p></header>
<div class="layout"><section aria-label="Code clues"><p>Read the clues in order.</p><ol class="clues">
<li><span class="mark" aria-hidden="true">△</span><span><strong>Triangle</strong>Count its sides.</span></li>
<li><span class="mark" aria-hidden="true">●</span><span><strong>A single point</strong>Count the dot.</span></li>
<li><span class="mark" aria-hidden="true">□</span><span><strong>Square</strong>Count its sides.</span></li>
<li><span class="mark" aria-hidden="true">Ⅱ</span><span><strong>A pair</strong>Count the lines.</span></li>
</ol><div class="output"><span class="led" aria-hidden="true"></span><span id="output">Output inactive</span></div><p class="small">Solve to power anything wired to this terminal’s Solved output.</p></section>
<section aria-label="Enter solution"><label for="code">Four-digit code</label><input id="code" inputmode="numeric" maxlength="4" autocomplete="off" spellcheck="false" placeholder="····" disabled>
<div class="keys" aria-label="Keypad"><button data-digit="1" disabled>1</button><button data-digit="2" disabled>2</button><button data-digit="3" disabled>3</button><button data-digit="4" disabled>4</button><button data-digit="5" disabled>5</button><button data-digit="6" disabled>6</button><button data-digit="7" disabled>7</button><button data-digit="8" disabled>8</button><button data-digit="9" disabled>9</button><button id="clear" class="small" disabled>Clear</button><button data-digit="0" disabled>0</button><button id="back" class="small" aria-label="Delete last digit" disabled>Delete</button></div>
<button id="submit" disabled>Send code</button><p id="status" role="status" aria-live="polite">Connecting…</p></section></div></main>
<script>
let port, ready = false, solved = false, pending = false, nextId = 0, requestId;
const code = document.getElementById('code'), submit = document.getElementById('submit');
const status = document.getElementById('status'), digits = document.querySelectorAll('[data-digit]');
const clear = document.getElementById('clear'), back = document.getElementById('back');
function render() {
  const locked = !ready || pending || solved;
  code.disabled = locked;
  for (const key of digits) key.disabled = locked || code.value.length >= 4;
  clear.disabled = back.disabled = locked || !code.value;
  submit.disabled = locked || code.value.length !== 4;
  submit.textContent = solved ? 'Signal restored' : pending ? 'Checking…' : 'Send code';
  document.body.dataset.solved = String(solved);
  document.getElementById('output').textContent = solved ? 'Output active' : 'Output inactive';
  if (solved) status.textContent = 'Solved together. Connected gizmos now have power.';
}
function send() {
  if (submit.disabled || !port) return;
  pending = true; requestId = 'guess-' + (++nextId); status.textContent = 'Checking…'; render();
  port.postMessage({ protocol: 'scape.web.v1', type: 'action', id: requestId, name: 'submit', payload: { code: code.value } });
}
window.addEventListener('message', event => {
  if (event.source !== window.parent || event.data?.protocol !== 'scape.web.v1' ||
      event.data?.type !== 'connect' || event.ports.length !== 1 || port) return;
  port = event.ports[0];
  port.onmessage = ({ data }) => {
    if (data?.protocol !== 'scape.web.v1') return;
    if (data.type === 'context') {
      const wasSolved = solved;
      ready = Array.isArray(data.actions) && data.actions.includes('submit');
      solved = data.data?.solved === true;
      if (wasSolved && !solved) { code.value = ''; status.textContent = 'Puzzle reset. Try again.'; }
      else if (!pending && !solved) status.textContent = ready ? 'Enter the code to restore power.' : 'This terminal is unavailable.';
    }
    if (data.type === 'result' && data.id === requestId) {
      pending = false;
      status.textContent = data.ok ? 'Not quite. Check the clues and try again.' : 'Could not check the code. Try again shortly.';
    }
    render();
  };
  port.start(); render();
});
for (const key of digits) key.addEventListener('click', () => { if (!key.disabled) { code.value += key.dataset.digit; render(); } });
clear.addEventListener('click', () => { code.value = ''; render(); });
back.addEventListener('click', () => { code.value = code.value.slice(0, -1); render(); });
code.addEventListener('input', () => { code.value = code.value.replace(/[^0-9]/g, '').slice(0, 4); render(); });
submit.addEventListener('click', send);
window.addEventListener('keydown', event => {
  if (event.key === 'Escape') port?.postMessage({ protocol: 'scape.web.v1', type: 'close' });
  if (event.key === 'Enter' && event.target === code) { event.preventDefault(); send(); }
});
</script>`;
