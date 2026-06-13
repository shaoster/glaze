import { useEffect, useState } from "react";
import { matchPath, useLocation } from "react-router-dom";
import tutorialsConfig from "../../../tutorials.yml";
import {
  useCurrentUser,
  useOpenPreferencesDialog,
  useSaveUserPreferences,
  type PreferencesSectionId,
} from "./CurrentUserContext";
import SmallTutorialInlay from "./SmallTutorialInlay";
import LargeTutorialInlay from "./LargeTutorialInlay";
import { type SmallTutorialInlayPlacement } from "./SmallTutorialInlayConfig";

interface LargePage {
  title: string;
  body: string;
  bullets?: string[];
}

interface ModalInlay {
  type: "modal";
  label: string;
  dismiss_label: string;
  eyebrow?: string;
  complete_label?: string;
  pages: LargePage[];
}

interface AnchoredTutorial {
  depends_on?: string[];
  preference: { label: string; hint?: string };
  inlay: { type?: "anchored"; label: string; dismiss_label: string };
  attachment: {
    selector: string;
    placement: string;
    action: { type: string; section?: string };
  };
  route?: never;
}

interface ModalTutorial {
  depends_on?: string[];
  preference: { label: string; hint?: string };
  inlay: ModalInlay;
  route: string;
  attachment?: never;
}

type TutorialDefinition = AnchoredTutorial | ModalTutorial;

export interface TutorialsConfig {
  version: string;
  tutorials: Record<string, TutorialDefinition>;
}

const config = tutorialsConfig as unknown as TutorialsConfig;

export default function TutorialManager() {
  const currentUser = useCurrentUser();
  const openPreferencesDialog = useOpenPreferencesDialog();
  const saveUserPreferences = useSaveUserPreferences();
  const location = useLocation();
  const [elements, setElements] = useState<Record<string, HTMLElement | null>>(
    {},
  );

  useEffect(() => {
    const scan = () => {
      const newElements: Record<string, HTMLElement | null> = {};
      let changed = false;
      for (const [key, tutorial] of Object.entries(config.tutorials)) {
        if (tutorial.inlay.type === "modal") {
          continue;
        }
        const el = document.querySelector(
          (tutorial as AnchoredTutorial).attachment.selector,
        ) as HTMLElement | null;
        newElements[key] = el;
        if (el !== (elements[key] || null)) {
          changed = true;
        }
      }
      if (changed) {
        setElements(newElements);
      }
    };

    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });
    return () => observer.disconnect();
  }, [elements]);

  if (!currentUser) return null;

  return (
    <>
      {Object.entries(config.tutorials).map(([key, tutorial]) => {
        const isModal = tutorial.inlay.type === "modal";
        const isDismissed = currentUser.preferences[key] === false;
        const dependenciesNotMet = (tutorial.depends_on ?? []).some(
          (dep) => currentUser.preferences[dep] !== false,
        );

        if (isDismissed || dependenciesNotMet) return null;

        if (isModal) {
          const routeMatch = matchPath(
            (tutorial as ModalTutorial).route,
            location.pathname,
          );
          if (!routeMatch) return null;
          const inlay = tutorial.inlay as ModalInlay;
          const handleClose = ({ dontShow }: { dontShow: boolean }) => {
            if (dontShow && saveUserPreferences && currentUser) {
              void saveUserPreferences({
                ...currentUser.preferences,
                [key]: false,
              });
            }
          };
          return (
            <LargeTutorialInlay
              key={key}
              eyebrow={inlay.eyebrow}
              completeLabel={inlay.complete_label}
              pages={inlay.pages}
              onClose={handleClose}
              onComplete={handleClose}
            />
          );
        }

        // Anchored tutorial path
        const element = elements[key];
        if (!element) return null;

        const anchoredTutorial = tutorial as AnchoredTutorial;

        const handleAction = () => {
          if (
            anchoredTutorial.attachment.action.type === "open-preferences" &&
            openPreferencesDialog
          ) {
            openPreferencesDialog(
              (anchoredTutorial.attachment.action.section as PreferencesSectionId) ||
                null,
            );
          }
        };

        return (
          <SmallTutorialInlay
            key={key}
            attachedElement={element}
            tutorialKey={key}
            label={anchoredTutorial.inlay.label}
            dismissLabel={anchoredTutorial.inlay.dismiss_label}
            placement={
              anchoredTutorial.attachment.placement as SmallTutorialInlayPlacement
            }
            onClick={handleAction}
          />
        );
      })}
    </>
  );
}
