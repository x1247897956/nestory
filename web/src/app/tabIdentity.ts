import { randomUUID } from "./uuid";
// sessionStorage is copied by window.open/Duplicate Tab. Pair it with the
// browsing context name and probe live contexts before mounting editors.
const storageKey = "noteapp:tab-owner:v1";
const namePrefix = "noteapp-tab:";
let channel: BroadcastChannel | undefined;
let current: string | undefined;
function assign(owner: string) {
  window.sessionStorage.setItem(storageKey, owner);
  window.name = namePrefix + owner;
  current = owner;
  return owner;
}
export function getTabOwner(): string {
  const saved = window.sessionStorage.getItem(storageKey);
  if (saved && window.name === namePrefix + saved) { current = saved; return saved; }
  return assign(randomUUID());
}
export async function initializeTabIdentity(): Promise<void> {
  let owner = getTabOwner();
  if (!window.BroadcastChannel) return;
  const instance = randomUUID();
  const replies = new Set<string>();
  channel = new window.BroadcastChannel("noteapp-tab-identity-v1");
  channel.onmessage = ({data}) => {
    if (data?.kind === "claim" && data.owner === current && data.instance !== instance)
      channel?.postMessage({kind:"occupied",target:data.instance,owner:current});
    if (data?.kind === "occupied" && data.target === instance) replies.add(data.owner);
  };
  // Even a duplicated window.name must not identify two live contexts as one.
  for (let attempt=0;attempt<3;attempt++) {
    channel.postMessage({kind:"claim",owner,instance});
    await new Promise(resolve=>setTimeout(resolve,60));
    if (!replies.has(owner)) break;
    owner = assign(randomUUID());
  }
  window.addEventListener("pagehide", (event) => {
    // Back/forward cache restores the same React tree; keep its responder alive.
    if (!event.persisted) channel?.close();
  });
}
