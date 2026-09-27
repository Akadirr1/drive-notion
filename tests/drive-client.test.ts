import { describe, it, expect } from "vitest";
import { parseServiceAccount } from "@/server/integrations/drive/client";

describe("parseServiceAccount", () => {
  it("throws readable error naming GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 when not set or empty", () => {
    expect(() => parseServiceAccount(undefined)).toThrowError(
      /GOOGLE_SERVICE_ACCOUNT_JSON_BASE64.*not set/i
    );
    expect(() => parseServiceAccount("")).toThrowError(
      /GOOGLE_SERVICE_ACCOUNT_JSON_BASE64.*not set/i
    );
    expect(() => parseServiceAccount("   ")).toThrowError(
      /GOOGLE_SERVICE_ACCOUNT_JSON_BASE64.*not set/i
    );
  });

  it("throws readable error naming GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 when string is not valid base64", () => {
    expect(() => parseServiceAccount("not a base64 string!")).toThrowError(
      /GOOGLE_SERVICE_ACCOUNT_JSON_BASE64.*valid base64/i
    );
    expect(() => parseServiceAccount("abc")).toThrowError(
      /GOOGLE_SERVICE_ACCOUNT_JSON_BASE64.*valid base64/i
    );
  });

  it("throws readable error naming GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 when decoded string is not valid JSON", () => {
    const invalidJsonBase64 = Buffer.from("this is just plain text, not JSON").toString("base64");
    expect(() => parseServiceAccount(invalidJsonBase64)).toThrowError(
      /GOOGLE_SERVICE_ACCOUNT_JSON_BASE64.*valid JSON/i
    );
  });

  it("throws readable error naming GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 when missing client_email", () => {
    const missingEmail = Buffer.from(
      JSON.stringify({ private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgk..." })
    ).toString("base64");

    expect(() => parseServiceAccount(missingEmail)).toThrowError(
      /GOOGLE_SERVICE_ACCOUNT_JSON_BASE64.*client_email/i
    );
  });

  it("throws readable error naming GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 when missing private_key", () => {
    const missingKey = Buffer.from(
      JSON.stringify({ client_email: "test-sa@project.iam.gserviceaccount.com" })
    ).toString("base64");

    expect(() => parseServiceAccount(missingKey)).toThrowError(
      /GOOGLE_SERVICE_ACCOUNT_JSON_BASE64.*private_key/i
    );
  });

  it("successfully parses valid base64 service account JSON", () => {
    const validPayload = {
      type: "service_account",
      project_id: "bumin-drive",
      client_email: "test-sa@bumin.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvg...\n-----END PRIVATE KEY-----\n",
    };
    const validBase64 = Buffer.from(JSON.stringify(validPayload)).toString("base64");

    const result = parseServiceAccount(validBase64);
    expect(result.client_email).toBe("test-sa@bumin.iam.gserviceaccount.com");
    expect(result.private_key).toBe("-----BEGIN PRIVATE KEY-----\nMIIEvg...\n-----END PRIVATE KEY-----\n");
    expect(result.project_id).toBe("bumin-drive");
  });
});
