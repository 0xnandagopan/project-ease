import fs from "fs";
import path from "path";
import axios from "axios";
import dotenv from "dotenv";
import { CircuitDirectory } from "./types";
dotenv.config();

export async function reg_vkey_with_zkv(circuitName: CircuitDirectory) {
  try {
    const { KURIER_TESTNET_API, KURIER_TESTNET_URL } = process.env;
    if (!KURIER_TESTNET_API || !KURIER_TESTNET_URL) {
      throw new Error("[ERR_ENV]: Missing environment variables");
    }

    const ZKV_VK_HEX_FILE_PATH = path.join(
      __dirname,
      "circuits",
      "target",
      `${circuitName}_vk.hex`,
    );

    if (!fs.existsSync(ZKV_VK_HEX_FILE_PATH)) {
      throw new Error(`[ERR_FILE]: ${ZKV_VK_HEX_FILE_PATH} does not exist`);
    }
    const vkey = fs.readFileSync(ZKV_VK_HEX_FILE_PATH, "utf8");

    if (!vkey) {
      throw new Error(`[ERR_FILE]: ${ZKV_VK_HEX_FILE_PATH} is empty`);
    }

    const regParams = {
      proofType: "ultrahonk",
      vk: vkey.split("\n")[0],
      proofOptions: {
        variant: "ZK",
      },
    };

    const regResponse = await axios.post(
      `${KURIER_TESTNET_URL}/register-vk/${KURIER_TESTNET_API}`,
      regParams,
    );

    const path_to_vkHash = path.join(
      __dirname,
      "vkHashes",
      `${circuitName}_vkHash.json`,
    );

    fs.writeFileSync(path_to_vkHash, regResponse.data);

    if (fs.existsSync(path_to_vkHash)) {
      console.log(`## VK registered and saved to ${path_to_vkHash}`);
    } else {
      throw new Error(`[ERR_FILE]: ${path_to_vkHash} could not be saved`);
    }
  } catch (error) {
    console.error(error);
  }
}
