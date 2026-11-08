import type { ApiInfo, Expiry } from './api';
import { EXPIRY_LABELS } from './api';
import type { Defaults } from './settings';

const VIEW_CHOICES = [1, 2, 3, 5, 10, 0];

export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Run a form action with its submit button disabled, showing any error in the form. */
export function handleForm(form: HTMLFormElement, action: () => Promise<void>): void {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector<HTMLButtonElement>('button[type=submit]');
    const error = form.querySelector<HTMLElement>('[data-error]');
    if (error) error.hidden = true;
    if (button) button.disabled = true;
    try {
      await action();
    } catch (e) {
      if (!error) throw e;
      error.textContent = errorText(e);
      error.hidden = false;
    } finally {
      if (button) button.disabled = false;
    }
  });
}

function option(value: string, label: string, selected: boolean): HTMLOptionElement {
  const element = document.createElement('option');
  element.value = value;
  element.textContent = label;
  element.selected = selected;
  return element;
}

export function fillExpiry(select: HTMLSelectElement, info: ApiInfo | null, selected: Expiry): void {
  const offered = (info?.limits?.expiry_options ?? Object.keys(EXPIRY_LABELS)).filter(
    (value): value is Expiry => value in EXPIRY_LABELS,
  );
  const current = offered.includes(selected) ? selected : (offered.includes('1d') ? '1d' : offered[0]);
  select.replaceChildren(...offered.map((value) => option(value, EXPIRY_LABELS[value], value === current)));
}

export function fillViews(select: HTMLSelectElement, info: ApiInfo | null, selected: number): void {
  const limit = info?.limits?.max_views ?? 100;
  const offered = VIEW_CHOICES.filter((n) => n <= limit);
  const current = offered.includes(selected) ? selected : 1;
  select.replaceChildren(
    ...offered.map((n) =>
      option(String(n), n === 0 ? 'Unlimited' : n === 1 ? '1 (burn after reading)' : String(n), n === current),
    ),
  );
}

export function fillDefaults(info: ApiInfo | null, defaults: Defaults): void {
  document.querySelectorAll<HTMLSelectElement>('select[data-expiry]').forEach((s) => fillExpiry(s, info, defaults.expiry));
  document.querySelectorAll<HTMLSelectElement>('select[data-views]').forEach((s) => fillViews(s, info, defaults.maxViews));
}

export async function copyFrom(id: string, button: HTMLButtonElement): Promise<void> {
  const field = $<HTMLInputElement | HTMLTextAreaElement>(id);
  await navigator.clipboard.writeText(field.value);
  const label = button.textContent;
  button.textContent = 'Copied';
  setTimeout(() => (button.textContent = label), 1500);
}
