import { expect, type APIRequestContext } from "@playwright/test";

const API = process.env.API_URL ?? "http://localhost:8100/api/v1";
const PASSWORD = "Dummy-Test-Pass-123!";
let ipSeq = Math.floor(Math.random() * 60000);
export const ip = () => `10.200.${(++ipSeq >> 8) & 255}.${ipSeq & 255}`;

export async function newAccount(req: APIRequestContext, withData = false): Promise<string> {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const h = { "X-Forwarded-For": ip() };
  expect(
    (await req.post(`${API}/auth/register`, {
      data: { email, password: PASSWORD, first_name: "Test", last_name: "E2E" },
      headers: h,
    })).status(),
  ).toBe(201);
  expect(
    (await req.post(`${API}/auth/login`, { data: { email, password: PASSWORD }, headers: { "X-Forwarded-For": ip() } })).status(),
  ).toBe(200);
  if (withData) {
    const v = await (await req.post(`${API}/vehicles`, {
      data: { brand: "Test", model: "Car", plate: `E2E-${ipSeq}`, seats_total: 4 },
    })).json();
    const t = await req.post(`${API}/trips`, {
      data: {
        vehicle_id: v.id, origin_label: "Paris Gare de Lyon", destination_label: "Paris Bastille",
        origin_lat: 48.844, origin_lng: 2.374, destination_lat: 48.853, destination_lng: 2.369,
        departure_time: new Date(Date.now() + 2 * 86400e3).toISOString(), seats_total: 3,
      },
    });
    expect(t.status()).toBe(201);
  }
  return email;
}

