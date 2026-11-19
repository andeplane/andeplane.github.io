import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

const installations = new WeakMap<Document, () => void>();

/** One short tap for an activated button, including dynamically rendered menus. */
export function installButtonHaptics(): () => void {
  const existing = installations.get(document);
  if (existing) return existing;
  const doc = document;
  const activations = new WeakSet<Event>();
  const capture = (event: MouseEvent) => {
    if (!event.isTrusted || event.button !== 0) return;
    const button = event.composedPath().find(node => node instanceof Element && node.matches('button, [role="button"], input[type="button"], input[type="submit"]'));
    if (!(button instanceof Element) || button.matches(":disabled, [data-answer-haptic]") || button.closest('[aria-disabled="true"], [inert]')) return;
    // Remember readiness before an action disables or replaces its own button.
    activations.add(event);
  };
  const activate = (event: MouseEvent) => {
    // Bubble phase lets map-pan suppression discard the click after a drag.
    if (!activations.has(event)) return;
    try {
      if (Capacitor.isNativePlatform()) {
        void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
      } else {
        // Safari has no web vibration API; installed iPhone apps use native haptics.
        navigator.vibrate?.(10);
      }
    } catch { /* Feedback must never interrupt the button's action. */ }
  };
  doc.addEventListener("click", capture, true);
  doc.addEventListener("click", activate);
  const uninstall = () => {
    doc.removeEventListener("click", capture, true);
    doc.removeEventListener("click", activate);
    installations.delete(doc);
  };
  installations.set(doc, uninstall);
  return uninstall;
}

/** The OS plays a brief success gesture or the longer multi-pulse error gesture. */
export function answerHaptic(correct: boolean): void {
  try {
    if (Capacitor.isNativePlatform()) {
      void Haptics.notification({ type: correct ? NotificationType.Success : NotificationType.Error }).catch(() => {});
    } else {
      navigator.vibrate?.(correct ? 25 : [55, 40, 95]);
    }
  } catch { /* Answers remain playable on devices without haptics. */ }
}
