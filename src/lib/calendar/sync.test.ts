import { describe, expect, it } from "vitest";
import { reconcile, type GoogleSyncEvent, type LocalSyncEvent } from "@/lib/calendar/sync";

const local = (over: Partial<LocalSyncEvent> & { id: string }): LocalSyncEvent => ({
  googleEventId: null,
  etag: null,
  updatedAt: "2026-06-15T12:00:00Z",
  syncedAt: null,
  origin: "local",
  ...over,
});

const google = (over: Partial<GoogleSyncEvent> & { id: string }): GoogleSyncEvent => ({
  etag: "etag-1",
  status: "confirmed",
  updated: "2026-06-15T12:00:00Z",
  ...over,
});

describe("reconcile — push (local → Google)", () => {
  it("evento local sem google_event_id entra em pushCreate", () => {
    const plan = reconcile([local({ id: "l1" })], []);
    expect(plan.pushCreate.map((e) => e.id)).toEqual(["l1"]);
    expect(plan.pullUpsert).toHaveLength(0);
  });

  it("local editado após o sync e Google inalterado → pushUpdate", () => {
    const plan = reconcile(
      [
        local({
          id: "l1",
          googleEventId: "g1",
          etag: "etag-1",
          syncedAt: "2026-06-15T10:00:00Z",
          updatedAt: "2026-06-15T11:00:00Z",
        }),
      ],
      [google({ id: "g1", etag: "etag-1" })],
    );
    expect(plan.pushUpdate.map((e) => e.id)).toEqual(["l1"]);
    expect(plan.pullUpsert).toHaveLength(0);
  });
});

describe("reconcile — pull (Google → local)", () => {
  it("evento do Google sem correspondente local entra em pullUpsert", () => {
    const plan = reconcile([], [google({ id: "g1" })]);
    expect(plan.pullUpsert.map((e) => e.id)).toEqual(["g1"]);
  });

  it("Google alterado (etag diferente) e local inalterado → pullUpsert", () => {
    const plan = reconcile(
      [
        local({
          id: "l1",
          googleEventId: "g1",
          etag: "etag-OLD",
          syncedAt: "2026-06-15T12:00:00Z",
          updatedAt: "2026-06-15T12:00:00Z",
        }),
      ],
      [google({ id: "g1", etag: "etag-NEW" })],
    );
    expect(plan.pullUpsert.map((e) => e.id)).toEqual(["g1"]);
    expect(plan.pushUpdate).toHaveLength(0);
  });

  it("Google cancelado → exclui local", () => {
    const plan = reconcile(
      [local({ id: "l1", googleEventId: "g1", etag: "etag-1" })],
      [google({ id: "g1", status: "cancelled" })],
    );
    expect(plan.pullDeleteLocalIds).toEqual(["l1"]);
  });

  it("vínculo existente ausente do Google → exclui local", () => {
    const plan = reconcile(
      [local({ id: "l1", googleEventId: "g1", etag: "etag-1" })],
      [],
    );
    expect(plan.pullDeleteLocalIds).toEqual(["l1"]);
  });
});

describe("reconcile — conflito (última edição vence)", () => {
  const base = {
    id: "l1",
    googleEventId: "g1",
    etag: "etag-OLD",
    syncedAt: "2026-06-15T10:00:00Z",
  };

  it("Google mais recente vence → pullUpsert", () => {
    const plan = reconcile(
      [local({ ...base, updatedAt: "2026-06-15T11:00:00Z" })],
      [google({ id: "g1", etag: "etag-NEW", updated: "2026-06-15T12:00:00Z" })],
    );
    expect(plan.pullUpsert.map((e) => e.id)).toEqual(["g1"]);
    expect(plan.pushUpdate).toHaveLength(0);
  });

  it("local mais recente vence → pushUpdate", () => {
    const plan = reconcile(
      [local({ ...base, updatedAt: "2026-06-15T13:00:00Z" })],
      [google({ id: "g1", etag: "etag-NEW", updated: "2026-06-15T12:00:00Z" })],
    );
    expect(plan.pushUpdate.map((e) => e.id)).toEqual(["l1"]);
    expect(plan.pullUpsert).toHaveLength(0);
  });
});

describe("reconcile — idempotência", () => {
  it("em sincronia → plano vazio", () => {
    const plan = reconcile(
      [
        local({
          id: "l1",
          googleEventId: "g1",
          etag: "etag-1",
          syncedAt: "2026-06-15T12:00:00Z",
          updatedAt: "2026-06-15T12:00:00Z",
        }),
      ],
      [google({ id: "g1", etag: "etag-1" })],
    );
    expect(plan.pullUpsert).toHaveLength(0);
    expect(plan.pushUpdate).toHaveLength(0);
    expect(plan.pushCreate).toHaveLength(0);
    expect(plan.pullDeleteLocalIds).toHaveLength(0);
  });
});
