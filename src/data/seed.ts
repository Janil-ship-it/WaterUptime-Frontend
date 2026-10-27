// Synthetic demo data. Every person, facility and record here is fictional.
// The chain state is produced by running the real workflow functions, so the
// seed can never contain a state the contract would reject.

import type {
  Address,
  ChainState,
  Hex32,
  OffchainRecord,
  OffchainState,
  Person,
  WaterPointMeta,
} from "../domain/types";
import * as wf from "../domain/workflow";

/** Deterministic fake 32-byte hex for seed fingerprints (not cryptographic). */
function seedHex(label: string): Hex32 {
  let out = "";
  let h = 2166136261;
  for (let round = 0; out.length < 64; round++) {
    for (const ch of `${label}#${round}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    out += h.toString(16).padStart(8, "0");
  }
  return out.slice(0, 64);
}

/** Obviously-synthetic account address for a demo person. */
function demoAddress(tag: string): Address {
  const base32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const hex = seedHex(`addr:${tag}`);
  let body = "";
  for (let i = 0; body.length < 50; i++) body += base32[parseInt(hex.slice(i % 60, (i % 60) + 2), 16) % 32];
  return `GDEMO${body}`.slice(0, 56);
}

const people: Person[] = [
  { address: demoAddress("coord"), name: "Babatunde Lawal", role: "coordinator", title: "Programme coordinator" },
  { address: demoAddress("rep1"), name: "Amina Garba", role: "reporter", title: "Water committee monitor" },
  { address: demoAddress("rep2"), name: "Haruna Bello", role: "reporter", title: "Water committee monitor" },
  { address: demoAddress("tech1"), name: "Musa Danladi", role: "technician", title: "Field technician" },
  { address: demoAddress("tech2"), name: "Emmanuel Okafor", role: "technician", title: "Field technician" },
  { address: demoAddress("tech3"), name: "Aisha Mohammed", role: "technician", title: "Field technician" },
  { address: demoAddress("ver1"), name: "Zainab Aliyu", role: "verifier", title: "Independent verifier" },
  { address: demoAddress("ver2"), name: "Al-Hassan Umar", role: "verifier", title: "Independent verifier" },
];

const byName = (name: string): Address => {
  const p = people.find((x) => x.name === name);
  if (!p) throw new Error(`unknown seed person ${name}`);
  return p.address;
};

const COORD = byName("Babatunde Lawal");

const points: (WaterPointMeta & { key: string })[] = [
  { key: "082", code: "WP-DEMO-082", name: "Tudun Wada solar borehole", facilityType: "Solar borehole", locality: "Kaduna South" },
  { key: "114", code: "WP-DEMO-114", name: "Rigasa market handpump", facilityType: "Handpump", locality: "Igabi" },
  { key: "019", code: "WP-DEMO-019", name: "Ungwan Rimi borehole", facilityType: "Motorised borehole", locality: "Kaduna North" },
  { key: "309", code: "WP-DEMO-309", name: "Makarfi clinic pump", facilityType: "Solar borehole", locality: "Makarfi" },
  { key: "204", code: "WP-DEMO-204", name: "City gate standpipe", facilityType: "Public standpipe", locality: "Zaria" },
  { key: "412", code: "WP-DEMO-412", name: "Sabon Tasha community well", facilityType: "Handpump", locality: "Chikun" },
  { key: "521", code: "WP-DEMO-521", name: "Giwa community standpipe", facilityType: "Public standpipe", locality: "Giwa" },
  { key: "071", code: "WP-DEMO-071", name: "Kubau farm station", facilityType: "Solar borehole", locality: "Kubau" },
];

const pointId = (key: string) => seedHex(`wp:${key}`);

export function buildSeed(nowSeconds: number): { chain: ChainState; offchain: OffchainState } {
  const records: Record<Hex32, OffchainRecord> = {};
  const waterPointMeta: Record<Hex32, WaterPointMeta> = {};
  let s: ChainState = { admin: COORD, reporters: [], waterPoints: {}, jobs: {}, history: {} };
  const ago = (hours: number) => Math.round(nowSeconds - hours * 3600);

  const rec = (label: string, r: OffchainRecord): Hex32 => {
    const hash = seedHex(label);
    records[hash] = r;
    return hash;
  };

  for (const p of people.filter((x) => x.role === "reporter")) s = wf.setReporter(s, COORD, p.address, true);

  for (const { key, ...meta } of points) {
    const metaHash = rec(`meta:${key}`, { kind: "metadata", summary: `${meta.name}, ${meta.locality}` });
    s = wf.registerWaterPoint(s, COORD, pointId(key), metaHash);
    waterPointMeta[pointId(key)] = meta;
  }
  s = wf.setWaterPointActive(s, COORD, pointId("071"), false);

  const report = (key: string, reporter: string, hours: number, r: Omit<OffchainRecord, "kind">) => {
    const out = wf.reportFault(s, byName(reporter), pointId(key), rec(`fault:${key}:${hours}`, { kind: "fault", ...r }), ago(hours));
    s = out.state;
    return out.jobId;
  };
  const assign = (id: number, tech: string, ver: string, hours: number) => {
    s = wf.assignJob(s, COORD, id, byName(tech), byName(ver), ago(hours));
  };
  const submit = (id: number, tech: string, hours: number, summary: string, detail?: string) => {
    s = wf.submitRepair(s, byName(tech), id, rec(`repair:${id}:${hours}`, { kind: "repair", summary, detail }), ago(hours));
  };
  const verify = (id: number, ver: string, hours: number, approved: boolean, summary: string, category?: string) => {
    s = wf.verifyRepair(s, byName(ver), id, rec(`verify:${id}:${hours}`, { kind: "verification", summary, category }), approved, ago(hours));
  };

  // Job 1: closed after one rework cycle (older history).
  const j1 = report("204", "Haruna Bello", 240, { summary: "Standpipe tap assembly leaking at base", priority: "medium" });
  assign(j1, "Aisha Mohammed", "Zainab Aliyu", 236);
  submit(j1, "Aisha Mohammed", 200, "Replaced tap assembly and washer");
  verify(j1, "Zainab Aliyu", 196, false, "Leak persists at the union joint; reseal and resubmit with a flow test.", "Improper component installation");
  submit(j1, "Aisha Mohammed", 170, "Resealed union joint; 10-minute flow test with no leak");
  verify(j1, "Zainab Aliyu", 160, true, "Joint dry after 10-minute flow test. Repair accepted.");
  s = wf.closeJob(s, COORD, j1, ago(150));

  // Job 2: awaiting verification.
  const j2 = report("521", "Amina Garba", 50, { summary: "No water at standpipe; meter display blank", priority: "high" });
  assign(j2, "Emmanuel Okafor", "Al-Hassan Umar", 47);
  submit(j2, "Emmanuel Okafor", 2, "Replaced faulty meter sensor; flow restored and checked with a timed bucket test", "Timed bucket test: 20 litres in 15 seconds at the main tap.");

  // Job 3: rework requested.
  const j3 = report("412", "Haruna Bello", 70, { summary: "Handpump handle broken; very hard to pump", priority: "high" });
  assign(j3, "Musa Danladi", "Zainab Aliyu", 66);
  submit(j3, "Musa Danladi", 30, "Replaced handle and fulcrum pin");
  verify(j3, "Zainab Aliyu", 1, false, "Bearing wear still visible; replace bearing and add a photo of the fitted part.", "Incomplete evidence");

  // Job 4: assigned, repair in progress off-chain.
  const j4 = report("082", "Amina Garba", 26, { summary: "Pump stopped; loud grinding before failure", priority: "urgent" });
  assign(j4, "Musa Danladi", "Al-Hassan Umar", 20);

  // Job 5: newly reported, awaiting triage.
  report("309", "Haruna Bello", 3, { summary: "No outflow at clinic pump since morning", priority: "urgent" });

  // Job 6: verified, waiting for the coordinator to close.
  const j6 = report("019", "Amina Garba", 90, { summary: "Low flow from borehole", priority: "low" });
  assign(j6, "Emmanuel Okafor", "Zainab Aliyu", 86);
  submit(j6, "Emmanuel Okafor", 12, "Cleaned intake screen; flow back to normal");
  verify(j6, "Zainab Aliyu", 5, true, "Flow confirmed at the tap. Repair accepted.");

  // Job 7: duplicate report, cancelled by the coordinator.
  const j7 = report("114", "Haruna Bello", 40, { summary: "Handpump not working", priority: "medium" });
  s = wf.cancelJob(s, COORD, j7, rec(`cancel:${j7}`, { kind: "cancellation", summary: "Duplicate: fault was already fixed the same day by the community caretaker." }), ago(38));

  return {
    chain: s,
    offchain: {
      people: Object.fromEntries(people.map((p) => [p.address, p])),
      waterPoints: waterPointMeta,
      records,
    },
  };
}
