import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import InvitePage from "../InvitePage";

function renderWithCode(code: string) {
  render(
    <MemoryRouter initialEntries={[`/invite?code=${code}`]}>
      <Routes>
        <Route path="/invite" element={<InvitePage />} />
        <Route path="/" element={<div>Sign in page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("InvitePage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("stashes the code and shows the sign-in prompt (no pre-validation)", () => {
    renderWithCode("some-uuid");
    expect(
      screen.getByText(/you've been invited to potterdoc/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /continue to sign in/i }),
    ).toBeInTheDocument();
    // The code is carried to redemption, which validates it destructively.
    expect(sessionStorage.getItem("pendingInviteCode")).toBe("some-uuid");
  });

  it("shows an error and stores nothing when no code is in the URL", () => {
    render(
      <MemoryRouter initialEntries={["/invite"]}>
        <Routes>
          <Route path="/invite" element={<InvitePage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText(/no invite code found/i)).toBeInTheDocument();
    expect(sessionStorage.getItem("pendingInviteCode")).toBeNull();
  });
});
