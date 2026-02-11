import { reg_vkey_with_zkv } from "./register_vk";
import { CircuitDirectory } from "./types";
import fs from "fs";
import path from "path";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

async function main(circuitName: CircuitDirectory) {
  try {
    const { KURIER_TESTNET_API, KURIER_TESTNET_URL } = process.env;
    if (!KURIER_TESTNET_API || !KURIER_TESTNET_URL) {
      throw new Error("[ERR_ENV]: Missing environment variables");
    }

    await reg_vkey_with_zkv(circuitName);

    const VK_HASH = path.join(
      __dirname,
      "vkHashes",
      `${circuitName}_vkHash.json`,
    );

    if (!fs.existsSync(VK_HASH)) {
      throw new Error(`[ERR_VK_HASH]: ${VK_HASH} does not exist`);
    }
    const vk = JSON.parse(fs.readFileSync(VK_HASH, "utf8"));

    const ZKV_PROOF_HEX_FILE_PATH = path.join(
      __dirname,
      "circuits",
      "target",
      `${circuitName}_proof.hex`,
    );
    if (!fs.existsSync(ZKV_PROOF_HEX_FILE_PATH)) {
      throw new Error(
        `[ERR_ZKV_PROOF]: ${ZKV_PROOF_HEX_FILE_PATH} does not exist`,
      );
    }
    const proofFile = fs.readFileSync(ZKV_PROOF_HEX_FILE_PATH, "utf8");
    const proof = JSON.parse(proofFile);

    const ZKV_PUBS_HEX_FILE_PATH = path.join(
      __dirname,
      "circuits",
      "target",
      `${circuitName}_pubs.hex`,
    );
    if (!fs.existsSync(ZKV_PUBS_HEX_FILE_PATH)) {
      throw new Error(
        `[ERR_ZKV_PUBS]: ${ZKV_PUBS_HEX_FILE_PATH} does not exist`,
      );
    }
    const publicSignalsFile = fs.readFileSync(ZKV_PUBS_HEX_FILE_PATH, "utf8");
    const publicSignals = JSON.parse(publicSignalsFile);

    console.log("## Verifying Proof w/ ZKV");
    const proof_payload = {
      proofType: "ultrahonk",
      vkRegistered: true,
      chainId: 84532,
      proofData: {
        proof: proof.ZK,
        publicSignals: publicSignals,
        vk: vk.vkHash || vk.meta.vkHash,
      },
      proofOptions: {
        variant: "ZK",
      },
    };

    const proof_response = await axios.post(
      `${KURIER_TESTNET_URL}/submit-proof/${KURIER_TESTNET_API}`,
      proof_payload,
    ).catch((error) => {
      if (error.response) {
        console.error("API Error:", error.response.status);
        console.error("Details:", JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    });
    console.log("Proof submission response:", JSON.stringify(proof_response.data, null, 2));
    
    const job_id = proof_response.data.jobId;
    console.log(`##Job ID: ${job_id}`);

    while (true) {
      const job_status_response = await axios.get(
        `${KURIER_TESTNET_URL}/job-status/${KURIER_TESTNET_API}/${job_id}`,
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
          `${job_id}.json`,
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
    
    console.log("## Proof verification completed successfully!");
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

main(CircuitDirectory.CIRCUIT_NAME);
