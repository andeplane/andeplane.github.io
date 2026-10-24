import "./privacy.css";

export const privacyContent = `<p>Updated 24 October 2026 · Anders Hafreager</p>
<h2>Your game stays on your device</h2><p>Broadside and Captain Calculus do not require an account. We do not collect or transmit your name, contact details, location, identifiers, answers or game progress. There are no advertisements, analytics services, tracking or in-app purchases.</p>
<h2>Saved progress</h2><p>Your progress, settings, earned gold and settled treasure positions are saved locally. The installed games work offline. Deleting the app removes its local game data; device backups and restores are managed by Apple under your settings. There is no developer-operated cloud save.</p>
<h2>Purchases and diagnostics</h2><p>Apple handles your App Store purchase and may process store or device diagnostics under its own privacy settings and policies. We do not receive your payment details.</p>
<h2>Children and support</h2><p>We do not knowingly collect personal information from children. If you contact us voluntarily, use only the information needed to describe the problem. A parent or guardian can find support at andeplane.github.io/demos/broadside/support.html. Never include a child's full name, passwords or payment details.</p>`;

/** Native modal supplies focus containment and Escape; backdrop clicks also close it. */
export function installPrivacy(): void {
  if (document.querySelector('#game-privacy')) return;
  const dialog=document.createElement('dialog');dialog.id='game-privacy';dialog.className='game-privacy';
  dialog.setAttribute('aria-labelledby','game-privacy-title');
  dialog.innerHTML=`<div class="privacy-header"><h1 id="game-privacy-title">Privacy & support</h1><button type="button" aria-label="Close privacy and support">Close</button></div><div class="privacy-copy">${privacyContent}</div>`;
  document.body.append(dialog);
  dialog.querySelector('button')!.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  document.addEventListener('keydown',event=>{if(dialog.open&&event.key==='Escape')event.stopImmediatePropagation();},true);
  document.addEventListener('click',event=>{
    if((event.target as Element).closest('[data-open-privacy]')){event.preventDefault();dialog.showModal();}
  });
}
