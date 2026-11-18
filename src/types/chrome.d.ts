/**
 * Minimal typings for the chrome.* APIs Compaz uses.
 * Kept local so the project builds with only `typescript` installed.
 * Can be replaced by `@types/chrome` later without touching app code.
 */
declare namespace chrome {
  interface Event<T extends (...args: never[]) => unknown> {
    addListener(cb: T): void;
    removeListener(cb: T): void;
  }

  namespace runtime {
    interface MessageSender {
      id?: string;
      url?: string;
    }
    function sendMessage<R = unknown>(message: unknown): Promise<R>;
    function getURL(path: string): string;
    function openOptionsPage(): Promise<void>;
    function getManifest(): Record<string, unknown>;
    const onMessage: Event<
      (message: unknown, sender: MessageSender, sendResponse: (r: unknown) => void) => boolean | void
    >;
    const onInstalled: Event<(details: { reason: string }) => void>;
    const onStartup: Event<() => void>;
  }

  namespace storage {
    interface StorageChange {
      oldValue?: unknown;
      newValue?: unknown;
    }
    interface StorageArea {
      get(keys: string | string[] | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
    }
    const local: StorageArea;
    /** Free browser sync tied to the Chrome account. Behaves like local when sync is off. */
    const sync: StorageArea;
    const onChanged: Event<(changes: Record<string, StorageChange>, areaName: string) => void>;
  }

  namespace alarms {
    interface Alarm {
      name: string;
      scheduledTime: number;
    }
    function create(name: string, info: { when?: number; periodInMinutes?: number }): Promise<void>;
    function clear(name: string): Promise<boolean>;
    const onAlarm: Event<(alarm: Alarm) => void>;
  }

  namespace declarativeNetRequest {
    interface Rule {
      id: number;
      priority?: number;
      action:
        | { type: 'redirect'; redirect: { extensionPath?: string; regexSubstitution?: string } }
        | { type: 'block' };
      condition: { requestDomains?: string[]; regexFilter?: string; resourceTypes?: string[] };
    }
    function updateDynamicRules(options: { removeRuleIds?: number[]; addRules?: Rule[] }): Promise<void>;
    function getDynamicRules(): Promise<Rule[]>;
  }

  namespace action {
    function setIcon(details: { path: Record<string, string> }): Promise<void>;
    function setBadgeText(details: { text: string }): Promise<void>;
    function setBadgeBackgroundColor(details: { color: string }): Promise<void>;
    function setTitle(details: { title: string }): Promise<void>;
    /** Chrome 127+ for every extension; needs an open, focused window. */
    function openPopup(options?: { windowId?: number }): Promise<void>;
  }

  namespace windows {
    interface Window {
      id?: number;
    }
    function getLastFocused(): Promise<Window>;
    function update(windowId: number, info: { focused?: boolean }): Promise<Window>;
    function create(info: {
      url?: string;
      type?: 'normal' | 'popup';
      width?: number;
      height?: number;
      focused?: boolean;
    }): Promise<Window>;
  }

  namespace tabs {
    interface Tab {
      id?: number;
      url?: string;
    }
    function query(info: { url?: string | string[] }): Promise<Tab[]>;
    function update(tabId: number, props: { url: string }): Promise<Tab>;
    function create(props: { url: string }): Promise<Tab>;
  }

  namespace notifications {
    function create(
      id: string,
      options: { type: 'basic'; iconUrl: string; title: string; message: string; priority?: number },
    ): Promise<string>;
    function clear(id: string): Promise<boolean>;
    const onClicked: Event<(id: string) => void>;
  }

  namespace permissions {
    function request(p: { origins: string[] }): Promise<boolean>;
    function contains(p: { origins: string[] }): Promise<boolean>;
  }
}
