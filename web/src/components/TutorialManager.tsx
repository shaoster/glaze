import { useEffect, useState } from "react";
import tutorialsConfig from "../../../tutorials.yml";
import {
  useCurrentUser,
  useOpenPreferencesDialog,
  type PreferencesSectionId,
} from "./CurrentUserContext";
import SmallTutorialInlay from "./SmallTutorialInlay";
import { type SmallTutorialInlayPlacement } from "./SmallTutorialInlayConfig";

export interface TutorialDefinition {
  preference: {
    label: string;
    hint?: string;
  };
  inlay: {
    label: string;
    dismiss_label: string;
  };
  attachment: {
    selector: string;
    placement: string;
    action: {
      type: string;
      section?: string;
    };
  };
}

export interface TutorialsConfig {
  version: string;
  tutorials: Record<string, TutorialDefinition>;
}

const config = tutorialsConfig as unknown as TutorialsConfig;

export default function TutorialManager() {
  const currentUser = useCurrentUser();
  const openPreferencesDialog = useOpenPreferencesDialog();
  const [elements, setElements] = useState<Record<string, HTMLElement | null>>(
    {},
  );

  useEffect(() => {
    const scan = () => {
      const newElements: Record<string, HTMLElement | null> = {};
      let changed = false;
      for (const [key, tutorial] of Object.entries(config.tutorials)) {
        const el = document.querySelector(
          tutorial.attachment.selector,
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
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [elements]);

  if (!currentUser) return null;

  return (
    <>
      {Object.entries(config.tutorials).map(([key, tutorial]) => {
        const element = elements[key];
        const isDismissed = currentUser.preferences[key] === false;
        if (!element || isDismissed) return null;

        const handleAction = () => {
          if (
            tutorial.attachment.action.type === "open-preferences" &&
            openPreferencesDialog
          ) {
            openPreferencesDialog(
              (tutorial.attachment.action.section as PreferencesSectionId) ||
                null,
            );
          }
        };

        return (
          <SmallTutorialInlay
            key={key}
            attachedElement={element}
            tutorialKey={key}
            label={tutorial.inlay.label}
            dismissLabel={tutorial.inlay.dismiss_label}
            placement={
              tutorial.attachment.placement as SmallTutorialInlayPlacement
            }
            onClick={handleAction}
          />
        );
      })}
    </>
  );
}
