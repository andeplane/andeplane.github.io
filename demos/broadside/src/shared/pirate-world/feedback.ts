import './feedback.css';

/** Native dialog supplies focus containment and restores focus when it closes. */
export function showWorldError(message:string,onBack:()=>void):()=>void {
  const previous=document.activeElement as HTMLElement|null;
  const dialog=document.createElement('dialog');dialog.className='pirate-world-error';
  const title=document.createElement('h2');title.id='pirate-world-error-title';title.textContent='Treasure view paused';
  const text=document.createElement('p');
  text.textContent=/sav(e|ed|ing)|storage/i.test(message)
    ? "Your chest couldn't be saved. It stays safely aboard. Return to the menu and try again."
    : "The treasure view couldn't finish loading. Any unopened chests stay aboard. Return to the menu and try again.";
  const back=document.createElement('button');back.textContent='Back to menu';
  dialog.setAttribute('aria-labelledby',title.id);dialog.append(title,text,back);document.body.append(dialog);
  const dispose=()=>{dialog.close();dialog.remove();if(previous?.isConnected)previous.focus();};
  const leave=()=>{dispose();onBack();};
  back.onclick=leave;dialog.addEventListener('cancel',event=>{event.preventDefault();leave();});
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)leave();});
  dialog.showModal();back.focus();return dispose;
}
