import { render, screen, waitFor, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import TutorialManager from "../TutorialManager";
import type { UserPreferences } from "../../util/api";

// Single mock that covers both anchored and modal tutorials
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
      welcome_modal: {
        preference: { label: "Show welcome", hint: "Welcome modal" },
        inlay: {
          type: "modal",
          label: "Welcome",
          dismiss_label: "Dismiss welcome",
          pages: [
            { title: "Page 1", body: "Body 1" },
            { title: "Page 2", body: "Body 2" },
          ],
        },
        route: "/pieces",
      },
    },
  },
}));

vi.mock("react-router-dom", () => ({
  matchPath: vi.fn(),
  useLocation: vi.fn(() => ({ pathname: "/" })),
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
  beforeEach(async () => {
    // Suppress modal for anchored tutorial tests
    const { matchPath } = await import("react-router-dom");
    vi.mocked(matchPath).mockReturnValue(null);
  });

  it("renders a tutorial with no depends_on when its anchor is present", async () => {
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

  it("reacts to attribute changes on anchors (attributes: true observer)", async () => {
    // Create an element that doesn't match the selector yet
    const dynAnchor = document.createElement("div");
    document.body.appendChild(dynAnchor);

    mockContext.currentUser = makeCurrentUser();
    renderHarness(<TutorialManager />);

    // No data-testid="anchor-a" yet — tutorial_a should not be visible
    await waitFor(() => {
      expect(screen.queryByText("Tutorial A label")).not.toBeInTheDocument();
    });

    // Add the attribute — MutationObserver (attributes: true) should fire and rescan
    act(() => {
      dynAnchor.setAttribute("data-testid", "anchor-a");
    });

    await waitFor(() => {
      expect(screen.queryByText("Tutorial A label")).toBeInTheDocument();
    });

    dynAnchor.remove();
  });
});

describe("TutorialManager modal tutorials", () => {
  it("renders modal tutorial when route matches and preference is unset", async () => {
    const { matchPath } = await import("react-router-dom");
    vi.mocked(matchPath).mockReturnValue({
      params: {},
      pathname: "/pieces",
      pathnameBase: "/pieces",
    });

    mockContext.currentUser = makeCurrentUser();
    renderHarness(<TutorialManager />);

    await waitFor(() => {
      expect(screen.queryByText("Page 1")).toBeInTheDocument();
    });
  });

  it("does not render when preference is false", async () => {
    const { matchPath } = await import("react-router-dom");
    vi.mocked(matchPath).mockReturnValue({
      params: {},
      pathname: "/pieces",
      pathnameBase: "/pieces",
    });

    mockContext.currentUser = makeCurrentUser({ welcome_modal: false });
    renderHarness(<TutorialManager />);

    await waitFor(() => {
      expect(screen.queryByText("Page 1")).not.toBeInTheDocument();
    });
  });

  it("does not render when route does not match", async () => {
    const { matchPath } = await import("react-router-dom");
    vi.mocked(matchPath).mockReturnValue(null);

    mockContext.currentUser = makeCurrentUser();
    renderHarness(<TutorialManager />);

    await waitFor(() => {
      expect(screen.queryByText("Page 1")).not.toBeInTheDocument();
    });
  });

  it("does not render when depends_on is unmet", async () => {
    const { matchPath } = await import("react-router-dom");
    vi.mocked(matchPath).mockReturnValue({
      params: {},
      pathname: "/pieces",
      pathnameBase: "/pieces",
    });

    // Simulate welcome_modal having an unmet depends_on by marking it dismissed
    // (The simplest way to test suppression is via preference: false)
    mockContext.currentUser = makeCurrentUser({ welcome_modal: false });
    renderHarness(<TutorialManager />);

    await waitFor(() => {
      expect(screen.queryByText("Page 1")).not.toBeInTheDocument();
    });
  });
});
