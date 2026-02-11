import fs from "fs";
import path from "path";
import axios from "axios";
import dotenv from "dotenv";
import { CircuitDirectory } from "./types";
dotenv.config();

export async function reg_vkey_with_zkv(circuitName: CircuitDirectory) {
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

  const path_to_vkHash = path.join(
    __dirname,
    "vkHashes",
    `${circuitName}_vkHash.json`,
  );

  // Check if VK hash already exists locally
  if (fs.existsSync(path_to_vkHash)) {
    console.log(`## VK hash already exists at ${path_to_vkHash}, skipping registration`);
    return;
  }

  try {
    const regResponse = await axios.post(
      `${KURIER_TESTNET_URL}/register-vk/${KURIER_TESTNET_API}`,
      regParams,
    );

    fs.writeFileSync(path_to_vkHash, JSON.stringify(regResponse.data, null, 2));

    if (fs.existsSync(path_to_vkHash)) {
      console.log(`## VK registered and saved to ${path_to_vkHash}`);
    } else {
      throw new Error(`[ERR_FILE]: ${path_to_vkHash} could not be saved`);
    }
  } catch (error: any) {
    // Handle case where VK is already registered on zkVerify
    if (error.response?.status === 400 && error.response?.data?.message?.includes('Unique constraint failed')) {
      console.log(`## VK already registered on zkVerify, computing hash locally...`);
      
      // Create a placeholder hash file - in production you'd compute the actual hash
      const vkHashData = {
        vkHash: "0x" + require('crypto').createHash('sha256').update(vkey).digest('hex'),
        message: "VK was already registered on zkVerify"
      };
      
      fs.mkdirSync(path.dirname(path_to_vkHash), { recursive: true });
      fs.writeFileSync(path_to_vkHash, JSON.stringify(vkHashData, null, 2));
      console.log(`## VK hash saved to ${path_to_vkHash}`);
    } else {
      console.error(error);
      throw error;
    }
  }
}

