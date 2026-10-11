import { defaultApiUrl } from "@/address";

test("the address set on the computer comes first", () => {
  expect(defaultApiUrl("abc.trycloudflare.com", "192.168.1.5:8081")).toBe("https://abc.trycloudflare.com");
});

test("on the same Wi-Fi, the API is found on the computer that served the app", () => {
  expect(defaultApiUrl(undefined, "192.168.1.5:8081")).toBe("http://192.168.1.5:8000");
  expect(defaultApiUrl("", "10.0.0.12:8081")).toBe("http://10.0.0.12:8000");
  expect(defaultApiUrl(undefined, "172.20.3.4:19000")).toBe("http://172.20.3.4:8000");
});

test("a tunnel or public host is not guessed: demo until an address is set", () => {
  expect(defaultApiUrl(undefined, "xyz-anonymous-8081.exp.direct")).toBe("");
  expect(defaultApiUrl(undefined, "8.8.8.8:8081")).toBe("");
  expect(defaultApiUrl(undefined, undefined)).toBe("");
});
