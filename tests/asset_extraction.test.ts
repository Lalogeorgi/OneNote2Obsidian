import { describe, expect, it } from "vitest";
import { IdGenerator } from "../src/model/Ids";
import { ExtractedAsset } from "../src/parser/ParserAdapter";
import { AssetExtractor } from "../src/projection/AssetExtractor";

describe("Asset Extractor & Deterministic Deduplication", () => {
  it("calculates SHA-256 hash deterministically", async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const hash1 = await AssetExtractor.calculateSha256(data);
    const hash2 = await AssetExtractor.calculateSha256(data);

    expect(hash1).toBe(hash2);
    expect(hash1.length).toBeGreaterThan(0);
  });

  it("resolves file extensions based on MIME type and file names", () => {
    expect(AssetExtractor.getExtensionForMimeType("image/png")).toBe("png");
    expect(AssetExtractor.getExtensionForMimeType("image/jpeg")).toBe("jpg");
    expect(AssetExtractor.getExtensionForMimeType("application/pdf")).toBe("pdf");
    expect(AssetExtractor.getExtensionForMimeType(undefined, "document.docx")).toBe("docx");
  });

  it("deduplicates identical binary payloads into a single relative vault path", async () => {
    const payload = new Uint8Array([10, 20, 30, 40, 50]);

    const id1 = IdGenerator.assetId("asset_1");
    const id2 = IdGenerator.assetId("asset_2");

    const asset1: ExtractedAsset = {
      id: id1,
      data: payload,
      mimeType: "image/png",
      fileName: "photo.png",
    };

    const asset2: ExtractedAsset = {
      id: id2,
      data: payload, // Identical binary content
      mimeType: "image/png",
      fileName: "duplicate_photo.png",
    };

    const map = new Map<any, ExtractedAsset>([[id1, asset1], [id2, asset2]]);
    const records = await AssetExtractor.processAssets(map, "attachments");

    const rec1 = records.get(id1);
    const rec2 = records.get(id2);

    expect(rec1).toBeDefined();
    expect(rec2).toBeDefined();
    expect(rec1?.sha256).toBe(rec2?.sha256);
    expect(rec1?.relativeVaultPath).toBe(rec2?.relativeVaultPath);
  });
});
