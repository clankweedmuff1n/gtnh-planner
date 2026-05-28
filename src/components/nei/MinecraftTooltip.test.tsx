// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MinecraftTooltip } from "./MinecraftTooltip";

describe("MinecraftTooltip", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });

  it("clears an open tooltip when the viewport is zoomed", async () => {
    render(
      <MinecraftTooltip label="Tooltip line">
        <button type="button">Hover target</button>
      </MinecraftTooltip>,
    );

    fireEvent.mouseMove(screen.getByRole("button", { name: "Hover target" }), {
      clientX: 120,
      clientY: 80,
      buttons: 0,
    });

    expect(await screen.findByText("Tooltip line")).toBeTruthy();

    fireEvent.wheel(window);

    await waitFor(() => {
      expect(screen.queryByText("Tooltip line")).toBeNull();
    });
  });

  it("clears an open tooltip when panning starts", async () => {
    render(
      <MinecraftTooltip label="Tooltip line">
        <button type="button">Hover target</button>
      </MinecraftTooltip>,
    );

    fireEvent.mouseMove(screen.getByRole("button", { name: "Hover target" }), {
      clientX: 120,
      clientY: 80,
      buttons: 0,
    });

    expect(await screen.findByText("Tooltip line")).toBeTruthy();

    fireEvent.pointerDown(window);

    await waitFor(() => {
      expect(screen.queryByText("Tooltip line")).toBeNull();
    });
  });
});
