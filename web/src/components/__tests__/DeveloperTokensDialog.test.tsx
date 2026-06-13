import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("../../util/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../util/api")>();
  return {
    ...actual,
    listAgentTokens: vi.fn(),
    createAgentToken: vi.fn(),
    revokeAgentToken: vi.fn(),
  };
});

import { createAgentToken, listAgentTokens, revokeAgentToken } from "../../util/api";
import { DeveloperTokensDialog } from "../DeveloperTokensDialog";

const mockList = vi.mocked(listAgentTokens);
const mockCreate = vi.mocked(createAgentToken);
const mockRevoke = vi.mocked(revokeAgentToken);

function renderDialog(open = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <DeveloperTokensDialog open={open} onClose={onClose} />
    </QueryClientProvider>
  );
  return { onClose };
}

describe("DeveloperTokensDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("shows existing tokens", async () => {
    mockList.mockResolvedValue([
      {
        id: "abc-123",
        name: "Claude MCP",
        created_at: "2026-01-01T00:00:00Z",
        last_used_at: null,
      },
    ]);
    renderDialog();
    expect(await screen.findByText("Claude MCP")).toBeInTheDocument();
    expect(screen.getByText("Never")).toBeInTheDocument();
  });

  it("shows empty state when no tokens", async () => {
    mockList.mockResolvedValue([]);
    renderDialog();
    expect(
      await screen.findByText(/No active tokens/)
    ).toBeInTheDocument();
  });

  it("creates a token and shows the plain-text once", async () => {
    mockList.mockResolvedValue([]);
    mockCreate.mockResolvedValue({
      id: "new-id",
      name: "Test Token",
      created_at: "2026-01-01T00:00:00Z",
      last_used_at: null,
      token: "pdagent_supersecretvalue",
    });
    renderDialog();
    await screen.findByText(/No active tokens/);

    const nameInput = screen.getByLabelText(/Token name/i);
    fireEvent.change(nameInput, { target: { value: "Test Token" } });
    fireEvent.click(screen.getByRole("button", { name: /Create/i }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith("Test Token");
    });
    expect(screen.getByDisplayValue("pdagent_supersecretvalue")).toBeInTheDocument();
    expect(
      screen.getByText(/will not be shown again/i)
    ).toBeInTheDocument();
  });

  it("does not create token with empty name", async () => {
    mockList.mockResolvedValue([]);
    renderDialog();
    await screen.findByText(/No active tokens/);
    const createBtn = screen.getByRole("button", { name: /Create/i });
    expect(createBtn).toBeDisabled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("revokes a token when delete is clicked", async () => {
    mockList.mockResolvedValue([
      {
        id: "abc-123",
        name: "Claude MCP",
        created_at: "2026-01-01T00:00:00Z",
        last_used_at: null,
      },
    ]);
    mockRevoke.mockResolvedValue(undefined);
    renderDialog();
    await screen.findByText("Claude MCP");

    const revokeBtn = screen.getByRole("button", { name: /Revoke token/i });
    fireEvent.click(revokeBtn);

    await waitFor(() => {
      expect(mockRevoke).toHaveBeenCalledWith("abc-123");
    });
  });
});
