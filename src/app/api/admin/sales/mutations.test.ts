import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth/verifyAdminRequest", () => ({
  verifyAdminRequest: vi.fn(),
}));
vi.mock("@/lib/backend/wordpress", () => ({ wordpressRequest: vi.fn() }));
vi.mock("@/lib/sales/engine", () => ({
  orderToSalesRow: vi.fn((order) => order),
}));
vi.mock("@/lib/wordpress/storefrontClient", () => ({
  storefrontRequest: vi.fn(),
}));
import { verifyAdminRequest } from "@/lib/auth/verifyAdminRequest";
import { wordpressRequest } from "@/lib/backend/wordpress";
import { storefrontRequest } from "@/lib/wordpress/storefrontClient";
import { PATCH } from "./orders/route";
import { POST } from "./expenses/route";
const request = (body: unknown, method = "PATCH") =>
  new Request("https://preview.himalayankoh.com/api/admin/sales/orders", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
describe("Sales mutation API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAdminRequest).mockResolvedValue({
      ok: true,
      userId: "owner",
      admin: {
        userId: "owner",
        username: "owner",
        email: "owner@example.invalid",
        name: "Owner",
      },
    });
  });
  it("authenticates before reading or writing financial records", async () => {
    vi.mocked(verifyAdminRequest).mockResolvedValue({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });
    expect(
      (await PATCH(request({ id: 1, field: "cogs", value: 5 }))).status,
    ).toBe(401);
    expect((await POST(request({}, "POST"))).status).toBe(401);
    expect(wordpressRequest).not.toHaveBeenCalled();
    expect(storefrontRequest).not.toHaveBeenCalled();
  });
  it("writes only allowlisted private metadata, never order totals or paid state", async () => {
    vi.mocked(wordpressRequest).mockResolvedValue({ id: 2639 });
    const response = await PATCH(
      request({
        id: "2639",
        field: "cogs",
        value: 35,
        total: 0,
        set_paid: true,
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const args = vi.mocked(wordpressRequest).mock.calls[0];
    expect(args[0]).toBe("/wc/v3/orders/2639");
    expect(Object.keys(args[1]!.body as object)).toEqual(["meta_data"]);
    expect(
      (args[1]!.body as { meta_data: unknown[] }).meta_data,
    ).toContainEqual({ key: "_hk_cogs", value: "35" });
  });
  it("rejects invalid edits without contacting WooCommerce", async () => {
    expect(
      (await PATCH(request({ id: 2639, field: "total", value: 0 }))).status,
    ).toBe(400);
    expect(wordpressRequest).not.toHaveBeenCalled();
  });
  it("does not report a successful save when WordPress rejects it", async () => {
    vi.mocked(wordpressRequest).mockRejectedValue(
      new Error("private upstream detail"),
    );
    const response = await PATCH(
      request({ id: 2639, field: "paymentFee", value: 3 }),
    );
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain(
      "private upstream",
    );
  });
});
