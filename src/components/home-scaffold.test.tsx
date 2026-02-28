import { render, screen } from "@testing-library/react";

import { HomeScaffold } from "@/components/home-scaffold";

describe("HomeScaffold", () => {
  it("renders the home scaffold and primary action", () => {
    render(<HomeScaffold />);

    expect(
      screen.getByRole("heading", { name: /genshin calculator/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save setup/i })).toBeInTheDocument();
  });
});
