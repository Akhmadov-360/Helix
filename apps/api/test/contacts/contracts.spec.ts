import {
  createContactSchema,
  updateContactSchema,
  dedupCheckSchema,
  contactQuerySchema,
  mergeContactSchema,
  contactResponseSchema,
  createCompanySchema,
  updateCompanySchema,
} from "@helix/api-schemas";
import { describe, expect, it } from "vitest";

describe("Contact / Company contracts (§3)", () => {
  describe("createContactSchema", () => {
    it("требует непустой name", () => {
      expect(createContactSchema.safeParse({ name: "John" }).success).toBe(true);
      expect(createContactSchema.safeParse({ name: "  " }).success).toBe(false);
      expect(createContactSchema.safeParse({}).success).toBe(false);
    });

    it("email — валидный формат, регистр сохраняется, пробелы срезаются (§4.2)", () => {
      expect(createContactSchema.safeParse({ name: "J", email: "not-email" }).success).toBe(false);
      const parsed = createContactSchema.parse({ name: "J", email: "  John@X.com  " });
      expect(parsed.email).toBe("John@X.com"); // trim, но НЕ lowercase (нормализация на сервере)
    });
  });

  describe("updateContactSchema — nullable-семантика (§3)", () => {
    it("пустой объект отвергается (хотя бы одно поле)", () => {
      expect(updateContactSchema.safeParse({}).success).toBe(false);
    });

    it("email: null допустим (очистить), отсутствие ключа — не трогать", () => {
      expect(updateContactSchema.safeParse({ email: null }).success).toBe(true); // очистка = поле есть
      const cleared = updateContactSchema.parse({ email: null });
      expect(cleared).toEqual({ email: null });
      const untouched = updateContactSchema.parse({ name: "New" });
      expect("email" in untouched).toBe(false); // ключа нет → не трогаем
    });

    it("name нельзя занулить (required в домене)", () => {
      expect(updateContactSchema.safeParse({ name: null }).success).toBe(false);
    });
  });

  describe("dedupCheckSchema / mergeContactSchema", () => {
    it("dedup-check требует валидный email", () => {
      expect(dedupCheckSchema.safeParse({ email: "a@b.com" }).success).toBe(true);
      expect(dedupCheckSchema.safeParse({}).success).toBe(false);
    });

    it("merge требует sourceId", () => {
      expect(mergeContactSchema.safeParse({ sourceId: "c1" }).success).toBe(true);
      expect(mergeContactSchema.safeParse({}).success).toBe(false);
    });
  });

  describe("contactQuerySchema", () => {
    it("limit: дефолт 50, coerce, max 500 (bumped для frontend load-all pattern)", () => {
      expect(contactQuerySchema.parse({}).limit).toBe(50);
      expect(contactQuerySchema.parse({ limit: "20" }).limit).toBe(20);
      expect(contactQuerySchema.parse({ limit: 500 }).limit).toBe(500);
      expect(contactQuerySchema.safeParse({ limit: 501 }).success).toBe(false);
    });
  });

  describe("contactResponseSchema — не протекают internal-поля (§4.4, §7.5)", () => {
    it("emailNormalized и mergedIntoId отсекаются из ответа", () => {
      const parsed = contactResponseSchema.parse({
        id: "c1",
        orgId: "o1",
        name: "John",
        email: "j@x.com",
        phone: null,
        companyId: null,
        emailNormalized: "j@x.com", // internal
        mergedIntoId: "c2", // internal
        createdAt: "2026-07-25T00:00:00.000Z",
        updatedAt: "2026-07-25T00:00:00.000Z",
      });
      expect("emailNormalized" in parsed).toBe(false);
      expect("mergedIntoId" in parsed).toBe(false);
    });
  });

  describe("company schemas", () => {
    it("createCompany требует name; domain/industry опциональны", () => {
      expect(createCompanySchema.safeParse({ name: "Acme" }).success).toBe(true);
      expect(createCompanySchema.safeParse({}).success).toBe(false);
    });

    it("updateCompany: пустой объект отвергается, domain:null допустим", () => {
      expect(updateCompanySchema.safeParse({}).success).toBe(false);
      expect(updateCompanySchema.safeParse({ domain: null }).success).toBe(true);
    });
  });
});
