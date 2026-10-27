import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  Badge,
  Button,
  ButtonLink,
  Card,
  Collapsible,
  InfoTip,
  SegmentedControl,
  Select,
  Skeleton,
  Slider,
  Stat,
  Switch,
} from ".";

describe("Button", () => {
  it("defaults to type=button and forwards props", async () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" onClick={onClick}>
        Go
      </Button>,
    );
    const b = screen.getByRole("button", { name: "Go" });
    expect(b).toHaveAttribute("type", "button");
    expect(b.className).toContain("focus-visible:outline-accent");
    await userEvent.click(b);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders a link styled as a button", () => {
    render(<ButtonLink href="/x.csv">Download</ButtonLink>);
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute("href", "/x.csv");
  });
});

describe("Card", () => {
  it("is a section labelled by its title, with actions", () => {
    render(
      <Card title="Totals" subtitle="All hours" actions={<button type="button">Act</button>}>
        body
      </Card>,
    );
    expect(screen.getByRole("region", { name: "Totals" })).toHaveTextContent("body");
    expect(screen.getByRole("heading", { name: "Totals", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("All hours")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Act" })).toBeInTheDocument();
  });
});

describe("SegmentedControl", () => {
  const options = [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta" },
  ] as const;

  it("is a labelled radio group that reports changes", async () => {
    const onChange = vi.fn();
    render(<SegmentedControl legend="Pick" value="a" options={options} onChange={onChange} />);
    expect(screen.getByRole("group", { name: "Pick" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Alpha" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "Beta" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("renders a custom indicator only behind the selected option", () => {
    render(
      <SegmentedControl
        legend="Pick"
        value="b"
        options={options}
        onChange={() => undefined}
        indicator={({ layoutId }) => <span data-testid="ind" data-layout={layoutId} />}
      />,
    );
    const ind = screen.getAllByTestId("ind");
    expect(ind).toHaveLength(1);
    expect(ind[0]?.closest("label")).toHaveTextContent("Beta");
  });
});

describe("Select", () => {
  it("associates the label and emits the string value", async () => {
    const onChange = vi.fn();
    render(
      <Select
        label="Colour"
        value="r"
        options={[
          { value: "r", label: "Red" },
          { value: "g", label: "Green" },
        ]}
        onChange={onChange}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText("Colour"), "g");
    expect(onChange).toHaveBeenCalledWith("g");
  });
});

describe("Slider", () => {
  it("exposes the value text, fills the track and links the disabled hint", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Slider label="Lead" value={30} min={0} max={60} onChange={onChange} valueText="30 hours" />,
    );
    const s = screen.getByRole("slider", { name: "Lead" });
    expect(s).toHaveAttribute("aria-valuetext", "30 hours");
    expect(s.style.getPropertyValue("--fill")).toBe("50.0%");
    fireEvent.change(s, { target: { value: "12" } });
    expect(onChange).toHaveBeenCalledWith(12);
    rerender(
      <Slider
        label="Lead"
        value={30}
        min={0}
        max={60}
        onChange={onChange}
        disabled
        disabledHint="Off"
      />,
    );
    expect(screen.getByRole("slider")).toBeDisabled();
    expect(screen.getByRole("slider")).toHaveAccessibleDescription("Off");
  });
});

describe("InfoTip", () => {
  it("describes its trigger and opens on hover, focus or tap; Escape closes", async () => {
    render(<InfoTip label="MAE" text="Mean absolute error" />);
    const b = screen.getByRole("button", { name: "About MAE" });
    expect(b).toHaveAccessibleDescription("Mean absolute error");
    expect(b).toHaveAttribute("aria-expanded", "false");
    await userEvent.hover(b);
    expect(b).toHaveAttribute("aria-expanded", "true");
    await userEvent.unhover(b);
    expect(b).toHaveAttribute("aria-expanded", "false");
    fireEvent.focus(b);
    expect(b).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(b, { key: "Escape" });
    expect(b).toHaveAttribute("aria-expanded", "false");
  });
});

describe("Stat", () => {
  it("renders a dt/dd group with the value first and marks the primary tile", () => {
    render(
      <dl>
        <Stat
          label="Buffer"
          value="4,098 MW"
          note="Covers 90%"
          primary
          badge={<Badge>Primary</Badge>}
        />
      </dl>,
    );
    const dt = screen.getByText("Buffer", { selector: "dt" });
    expect(dt.parentElement?.querySelector("dd")).toHaveTextContent("4,098 MW");
    expect(dt.parentElement?.className).toContain("border-accent");
    expect(screen.getByText("Primary")).toBeInTheDocument();
  });
});

describe("Collapsible", () => {
  it("toggles aria-expanded and makes closed content inert", async () => {
    render(
      <Collapsible title="Details">
        <a href="#x">inner link</a>
      </Collapsible>,
    );
    const button = screen.getByRole("button", { name: "Details" });
    const region = document.getElementById(button.getAttribute("aria-controls") ?? "");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(region).toHaveAttribute("inert");
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(region).not.toHaveAttribute("inert");
  });
});

describe("Switch", () => {
  it("is a checkbox with role switch", async () => {
    const onChange = vi.fn();
    render(<Switch label="Show it" checked={false} onChange={onChange} />);
    const s = screen.getByRole("switch", { name: "Show it" });
    expect(s).not.toBeChecked();
    await userEvent.click(s);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe("Skeleton", () => {
  it("is hidden from assistive tech", () => {
    const { container } = render(<Skeleton className="h-4" />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});
