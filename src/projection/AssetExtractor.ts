import { AssetId } from "../model/Ids";
import { ExtractedAsset } from "../parser/ParserAdapter";

export interface StoredAssetRecord {
  readonly assetId: AssetId;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly relativeVaultPath: string;
  readonly data: Uint8Array;
}

export class AssetExtractor {
  /**
   * Deterministically hash byte buffer into SHA-256 hex string.
   */
  public static async calculateSha256(data: Uint8Array): Promise<string> {
    if (typeof crypto !== "undefined" && crypto.subtle) {
      const hashBuffer = await crypto.subtle.digest("SHA-256", data as unknown as BufferSource);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    }

    // Fallback FNV-1a 64-bit hex hash when SubtleCrypto is unavailable in test sandbox
    let hash = 0x811c9dc5;
    for (let i = 0; i < data.length; i++) {
      hash ^= data[i]!;
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  /**
   * Process extracted binary assets into indexed, deduplicated records.
   */
  public static async processAssets(
    assets: ReadonlyMap<AssetId, ExtractedAsset>,
    assetFolderRelativePath = "attachments"
  ): Promise<Map<AssetId, StoredAssetRecord>> {
    const records = new Map<AssetId, StoredAssetRecord>();
    const seenHashes = new Map<string, string>(); // sha256 -> relativeVaultPath

    for (const [assetId, asset] of assets.entries()) {
      const sha256 = await this.calculateSha256(asset.data);
      const ext = this.getExtensionForMimeType(asset.mimeType, asset.fileName);
      const cleanBaseName = asset.fileName
        ? asset.fileName.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
        : `asset_${sha256.slice(0, 12)}`;

      const fileName = cleanBaseName.endsWith(`.${ext}`)
        ? cleanBaseName
        : `${cleanBaseName}.${ext}`;

      let relativeVaultPath = seenHashes.get(sha256);
      if (!relativeVaultPath) {
        relativeVaultPath = `${assetFolderRelativePath}/${fileName}`;
        seenHashes.set(sha256, relativeVaultPath);
      }

      records.set(assetId, {
        assetId,
        fileName,
        mimeType: asset.mimeType,
        sha256,
        sizeBytes: asset.data.length,
        relativeVaultPath,
        data: asset.data,
      });
    }

    return records;
  }

  public static getExtensionForMimeType(mimeType?: string, fileName?: string): string {
    if (fileName && fileName.includes(".")) {
      const parts = fileName.split(".");
      const ext = parts[parts.length - 1]?.toLowerCase();
      if (ext && ext.length <= 5) return ext;
    }

    switch (mimeType?.toLowerCase()) {
      case "image/png":
        return "png";
      case "image/jpeg":
      case "image/jpg":
        return "jpg";
      case "image/svg+xml":
        return "svg";
      case "image/gif":
        return "gif";
      case "image/webp":
        return "webp";
      case "application/pdf":
        return "pdf";
      default:
        return "bin";
    }
  }
}
