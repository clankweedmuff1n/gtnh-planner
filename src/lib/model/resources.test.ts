import { describe, expect, it } from "vitest";
import { isVirtualChoiceResource, resourceLabel } from "./resources";

describe("resource helpers", () => {
  it("identifies virtual choice resources that should stay out of resource pickers", () => {
    expect(isVirtualChoiceResource({ id: "oredict:stickWood", displayName: "Stick Wood" })).toBe(
      true,
    );
    expect(
      isVirtualChoiceResource({
        id: "minecraft:stick",
        displayName: "Ore Dictionary: stickWood",
      }),
    ).toBe(true);
    expect(isVirtualChoiceResource({ id: "any:item", displayName: "Any Item" })).toBe(true);
    expect(isVirtualChoiceResource({ id: "gregtech:gt.metaitem.01:32700", displayName: "Tin Plate" })).toBe(
      false,
    );
  });

  it("removes ore dictionary noise from labels used in recipes", () => {
    expect(resourceLabel({ id: "oredict:stickWood", displayName: "Ore Dictionary: stickWood" })).toBe(
      "stickWood",
    );
  });
});
