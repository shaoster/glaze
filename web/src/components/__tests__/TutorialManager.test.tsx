import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import TutorialManager from "../TutorialManager";
import type { UserPreferences } from "../../util/api";

// Mock tutorials.yml with two fake tutorials for dependency tests
vi.mock("../../../../tutorials.yml", () => ({
  default: {
    version: "1.0",
    tutorials: {
      tutorial_a: {
        preference: {
          label: "Show tutorial A",
          hint: "Tutorial A hint",
        },
        inlay: {
          label: "Tutorial A label",
          dismiss_label: "Dismiss tutorial A",
        },
        attachment: {
          selector: '[data-testid="anchor-a"]',
          placement: "right",
          action: { type: "dismiss-only" },
        },
      },
      tutorial_b: {
        depends_on: ["tutorial_a"],
        preference: {
          label: "Show tutorial B",
          hint: "Tutorial B hint",
        },
        inlay: {
          label: "Tutorial B label",
          dismiss_label: "Dismiss tutorial B",
        },
        attachment: {
          selector: '[data-testid="anchor-b"]',
          placement: "right",
          action: { type: "dismiss-only" },
        },
      },
    },
  },
}));

const mockContext = vi.hoisted(() => ({
  currentUser: null as {
    id: number;
    is_staff: boolean;
    openid_subject: string;
    alias: string;
    preferences: UserPreferences;
  } | null,
}));

vi.mock("../CurrentUserContext", () => ({
  useCurrentUser: () => mockContext.currentUser,
  useOpenPreferencesDialog: () => null,
  useSaveUserPreferences: () => async (prefs: UserPreferences) => prefs,
}));

function makeCurrentUser(overrides: Partial<UserPreferences> = {}) {
  return {
    id: 1,
    is_staff: false,
    openid_subject: "",
    alias: "potter",
    preferences: {
      process_summary_fields: [],
      ...overrides,
    } as UserPreferences,
  };
}

function renderHarness(children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  );
}

describe("TutorialManager depends_on sequencing", () => {
  it("renders a tutorial with no depends_on when its anchor is present", async () => {
    // Set up DOM anchors
    const anchorA = document.createElement("div");
    anchorA.setAttribute("data-testid", "anchor-a");
    document.body.appendChild(anchorA);

    const anchorB = document.createElement("div");
    anchorB.setAttribute("data-testid", "anchor-b");
    document.body.appendChild(anchorB);

    mockContext.currentUser = makeCurrentUser();

    renderHarness(<TutorialManager />);

    // tutorial_a has no depends_on — it should render
    await waitFor(() => {
      expect(screen.queryByText("Tutorial A label")).toBeInTheDocument();
    });

    anchorA.remove();
    anchorB.remove();
  });

  it("suppresses a tutorial whose depends_on prerequisite has not been dismissed", async () => {
    // Set up DOM anchors
    const anchorA = document.createElement("div");
    anchorA.setAttribute("data-testid", "anchor-a");
    document.body.appendChild(anchorA);

    const anchorB = document.createElement("div");
    anchorB.setAttribute("data-testid", "anchor-b");
    document.body.appendChild(anchorB);

    // tutorial_a preference is still true (not yet dismissed)
    mockContext.currentUser = makeCurrentUser({ tutorial_a: true });

    renderHarness(<TutorialManager />);

    // tutorial_b depends on tutorial_a which is not dismissed → should not render
    await waitFor(() => {
      expect(screen.queryByText("Tutorial B label")).not.toBeInTheDocument();
    });

    anchorA.remove();
    anchorB.remove();
  });

  it("renders a tutorial once its depends_on prerequisite has been dismissed", async () => {
    // Set up DOM anchors
    const anchorA = document.createElement("div");
    anchorA.setAttribute("data-testid", "anchor-a");
    document.body.appendChild(anchorA);

    const anchorB = document.createElement("div");
    anchorB.setAttribute("data-testid", "anchor-b");
    document.body.appendChild(anchorB);

    // tutorial_a preference is false (dismissed) — tutorial_b's dep is satisfied
    mockContext.currentUser = makeCurrentUser({
      tutorial_a: false,
    });

    renderHarness(<TutorialManager />);

    // tutorial_b depends on tutorial_a which IS dismissed → should render
    await waitFor(() => {
      expect(screen.queryByText("Tutorial B label")).toBeInTheDocument();
    });

    anchorA.remove();
    anchorB.remove();
  });
});
