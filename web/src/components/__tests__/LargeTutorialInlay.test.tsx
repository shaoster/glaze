import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import LargeTutorialInlay from "../LargeTutorialInlay";

vi.mock("../CurrentUserContext", () => ({
  useCurrentUser: () => ({ id: 1, preferences: {} }),
  useSaveUserPreferences: () => async (p: unknown) => p,
}));

const THREE_PAGES = [
  { title: "Page One", body: "Body for page one." },
  { title: "Page Two", body: "Body for page two." },
  { title: "Page Three", body: "Body for page three.", bullets: ["Bullet A", "Bullet B"] },
];

function renderHarness(
  overrides: Partial<React.ComponentProps<typeof LargeTutorialInlay>> = {},
) {
  const onComplete = vi.fn();
  const onClose = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <LargeTutorialInlay
        tutorialKey="welcome"
        pages={THREE_PAGES}
        onComplete={onComplete}
        onClose={onClose}
        {...overrides}
      />
    </QueryClientProvider>,
  );
  return { onComplete, onClose };
}

describe("LargeTutorialInlay", () => {
  it("renders first page title and body on mount", () => {
    renderHarness();
    expect(screen.getByText("Page One")).toBeInTheDocument();
    expect(screen.getByText("Body for page one.")).toBeInTheDocument();
  });

  it("Next advances page; step counter changes", async () => {
    const user = userEvent.setup();
    renderHarness();

    expect(screen.getByText(/01 \/ 03/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByText(/02 \/ 03/)).toBeInTheDocument();
      expect(screen.getByText("Page Two")).toBeInTheDocument();
    });
  });

  it("Back is hidden on page 0 and visible on page 1", async () => {
    const user = userEvent.setup();
    renderHarness();

    expect(screen.queryByRole("button", { name: /back/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /back/i }));

    await waitFor(() => {
      expect(screen.getByText("Page One")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /back/i })).not.toBeInTheDocument();
    });
  });

  it("last page shows completeLabel instead of Next", async () => {
    const user = userEvent.setup();
    renderHarness({ completeLabel: "Let's go!" });

    // Navigate to last page
    await user.click(screen.getByRole("button", { name: /next/i }));
    await user.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByText("Let's go!")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /next/i })).not.toBeInTheDocument();
    });
  });

  it("last page shows default completeLabel when prop omitted", async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole("button", { name: /next/i }));
    await user.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByText("Start using PotterDoc")).toBeInTheDocument();
    });
  });

  it("'Don't show this again' checkbox label is present and toggles", async () => {
    const user = userEvent.setup();
    renderHarness();

    expect(screen.getByText(/don't show this again/i)).toBeInTheDocument();
    const checkbox = screen.getByRole("checkbox", { name: /don't show this again/i });
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it("x close calls onClose({ dontShow: false }) when unchecked", async () => {
    const user = userEvent.setup();
    const { onClose } = renderHarness();

    await user.click(screen.getByRole("button", { name: /close tutorial/i }));
    expect(onClose).toHaveBeenCalledWith({ dontShow: false });
  });

  it("x close calls onClose({ dontShow: true }) after checking the box", async () => {
    const user = userEvent.setup();
    const { onClose } = renderHarness();

    await user.click(screen.getByRole("checkbox", { name: /don't show this again/i }));
    await user.click(screen.getByRole("button", { name: /close tutorial/i }));
    expect(onClose).toHaveBeenCalledWith({ dontShow: true });
  });

  it("completing on last page calls onComplete({ dontShow: false }) when unchecked", async () => {
    const user = userEvent.setup();
    const { onComplete } = renderHarness();

    await user.click(screen.getByRole("button", { name: /next/i }));
    await user.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => screen.getByText("Start using PotterDoc"));
    await user.click(screen.getByText("Start using PotterDoc"));

    expect(onComplete).toHaveBeenCalledWith({ dontShow: false });
  });

  it("completing calls onComplete({ dontShow: true }) when checked", async () => {
    const user = userEvent.setup();
    const { onComplete } = renderHarness();

    await user.click(screen.getByRole("checkbox", { name: /don't show this again/i }));
    await user.click(screen.getByRole("button", { name: /next/i }));
    await user.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => screen.getByText("Start using PotterDoc"));
    await user.click(screen.getByText("Start using PotterDoc"));

    expect(onComplete).toHaveBeenCalledWith({ dontShow: true });
  });
});
