import { UltraHonkBackend } from "@aztec/bb.js";
import { CompiledCircuit, Noir } from "@noir-lang/noir_js";
import circuit from "./circuits/target/circuit_name.json";
import { uint8ArrayToHex, flattenFieldsAsArray } from "./utils";
import fs from "fs";
import path from "path";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  try {
    if (!circuit.bytecode) {
      throw new Error("[ERR: Circuit] Circuit bytecode not found");
    }

    console.log("## Setting up Noir and Barretenberg");
    const noir = new Noir(circuit as CompiledCircuit);
    const backend = new UltraHonkBackend(circuit.bytecode);

    console.log("## Generating Verification Key");
    const verification_key = await backend.getVerificationKey({ keccak: true });
    if (!verification_key) {
      throw new Error("[ERR: Verification Key] Verification key not found");
    }
    const vkey = uint8ArrayToHex(verification_key);
    const path_to_vkey = path.join(
      __dirname,
      "circuits",
      "target",
      "circuit_name_vkey.hex",
    );
    fs.writeFileSync(path_to_vkey, vkey);

    const regParams = {
      proofType: "ultrahonk",
      proofOptions: {
        variant: "ZK",
      },
      vk: `${vkey}`,
    };

    const { KURIER_API, KURIER_URL } = process.env;
    if (!KURIER_API || !KURIER_URL) {
      throw new Error("[ERR: Env] Missing environment variables");
    }

    console.log("## Registering Verification Key with Kurier");
    const regResponse = await axios.post(
      `${KURIER_URL}/register-vk/${KURIER_API}`,
      regParams,
    );
    const circuit_name: string = "circuit_name";
    const reg_key_path = path.join(
      __dirname,
      "kurier_vkey",
      `${circuit_name}_vk.json`,
    );
    fs.writeFileSync(reg_key_path, JSON.stringify(regResponse.data));

    const vk = JSON.parse(fs.readFileSync(reg_key_path, "utf8"));
    const zk_vkey = vk.vkHash || vk.meta.vkHash;
    if (!zk_vkey) {
      throw new Error("[ERR: ZKV] Verification key not found");
    }

    console.log("## Creating the private witness");
    const age = 56;
    const { witness } = await noir.execute({ age });

    console.log("## Generating Proof");
    const proof_data = await backend.generateProof(witness, { keccak: true });
    const proof = uint8ArrayToHex(proof_data.proof);
    const public_inputs = uint8ArrayToHex(
      flattenFieldsAsArray(proof_data.publicInputs),
    );

    const path_to_proof = path.join(
      __dirname,
      "circuits",
      "target",
      "circuit_name_proof.hex",
    );
    fs.writeFileSync(path_to_proof, proof);

    const path_to_public_inputs = path.join(
      __dirname,
      "circuits",
      "target",
      "circuit_name_public_inputs.hex",
    );
    fs.writeFileSync(path_to_public_inputs, public_inputs);

    console.log("## Verifying Proof w/ BB.js");
    const is_valid = await backend.verifyProof(proof_data, { keccak: true });
    if (!is_valid) {
      throw new Error("[ERR: Proof] Proof verification failed");
    }

    console.log("## Verifying Proof w/ ZKV");
    const proof_payload = {
      proofType: "ultrahonk",
      vkRegistered: true,
      chainId: 84532,
      proofData: {
        proof: proof,
        publicSignals: proof_data.publicInputs,
        vk: zk_vkey,
      },
      proofOptions: {
        variant: "ZK",
      },
    };

    const proof_response = await axios.post(
      `${KURIER_URL}/submit-proof/${KURIER_API}`,
      proof_payload,
    );
    console.log("Proof response status code:", proof_response.status);

    const path_to_submit_proof_response = path.join(
      __dirname,
      "proof_response.json",
    );

    fs.writeFileSync(
      path_to_submit_proof_response,
      JSON.stringify(proof_response.data),
    );

    if (proof_response.data.optimisticVerify !== "success") {
      throw new Error("[ERR: ZKV] Proof verification failed");
    }
    console.log("Proof verified successfully");

    const job_id = proof_response.data.jobId;
    console.log(`##Job ID: ${job_id}`);

    while (true) {
      const job_status_response = await axios.get(
        `${KURIER_URL}/job-status/${KURIER_API}/${job_id}`,
      );
      if (job_status_response.data.status === "Aggregated") {
        console.log("##Job aggregated successfully");
        console.log(job_status_response.data);
        const aggregation_path = path.join(
          __dirname,
          "aggregations",
          `${job_id}.json`, // job_status_response.data.aggregationId
        );
        fs.writeFileSync(
          aggregation_path,
          JSON.stringify(job_status_response.data),
        );
      } else {
        console.log("##Job status: ", job_status_response.data.status);
        console.log(`\n..Waiting for job to aggregated...\n`);
        await new Promise((resolve) => setTimeout(resolve, 20000)); // Wait for 5 seconds before checking again
      }
    }
  } catch (error) {
    console.error(error);
  }
}

main();
