import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RiverSlider } from "@/components/RiverSlider";
import { RiverComparison } from "@/components/RiverComparison";

vi.stubGlobal("requestAnimationFrame", () => 0);
vi.stubGlobal("cancelAnimationFrame", () => {});

describe("RiverSlider", () => {
  it("renders both layers, the captions and a keyboard-operable divider", () => {
    render(<RiverSlider labels={["Depois", "Antes"]} ariaLabel="Comparação" before={<p>original</p>} after={<p>mascarado</p>} />);
    expect(screen.getByText("original")).toBeInTheDocument();
    expect(screen.getByText("mascarado")).toBeInTheDocument();
    expect(screen.getByText("Depois")).toBeInTheDocument();
    expect(screen.getByText("Antes")).toBeInTheDocument();
    const handle = screen.getByRole("slider");
    fireEvent.keyDown(handle, { key: "End" });
    expect(handle).toHaveAttribute("aria-valuenow", "100");
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(handle).toHaveAttribute("aria-valuenow", "95");
    fireEvent.keyDown(handle, { key: "Home" });
    expect(handle).toHaveAttribute("aria-valuenow", "0");
  });
});

describe("RiverComparison", () => {
  it("keeps the masked tokens' width and exposes the official output to screen readers", () => {
    const text = "Nome: Rui Costa\nNIF: 123456789";
    const entities = [{ id: "a", text: "Rui Costa", category: "nome" as const, reason: "", gdpr_basis: "", enabled: true }];
    const { container } = render(<RiverComparison text={text} entities={entities} output={"Nome: * *\nNIF: 123456789"} />);
    const masked = container.querySelectorAll(".river-masked-word");
    expect(masked).toHaveLength(2);
    expect(masked[0]?.textContent).toBe("Rui*");
    expect(container.querySelector(".sr-only pre")?.textContent).toBe("Nome: * *\nNIF: 123456789");
  });
});
