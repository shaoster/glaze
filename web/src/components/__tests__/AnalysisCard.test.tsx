import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AnalysisCard from "../AnalysisCard";

describe("AnalysisCard", () => {
  it("renders title and description", () => {
    render(
      <MemoryRouter>
        <AnalysisCard
          title="Test Title"
          description="Test Description"
          to="/test"
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Test Title")).toBeInTheDocument();
    expect(screen.getByText("Test Description")).toBeInTheDocument();
  });

  it("renders summary slot when provided", () => {
    render(
      <MemoryRouter>
        <AnalysisCard
          title="Test Title"
          description="Test Description"
          to="/test"
          summary={<div data-testid="summary">Summary Content</div>}
        />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("summary")).toBeInTheDocument();
  });

  it("links to the correct destination", () => {
    render(
      <MemoryRouter>
        <AnalysisCard
          title="Test Title"
          description="Test Description"
          to="/test-destination"
        />
      </MemoryRouter>,
    );

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/test-destination");
  });
});
