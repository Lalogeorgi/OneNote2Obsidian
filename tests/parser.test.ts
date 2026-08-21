import { describe, expect, it } from "vitest";
import { CoordinateMath } from "../src/geometry/Bounds";
import { CanonicalImage, CanonicalInkStrokeGroup, CanonicalOutline } from "../src/model/CanonicalElements";
import { CancellationTokenSource } from "../src/parser/Cancellation";
import { ProgressReporter } from "../src/parser/Progress";
import { OneNoteParserAdapter } from "../src/parser/binary/OneNoteParserAdapter";
import { BinaryFixtureGenerator } from "./fixtures/BinaryFixtureGenerator";

describe("OneNote Parser Adapter & Binary Integration", () => {
  const adapter = new OneNoteParserAdapter();

  it("converts a real .one section binary into the canonical model preserving geometry and z-order", async () => {
    const buffer = BinaryFixtureGenerator.createValidSectionBuffer();
    const result = await adapter.parseSection(buffer);

    expect(result.page).toBeDefined();
    const page = result.page!;

    expect(page.title).toBe("Quarterly Strategy Page");
    expect(page.elements.length).toBeGreaterThanOrEqual(3);

    // 1. Validate Outline Element
    const outline = page.elements.find((e) => e.type === "outline") as CanonicalOutline;
    expect(outline).toBeDefined();
    expect(outline.bounds.x).toBe(CoordinateMath.pointsToPixels(120));
    expect(outline.bounds.y).toBe(CoordinateMath.pointsToPixels(160));
    expect(outline.paragraphs.length).toBe(1);
    expect(outline.paragraphs[0]?.runs[0]?.text).toBe("Strategic Goals for Q3");

    // 2. Validate Image Element & Binary Asset Extraction
    const image = page.elements.find((e) => e.type === "image") as CanonicalImage;
    expect(image).toBeDefined();
    expect(image.bounds.x).toBe(CoordinateMath.pointsToPixels(400));
    expect(image.bounds.y).toBe(CoordinateMath.pointsToPixels(200));
    expect(image.mimeType).toBe("image/png");

    const asset = result.assets.get(image.assetId);
    expect(asset).toBeDefined();
    expect(asset?.mimeType).toBe("image/png");
    expect(asset?.data.length).toBeGreaterThan(0);

    // 3. Validate Ink Element & ISF Points
    const ink = page.elements.find((e) => e.type === "ink") as CanonicalInkStrokeGroup;
    expect(ink).toBeDefined();
    expect(ink.bounds.x).toBe(CoordinateMath.pointsToPixels(150));
    expect(ink.strokes.length).toBe(1);
    expect(ink.strokes[0]?.points.length).toBe(3);

    // 4. Validate Z-Order Monotonicity
    for (let i = 0; i < page.elements.length - 1; i++) {
      expect(page.elements[i]!.bounds.zIndex).toBeLessThanOrEqual(page.elements[i + 1]!.bounds.zIndex);
    }
  });

  it("parses .onetoc2 Table of Contents files into a CanonicalNotebook hierarchy", async () => {
    const tocBuffer = BinaryFixtureGenerator.createValidTocBuffer();
    const notebook = await adapter.parseTableOfContents(tocBuffer);

    expect(notebook).toBeDefined();
    expect(notebook.title).toBe("OneNote Notebook");
  });

  it("extracts and parses .onepkg Cabinet packages containing sections", async () => {
    const pkgBuffer = BinaryFixtureGenerator.createValidCabPackageBuffer();
    const notebook = await adapter.parsePackage(pkgBuffer);

    expect(notebook).toBeDefined();
    expect(notebook.sections.length).toBe(1);
    expect(notebook.sections[0]?.name).toBe("Section1");
    expect(notebook.sections[0]?.pages.length).toBe(1);
    expect(notebook.sections[0]?.pages[0]?.title).toBe("Quarterly Strategy Page");
  });

  it("cooperatively cancels parsing when CancellationToken is cancelled", async () => {
    const buffer = BinaryFixtureGenerator.createValidSectionBuffer();
    const cts = new CancellationTokenSource();
    cts.cancel(); // Cancel immediately

    await expect(
      adapter.parseSection(buffer, {}, undefined, cts.token)
    ).rejects.toThrow();
  });

  it("reports granular progress stages during ingestion", async () => {
    const buffer = BinaryFixtureGenerator.createValidSectionBuffer();
    const reporter = new ProgressReporter();
    const stages: string[] = [];

    reporter.subscribe((u) => stages.push(u.stage));
    await adapter.parseSection(buffer, {}, reporter);

    expect(stages).toContain("READING_FILE");
    expect(stages).toContain("PARSING_OBJECT_SPACES");
    expect(stages).toContain("BUILDING_CANONICAL_MODEL");
    expect(stages).toContain("COMPLETE");
  });
});
