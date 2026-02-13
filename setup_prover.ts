import { Noir, CompiledCircuit } from "@noir-lang/noir_js";
import { UltraHonkBackend } from "@aztec/bb.js";
import { CircuitDir } from "./types";
import fs from "fs";
import path from "path";

export function setupProver(circuit_name: CircuitDir): {
  noir: Noir;
  backend: UltraHonkBackend;
} {
  const PATH_TO_CIRCUIT = path.join(
    __dirname,
    "circuits",
    "target",
    `${circuit_name}.json`,
  );

  if (!fs.existsSync(PATH_TO_CIRCUIT)) {
    throw new Error(`[ERR: Circuits] Circuit file not found`);
  }

  const circuit = JSON.parse(fs.readFileSync(PATH_TO_CIRCUIT, "utf8"));
  if (!circuit.bytecode) {
    throw new Error(`[ERR: Circuits] Circuit bytecode not found`);
  }

  console.log("## Setting up Noir and Barretenberg");
  const noir = new Noir(circuit as CompiledCircuit);
  const backend = new UltraHonkBackend(circuit.bytecode);
  return { noir, backend };
}
