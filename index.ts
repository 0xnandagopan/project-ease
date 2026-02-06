import { UltraHonkBackend } from "@aztec/bb.js";
import { Noir } from "@noir-lang/noir_js";
import path from "path";
import fs from "fs";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  try {
    const circuit_path = path.join(
      __dirname,
      "circuits",
      "target",
      "circuit_name.json",
    );
    const circuit = JSON.parse(fs.readFileSync(circuit_path, "utf-8"));
    if (!circuit.bytecode) {
      throw new Error("CIRCUIT_ERR: bytecode not found");
    } else {
      console.log(" ## Setting up proving backend. ");
    }

    const noir = new Noir(circuit);
    const backend = new UltraHonkBackend(circuit.bytecode);
    const vkey = await backend.getVerificationKey({ keccakZK: true });
    if (!vkey) {
      throw new Error("VK_ERR: verification key not found");
    }

    const { VOLTA_KURIER_API, VOLTA_KURIER_URL } = process.env;
    if (!VOLTA_KURIER_API || !VOLTA_KURIER_URL) {
      throw new Error("ENV_ERR: missing environment variables");
    }

    const regParams = {
      proofType: "ultrahonk",
      proofOptions: { keccakZK: true },
      vk: Buffer.from(vkey).toString("hex"),
    };
    console.log(" ## Registering verification key. ");
    const regResponse = await axios.post(
      `${VOLTA_KURIER_URL}/register-vk/${VOLTA_KURIER_API}`,
      regParams,
    );
    const vkHash = regResponse.data.vkHash || regResponse.data.meta?.vkHash;
    console.log(" ## Verification key registered successfully.");
    console.log(`Verification key hash: ${vkHash}`);

    console.log(" ## Generating witness. ");
    const age = 23;
    const { witness } = await noir.execute({ age });

    console.log(" ## Generating proof. ");
    const proofData = await backend.generateProof(witness, { keccakZK: true });
    console.log(`Proof size: ${proofData.proof.length} bytes`);
    console.log(`Public inputs: ${proofData.publicInputs.length}`);
    const isValid = await backend.verifyProof(proofData);
    if (!isValid) {
      throw new Error("PROOF_ERR: proof is invalid");
    } else {
      console.log("Proof is valid");
    }

    const proofHex = Buffer.from(proofData.proof).toString("hex");
    const publicInputsHex = proofData.publicInputs.map((input) =>
      Buffer.from(input).toString("hex"),
    );

    // Step 3: Submit proof immediately
    const params = {
      proofType: "ultrahonk",
      vkRegistered: true,
      chainId: 11155111,
      proofData: {
        proof: proofHex,
        publicSignals: publicInputsHex,
        vk: vkHash,
      },
    };
    console.log(" ## Sending proof to Volta Kuriér. ");
    const requestResponse = await axios.post(
      `${VOLTA_KURIER_URL}/submit-proof/${VOLTA_KURIER_API}`,
      params,
    );
    console.log(requestResponse.data);

    if (requestResponse.data.optimisticVerify !== "success") {
      console.error("Proof verification, check proof artifacts");
      return;
    }

    while (true) {
      const jobStatusResponse = await axios.get(
        `${VOLTA_KURIER_URL}/job-status/${VOLTA_KURIER_API}/${requestResponse.data.jobId}`,
      );
      if (jobStatusResponse.data.status === "Aggregated") {
        console.log("Job aggregated successfully");
        console.log(jobStatusResponse.data);
        fs.writeFileSync(
          "aggregation.json",
          JSON.stringify({
            ...jobStatusResponse.data.aggregationDetails,
            aggregationId: jobStatusResponse.data.aggregationId,
          }),
        );
        break;
      } else {
        console.log("Job status: ", jobStatusResponse.data.status);
        console.log("Waiting for job to aggregated...");
        await new Promise((resolve) => setTimeout(resolve, 20000)); // Wait for 5 seconds before checking again
      }
    }
  } catch (error) {
    console.error(error);
  }
}

main();
