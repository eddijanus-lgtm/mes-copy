import test from "node:test";
import assert from "node:assert/strict";
import { emptyMachineProfile, normalizeProfileDocument, sortedRoutingPreview, validateProfileDraft } from "./machineProfileConfig.js";

test("new profiles always start in observe", () => {
  assert.equal(emptyMachineProfile({ machineId: "plc-1" }).operatingMode, "observe");
});

test("route preview includes only enabled routable stations and sorts them", () => {
  const stations = [
    { stationId: "b", enabled: true, capabilities: ["routing"], routing: { enabled: true, sequence: 2 } },
    { stationId: "disabled", enabled: false, capabilities: ["routing"], routing: { enabled: true, sequence: 1 } },
    { stationId: "a", enabled: true, capabilities: ["routing"], routing: { enabled: true, sequence: 1 } },
  ];
  assert.deepEqual(sortedRoutingPreview(stations).map((station) => station.stationId), ["a", "b"]);
});

test("draft validation reports duplicate IDs, routing sequences and cycles", () => {
  const stations = [
    { stationId: "same", resourceId: 1, parentResourceId: 2, enabled: true, capabilities: ["routing"], routing: { enabled: true, sequence: 1 } },
    { stationId: "same", resourceId: 2, parentResourceId: 1, enabled: true, capabilities: ["routing"], routing: { enabled: true, sequence: 1 } },
  ];
  const errors = validateProfileDraft({ stations }).join(" ");
  assert.match(errors, /Stations-ID/);
  assert.match(errors, /Routing-Sequenz/);
  assert.match(errors, /Hierarchiezyklus/);
});

test("station connections stay independent from the legacy profile connection", () => {
  const source = emptyMachineProfile();
  source.connection.endpointUrl = "opc.tcp://legacy:4840";
  source.stations = [{
    stationId: "station-1",
    resourceId: 1,
    signals: [],
    connection: { ...source.connection, endpointUrl: "opc.tcp://station-1:4840" },
  }];
  const normalized = normalizeProfileDocument(source);
  normalized.stations[0].connection.endpointUrl = "opc.tcp://changed:4840";
  assert.equal(normalized.connection.endpointUrl, "opc.tcp://legacy:4840");
});
