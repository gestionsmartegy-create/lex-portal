import { describe, expect, it } from "vitest";
import { buildSecurityTxt, SECURITY_CONTACT_EMAIL } from "@/lib/security-txt";
import { buildCsp, buildReportOnlyCsp, CSP_REPORT_PATH, reportingEndpoints } from "@/server/security/csp";
import { parseCspReport, redactUrl } from "@/server/validation/csp-report";
import { smtpTransportUrl } from "@/server/providers/notifications/smtp";

describe("rapports CSP (ADR 0011)", () => {
  it("la politique bloquante déclare report-to et report-uri", () => {
    const csp = buildCsp({ nonce: "n", isDev: false });
    expect(csp).toContain("report-to csp");
    expect(csp).toContain(`report-uri ${CSP_REPORT_PATH}`);
  });

  it("Trusted Types est en observation seule", () => {
    expect(buildReportOnlyCsp()).toContain("require-trusted-types-for 'script'");
    expect(buildCsp({ nonce: "n", isDev: false })).not.toContain("require-trusted-types-for");
  });

  it("Reporting-Endpoints utilise une URL absolue", () => {
    expect(reportingEndpoints("https://portal.example.com")).toBe(
      'csp="https://portal.example.com/api/security/csp-report"',
    );
  });

  it("format report-uri : ne garde ni requête, ni fragment, ni chemin externe", () => {
    const [v] = parseCspReport({
      "csp-report": {
        "document-uri": "https://portal.example.com/en/portal/matters/123?token=secret#x",
        "effective-directive": "script-src-elem",
        "blocked-uri": "https://evil.example/steal.js?c=abc",
      },
    })!;
    expect(v).toEqual({
      directive: "script-src-elem",
      blocked: "https://evil.example",
      page: "/en/portal/matters/123",
      disposition: "enforce",
    });
  });

  it("format report-to : seules les violations CSP sont gardées", () => {
    const out = parseCspReport([
      {
        type: "csp-violation",
        body: {
          effectiveDirective: "require-trusted-types-for",
          blockedURL: "trusted-types-sink",
          disposition: "report",
        },
      },
      { type: "deprecation", body: {} },
    ]);
    expect(out).toHaveLength(1);
    expect(out![0]!.blocked).toBe("trusted-types-sink");
  });

  it("refuse un rapport invalide ou surdimensionné", () => {
    expect(parseCspReport({ foo: 1 })).toBeNull();
    expect(parseCspReport({ "csp-report": { "blocked-uri": "x".repeat(5000) } })).toBeNull();
    expect(
      parseCspReport(Array.from({ length: 21 }, () => ({ type: "csp-violation", body: {} }))),
    ).toBeNull();
  });

  it("redactUrl : schémas non web réduits à leur protocole", () => {
    expect(redactUrl("data:text/html;base64,AAAA", "origin")).toBe("data:");
    expect(redactUrl("inline", "origin")).toBe("inline");
  });
});

describe("security.txt (RFC 9116)", () => {
  it("contact du cabinet, expiration future, canonique", () => {
    const now = new Date("2026-10-02T12:00:00Z");
    const txt = buildSecurityTxt("https://portal.example.com", now);
    expect(txt).toContain(`Contact: mailto:${SECURITY_CONTACT_EMAIL}`);
    expect(txt).toContain("Canonical: https://portal.example.com/.well-known/security.txt");
    const expires = new Date(/Expires: (.+)/.exec(txt)![1]!);
    expect(expires.getTime()).toBeGreaterThan(now.getTime());
    expect(expires.getTime() - now.getTime()).toBeLessThan(366 * 24 * 3600 * 1000);
  });
});

describe("SMTP (ADR 0013)", () => {
  it("impose STARTTLS hors local, jamais en local (Mailpit)", () => {
    expect(smtpTransportUrl("smtp://u%40lexcanadalaw.com:p@smtp.office365.com:587")).toContain(
      "requireTLS=true",
    );
    expect(smtpTransportUrl("smtp://127.0.0.1:54325")).not.toContain("requireTLS");
    expect(smtpTransportUrl("smtp://mailpit:1025")).not.toContain("requireTLS"); // service Docker interne
    expect(smtpTransportUrl("smtp://smtp.office365.com:587")).toContain("requireTLS=true");
    expect(smtpTransportUrl("smtps://u:p@smtp.example.com:465")).not.toContain("requireTLS");
  });
});
