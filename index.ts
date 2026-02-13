import { CircuitDir } from "./types";
import { setupProver } from "./setup_prover";
import { registerVk } from "./register_vk";
import fs from "fs";
import path from "path";
import axios from "axios";
import dotenv from "dotenv";
import {
  extractAbiParameters,
  loadCircuitAbi,
  uint8ArrayToHex,
  validateAbiInput,
} from "./utils";
import console from "console";
dotenv.config();

export async function verifyKurier(
  circuit_name: CircuitDir,
  inputs: Record<string, any>,
) {
  try {
    const { KURIER_URL, KURIER_API } = process.env;
    if (!KURIER_URL || !KURIER_API) {
      throw new Error("[ERR: Env] Missing environment variables");
    }

    const VK_HASH_PATH = path.join(
      __dirname,
      "circuits",
      "target",
      `${circuit_name}_vkHash.json`,
    );
    if (!fs.existsSync(VK_HASH_PATH)) {
      console.log(
        "[WARN: Verification Key] VK hash not found, registering new VK",
      );
      await registerVk(circuit_name);
    }
    const vkey = JSON.parse(fs.readFileSync(VK_HASH_PATH, "utf8"));
    const vkHash = vkey.vkHash || vkey.meta.vkHash;
    if (!vkHash) {
      throw new Error("[ERR: ZKV] Verification key not found");
    }
    console.log(`## vkHash found: ${vkHash}`);

    const { noir, backend } = setupProver(circuit_name);

    console.log("## Extracting parameters and matching inpus");
    const abi = loadCircuitAbi(circuit_name);
    validateAbiInput(inputs, abi);
    const params = extractAbiParameters(inputs, abi);
    console.log("## Creating pivate witness");
    const { witness } = await noir.execute(params);

    console.log("## Generating Proof");
    const proof_data = await backend.generateProof(witness, {
      keccak: true,
    });

    const PATH_TO_PROOF_HEX = path.join(
      __dirname,
      "circuits",
      "target",
      `${circuit_name}_proof.hex`,
    );

    const proofHex = uint8ArrayToHex(proof_data.proof);
    const formattedPublicInputs = proof_data.publicInputs.map((pi) =>
      pi.startsWith("0x") ? pi : `0x${pi}`,
    );

    fs.writeFileSync(PATH_TO_PROOF_HEX, proofHex);
    if (!fs.existsSync(PATH_TO_PROOF_HEX)) {
      throw new Error("[ERR: Proof] Failed to write proof to file");
    }

    console.log("## Verifying Proof w/ BB.js");
    const is_valid = await backend.verifyProof(proof_data, { keccak: true });
    if (!is_valid) {
      throw new Error("[ERR: Proof] Proof verification failed");
    }

    const proof_payload = {
      proofType: "ultrahonk",
      vkRegistered: true,
      proofOptions: {
        variant: "zk",
      },
      proofData: {
        proof: proofHex,
        publicSignals: formattedPublicInputs,
        vk: vkHash as string,
      },
      submissionMode: "attestation",
    };

    fs.writeFileSync(
      "./payloads_and_respones/proof_payload.json",
      JSON.stringify(proof_payload),
    );

    console.log("## Submitting Proof to Kurier");
    const submit_response = await axios.post(
      `${KURIER_URL}/submit-proof/${KURIER_API}`,
      proof_payload,
    );

    console.log("Proof response status code:", submit_response.status);

    const path_to_submit_proof_response = path.join(
      __dirname,
      "payloads_and_respones",
      "proof_response.json",
    );

    fs.writeFileSync(
      path_to_submit_proof_response,
      JSON.stringify(submit_response.data),
    );

    console.log(
      `==> Submit Response:\n`,
      JSON.stringify(submit_response.data, null, 2),
    );
    if (submit_response.data.optimisticVerify !== "success") {
      throw new Error(
        "[ERR: Proof Verification] Optimistic verification failed",
      );
    }

    const jobId = submit_response.data.jobId;
    console.log(`## Proof submitted successfully. Job ID: ${jobId}`);

    while (true) {
      const job_status_response = await axios.get(
        `${KURIER_URL}/job-status/${KURIER_API}/${jobId}`,
      );
      if (job_status_response.data.status === "Aggregated") {
        console.log("##Job aggregated successfully");
        console.log(job_status_response.data);

        // Create aggregations directory if it doesn't exist
        const aggregations_dir = path.join(__dirname, "aggregations");
        if (!fs.existsSync(aggregations_dir)) {
          fs.mkdirSync(aggregations_dir, { recursive: true });
        }

        const aggregation_path = path.join(
          aggregations_dir,
          `${job_status_response.data.aggregation_id}.json`,
        );
        fs.writeFileSync(
          aggregation_path,
          JSON.stringify(job_status_response.data, null, 2),
        );
        console.log(`## Aggregation result saved to ${aggregation_path}`);
        break; // Exit loop after successful aggregation
      } else if (job_status_response.data.status === "Failed") {
        console.error("##Job failed:", job_status_response.data);
        throw new Error("[ERR: ZKV] Proof aggregation failed");
      } else {
        console.log("##Job status: ", job_status_response.data.status);
        console.log(`==> Waiting for job to be aggregated...`);
        await new Promise((resolve) => setTimeout(resolve, 20000)); // Wait for 20 seconds before checking again
      }
    }
  } catch (error) {
    console.error(`Error verifying proof with Kurier:\n`, error);
  }
}
