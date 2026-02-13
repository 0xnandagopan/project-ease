import { CircuitDir } from "./types";
import path from "path";
import fs from "fs";

interface AbiParameter {
  name: string;
  type: { kind: string };
  visibility: string;
}

interface CircuitAbi {
  parameters: AbiParameter[];
  return_type: any;
  error_types: Record<string, any>;
}

interface CircuitJson {
  noir_version: string;
  hash: string;
  abi: CircuitAbi;
  bytecode: string;
  debug_symbols: string;
  file_map: Record<string, any>;
  names: string[];
  brillig_names: string[];
}

export function deflattenFields(flattenedFields: Uint8Array): string[] {
  const publicInputSize = 32;
  const chunkedFlattenedPublicInputs: Uint8Array[] = [];

  for (let i = 0; i < flattenedFields.length; i += publicInputSize) {
    const publicInput = flattenedFields.slice(i, i + publicInputSize);
    chunkedFlattenedPublicInputs.push(publicInput);
  }

  return chunkedFlattenedPublicInputs.map(uint8ArrayToHex);
}

export function flattenFieldsAsArray(fields: string[]): Uint8Array {
  const flattenedPublicInputs = fields.map(hexToUint8Array);
  return flattenUint8Arrays(flattenedPublicInputs);
}

export function flattenUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((acc, val) => acc + val.length, 0);
  const result = new Uint8Array(totalLength);

  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }

  return result;
}

export function uint8ArrayToHex(buffer: Uint8Array): string {
  const hex: string[] = [];

  buffer.forEach(function (i) {
    let h = i.toString(16);
    if (h.length % 2) {
      h = "0" + h;
    }
    hex.push(h);
  });

  return "0x" + hex.join("");
}

export function hexToUint8Array(hex: string): Uint8Array {
  const sanitisedHex = BigInt(hex).toString(16).padStart(64, "0");

  const len = sanitisedHex.length / 2;
  const u8 = new Uint8Array(len);

  let i = 0;
  let j = 0;
  while (i < len) {
    u8[i] = parseInt(sanitisedHex.slice(j, j + 2), 16);
    i += 1;
    j += 2;
  }

  return u8;
}

export function loadCircuitAbi(circuit_name: CircuitDir): CircuitAbi {
  const circuitPath = path.join(
    __dirname,
    "circuits",
    "target",
    `${circuit_name}.json`,
  );

  if (!fs.existsSync(circuitPath)) {
    throw new Error(`Circuit file not found: ${circuitPath}`);
  }

  const circuitData: CircuitJson = JSON.parse(
    fs.readFileSync(circuitPath, "utf-8"),
  );
  if (!circuitData.abi) {
    throw new Error(`[ERR: Circuit] Circuit ABI not found`);
  }

  return circuitData.abi;
}

export function extractAbiParameters(
  input: any,
  abi: CircuitAbi,
): Record<string, any> {
  const extractedParams: Record<string, any> = {};

  for (const param of abi.parameters) {
    if (!(param.name in input)) {
      throw new Error(
        `[ERR: Circuit] Missing required parameter: ${param.name} (${param.visibility})`,
      );
    }
    extractedParams[param.name] = input[param.name];
  }

  return extractedParams;
}

export function validateAbiInput(input: any, abi: CircuitAbi): void {
  if (typeof input !== "object" || input === null) {
    throw new Error("Input must be an object");
  }

  const requiredParams = abi.parameters.map((p) => p.name);
  const providedParams = Object.keys(input);

  const missing = requiredParams.filter((p) => !providedParams.includes(p));

  if (missing.length > 0) {
    throw new Error(
      `[ERR: Circuit] Missing required circuit input parameters: ${missing.join(", ")}`,
    );
  }
}
