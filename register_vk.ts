import { CircuitDir } from "./types";
import { setupProver } from "./setup_prover";
import fs from "fs";
import path from "path";
import axios from "axios";
import dotenv from "dotenv";
import { uint8ArrayToHex } from "./utils";
dotenv.config();

export async function registerVk(circuit_name: CircuitDir) {
  try {
    const { KURIER_URL, KURIER_API } = process.env;
    if (!KURIER_URL || !KURIER_API) {
      throw new Error("[ERR: Env] Missing environment variables");
    }

    const { backend } = setupProver(circuit_name);

    console.log("## Generating Verification Key");

    const VK_HEX_PATH = path.join(
      __dirname,
      "circuits",
      "target",
      `${circuit_name}_vk.hex`,
    );

    const verification_key = await backend.getVerificationKey({ keccak: true });

    if (!verification_key) {
      throw new Error("[ERR: Verification Key] Verification key not found");
    }
    const vkey = uint8ArrayToHex(verification_key);
    fs.writeFileSync(VK_HEX_PATH, vkey);
    if (!fs.existsSync(VK_HEX_PATH)) {
      throw new Error(
        "[ERR: Verification Key] Failed to write verification key hex file",
      );
    }

    const vk_payload = {
      proofType: "ultrahonk",
      proofOptions: {
        variant: "ZK",
      },
      vk: `${vkey}`,
    };
    fs.writeFileSync("regVk_payload.json", JSON.stringify(vk_payload));
    

    console.log("## Registering Verification Key at Kurier");
    const reg_vk_response = await axios.post(
      `${KURIER_URL}/register-vk/${KURIER_API}`,
      vk_payload,
    );

    const VK_HASH_PATH = path.join(
      __dirname,
      "circuits",
      "target",
      `${circuit_name}_vkHash.json`,
    );
    fs.writeFileSync(VK_HASH_PATH, JSON.stringify(reg_vk_response.data));
    if (!fs.existsSync(VK_HASH_PATH)) {
      throw new Error(
        "[ERR: Verification Key] Failed to write verification key hash file",
      );
    }
    console.log(
      `## Kurier vkHash for ${circuit_name} circuit written to ${VK_HASH_PATH}`,
    );
  } catch (error) {
    console.error(error);
  }
}
