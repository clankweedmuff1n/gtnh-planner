import type { FactoryNodeColorTag } from "@/lib/model/types";

export const GT_NODE_COLORS: Record<
  FactoryNodeColorTag,
  { swatch: string; panel: string; header: string; border: string; shadow: string }
> = {
  white: {
    swatch: "#f0f0f0",
    panel: "#d8d8d8",
    header: "#c8c8c8",
    border: "#9f9f9f",
    shadow: "#f0f0f0",
  },
  orange: {
    swatch: "#f9801d",
    panel: "#d4945d",
    header: "#c96b1e",
    border: "#914811",
    shadow: "#f9801d",
  },
  magenta: {
    swatch: "#c74ebd",
    panel: "#b983b4",
    header: "#a8439f",
    border: "#7d2c76",
    shadow: "#c74ebd",
  },
  light_blue: {
    swatch: "#3ab3da",
    panel: "#9eb6ce",
    header: "#7f99b8",
    border: "#637999",
    shadow: "#9eb6ce",
  },
  yellow: {
    swatch: "#fed83d",
    panel: "#d2bd68",
    header: "#c8a929",
    border: "#957912",
    shadow: "#fed83d",
  },
  lime: {
    swatch: "#80c71f",
    panel: "#9db76e",
    header: "#68a31c",
    border: "#487612",
    shadow: "#80c71f",
  },
  pink: {
    swatch: "#f38baa",
    panel: "#d0a0b0",
    header: "#c66f89",
    border: "#955168",
    shadow: "#f38baa",
  },
  gray: {
    swatch: "#474f52",
    panel: "#6b6f70",
    header: "#565e61",
    border: "#33383a",
    shadow: "#474f52",
  },
  light_gray: {
    swatch: "#9d9d97",
    panel: "#a6a6a0",
    header: "#85857f",
    border: "#62625e",
    shadow: "#9d9d97",
  },
  cyan: {
    swatch: "#169c9c",
    panel: "#73a6a6",
    header: "#168282",
    border: "#0e6262",
    shadow: "#169c9c",
  },
  purple: {
    swatch: "#8932b8",
    panel: "#9275a7",
    header: "#74309a",
    border: "#562172",
    shadow: "#8932b8",
  },
  blue: {
    swatch: "#3c44aa",
    panel: "#8f9ab8",
    header: "#6f7ea6",
    border: "#586484",
    shadow: "#3c44aa",
  },
  brown: {
    swatch: "#835432",
    panel: "#8b735f",
    header: "#70482d",
    border: "#50331f",
    shadow: "#835432",
  },
  green: {
    swatch: "#5e7c16",
    panel: "#788767",
    header: "#536c16",
    border: "#394b0d",
    shadow: "#5e7c16",
  },
  red: {
    swatch: "#b02e26",
    panel: "#a87572",
    header: "#962a24",
    border: "#6f1c18",
    shadow: "#b02e26",
  },
  black: {
    swatch: "#1d1d21",
    panel: "#555559",
    header: "#303033",
    border: "#111114",
    shadow: "#1d1d21",
  },
};

export const GT_NODE_COLOR_TAGS = [
  "white",
  "orange",
  "magenta",
  "light_blue",
  "yellow",
  "lime",
  "pink",
  "gray",
  "light_gray",
  "cyan",
  "purple",
  "blue",
  "brown",
  "green",
  "red",
  "black",
] satisfies FactoryNodeColorTag[];

export const GT_NODE_COLOR_PALETTE: Array<{
  tag: FactoryNodeColorTag;
  color: (typeof GT_NODE_COLORS)[FactoryNodeColorTag];
}> = GT_NODE_COLOR_TAGS.map((tag) => ({
  tag,
  color: GT_NODE_COLORS[tag],
}));
