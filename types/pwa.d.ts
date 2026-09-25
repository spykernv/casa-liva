/**
 * `beforeinstallprompt` n'est pas dans la bibliothèque standard de
 * TypeScript, et ce n'est pas un oubli : il n'est **pas** standardisé.
 * Chrome et les navigateurs qui en dérivent le déclenchent ; Safari,
 * jamais — d'où les deux chemins de JON-18.
 *
 * On le déclare donc ici, au plus près de la réalité, plutôt que de
 * passer par `any` : le jour où quelqu'un croira pouvoir appeler
 * `prompt()` sur autre chose, le compilateur le dira.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface WindowEventMap {
  beforeinstallprompt: BeforeInstallPromptEvent;
  appinstalled: Event;
}

interface Window {
  /**
   * L'invitation capturée par le script `beforeInteractive` de la
   * coquille. `null` tant que le navigateur ne juge pas le site
   * installable — ou une fois l'invitation consommée, Chrome
   * interdisant de rejouer la même.
   */
  __casaInstall: BeforeInstallPromptEvent | null;
}
